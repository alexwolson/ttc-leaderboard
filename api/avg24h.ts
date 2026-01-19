export type LiveRouteSample = {
    routeTag: string;
    liveSpeedKmh: number;
};

type SpeedSample = {
    t: number; // timestamp (ms since epoch)
    v: number; // speed (km/h)
};

const WINDOW_MS = 24 * 60 * 60 * 1000;
const SAMPLE_INTERVAL_MS = 60 * 1000; // sample at most once per minute

// Serverless safeguards:
// - Keep sample history bounded so per-route payloads don't grow unbounded.
// - Chunk KV multi-gets and pipeline writes to avoid large request payloads / URL length limits.
const MAX_SAMPLES_PER_ROUTE = Math.ceil(WINDOW_MS / SAMPLE_INTERVAL_MS) + 2;
const KV_MGET_CHUNK_SIZE = 100;
const KV_SET_OPS_PER_PIPELINE = 200;

const KV_LAST_BUCKET_KEY = 'ttc:avg24h:lastBucketMs';
const KV_SAMPLES_KEY_PREFIX = 'ttc:avg24h:samples:';
const KV_AVG_KEY_PREFIX = 'ttc:avg24h:avg:';

type KvPipeline = {
    set: (key: string, value: string) => KvPipeline;
    exec: () => Promise<unknown>;
};

type KvClient = {
    get: (key: string) => Promise<unknown>;
    mget: (...keys: string[]) => Promise<unknown[]>;
    set: (key: string, value: string) => Promise<unknown>;
    pipeline?: () => KvPipeline;
};

function toBucketMs(nowMs: number): number {
    return Math.floor(nowMs / SAMPLE_INTERVAL_MS) * SAMPLE_INTERVAL_MS;
}

function asNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

function parseSamples(raw: unknown): SpeedSample[] {
    if (!raw) return [];

    let parsed: unknown = raw;
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw) as unknown;
        } catch {
            return [];
        }
    }

    if (!Array.isArray(parsed)) return [];

    const out: SpeedSample[] = [];
    for (const item of parsed) {
        // Current encoding (serverless-optimized): [t, v]
        if (Array.isArray(item)) {
            const t = asNumber(item[0]);
            const v = asNumber(item[1]);
            if (t === null || v === null) continue;
            out.push({ t, v });
            continue;
        }

        // Back-compat encoding: { t, v }
        if (!item || typeof item !== 'object') continue;
        const t = asNumber((item as Record<string, unknown>).t);
        const v = asNumber((item as Record<string, unknown>).v);
        if (t === null || v === null) continue;
        out.push({ t, v });
    }
    return out;
}

function serializeSamples(samples: SpeedSample[]): string {
    // Compact encoding to keep KV payloads small: store as tuples rather than objects.
    const tuples: Array<[number, number]> = samples.map((s) => [s.t, s.v]);
    return JSON.stringify(tuples);
}

function trimAndUpsert(samples: SpeedSample[], cutoffMs: number, sample: SpeedSample): SpeedSample[] {
    // Keep only last-24h window, and ensure at most one sample per bucket.
    const kept = samples.filter((s) => Number.isFinite(s.t) && Number.isFinite(s.v) && s.t >= cutoffMs);
    const withoutBucket = kept.filter((s) => s.t !== sample.t);
    withoutBucket.push(sample);
    withoutBucket.sort((a, b) => a.t - b.t);

    // Hard cap to avoid runaway payload size (serverless safeguard).
    if (withoutBucket.length > MAX_SAMPLES_PER_ROUTE) {
        return withoutBucket.slice(-MAX_SAMPLES_PER_ROUTE);
    }
    return withoutBucket;
}

function compute24hAvgKmh(samples: SpeedSample[], nowMs: number, cutoffMs: number): number | null {
    if (samples.length === 0) return null;
    const sorted = [...samples].sort((a, b) => a.t - b.t);

    let weightedSum = 0;
    let totalWeight = 0;

    for (let i = 0; i < sorted.length; i++) {
        const s = sorted[i];
        const start = Math.max(s.t, cutoffMs);
        if (start > nowMs) continue;

        // Treat each sample as representative for its interval bucket only.
        const nextT = sorted[i + 1]?.t ?? Number.POSITIVE_INFINITY;
        const end = Math.min(nowMs, Math.min(nextT, s.t + SAMPLE_INTERVAL_MS));
        const durationMs = end - start;
        if (durationMs <= 0) continue;

        weightedSum += s.v * durationMs;
        totalWeight += durationMs;
    }

    if (totalWeight <= 0) return null;
    return weightedSum / totalWeight;
}

function round1(n: number): number {
    return Math.round(n * 10) / 10;
}

function sampleKey(routeTag: string): string {
    return `${KV_SAMPLES_KEY_PREFIX}${routeTag}`;
}

function avgKey(routeTag: string): string {
    return `${KV_AVG_KEY_PREFIX}${routeTag}`;
}

function chunk<T>(items: T[], size: number): T[][] {
    if (size <= 0) return [items];
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size));
    }
    return out;
}

async function mgetChunked(client: KvClient, keys: string[]): Promise<unknown[]> {
    if (keys.length === 0) return [];
    const out: unknown[] = [];
    for (const part of chunk(keys, KV_MGET_CHUNK_SIZE)) {
        const values = (await client.mget(...part)) as unknown[];
        out.push(...values);
    }
    return out;
}

async function setManyChunked(client: KvClient, kvSets: Array<[string, string]>): Promise<void> {
    if (kvSets.length === 0) return;

    const pipelineFactory = typeof client.pipeline === 'function' ? client.pipeline : null;
    if (pipelineFactory) {
        for (const part of chunk(kvSets, KV_SET_OPS_PER_PIPELINE)) {
            const p = pipelineFactory.call(client);
            for (const [k, v] of part) p.set(k, v);
            await p.exec();
        }
        return;
    }

    // Limit concurrency by chunking to avoid overwhelming the runtime/network.
    for (const part of chunk(kvSets, KV_SET_OPS_PER_PIPELINE)) {
        await Promise.all(part.map(([k, v]) => client.set(k, v)));
    }
}

/**
 * Compute (and persist) rolling 24h averages for the given live per-route samples.
 *
 * Behavior:
 * - Samples are stored per-route as a compact JSON array of `[t, v]` tuples (timestamp + km/h).
 *   (Back-compat: older `{ t, v }` objects are still readable.)
 * - Old samples (>24h) are trimmed on write.
 * - A time-weighted 24h average is computed over the retained window and persisted separately
 *   so most requests can read averages without scanning sample history.
 */
export async function getAvg24hSpeedsByRouteTag(
    kv: unknown,
    liveRoutes: LiveRouteSample[],
    nowMs: number
): Promise<Record<string, number | null>> {
    const client = kv as KvClient;
    const bucketMs = toBucketMs(nowMs);
    const cutoffMs = nowMs - WINDOW_MS;

    const lastBucketRaw = await client.get(KV_LAST_BUCKET_KEY);
    const lastBucketMs = asNumber(lastBucketRaw);

    const routeTags = [...new Set(liveRoutes.map((r) => r.routeTag))];
    if (routeTags.length === 0) return {};

    // Avoid O(n^2) lookups when many routes are present (serverless safeguard).
    const liveByTag = new Map<string, number>();
    for (const r of liveRoutes) liveByTag.set(r.routeTag, r.liveSpeedKmh);

    // If we've already sampled for this bucket, just read the latest cached averages.
    if (lastBucketMs === bucketMs) {
        const keys = routeTags.map(avgKey);
        const values = await mgetChunked(client, keys);

        const out: Record<string, number | null> = {};
        for (let i = 0; i < routeTags.length; i++) {
            const v = asNumber(values[i]);
            out[routeTags[i]] = v === null ? null : round1(v);
        }
        return out;
    }

    // Otherwise: update sample history and refresh cached averages for this bucket.
    const samplesKeys = routeTags.map(sampleKey);
    const existing = await mgetChunked(client, samplesKeys);

    const kvSets: Array<[string, string]> = [];
    const out: Record<string, number | null> = {};

    for (let i = 0; i < routeTags.length; i++) {
        const tag = routeTags[i];
        const currentLiveSpeed = liveByTag.get(tag);
        if (currentLiveSpeed === undefined) {
            out[tag] = null;
            continue;
        }

        const prevSamples = parseSamples(existing[i]);
        const nextSamples = trimAndUpsert(prevSamples, cutoffMs, { t: bucketMs, v: currentLiveSpeed });
        const avg = compute24hAvgKmh(nextSamples, nowMs, cutoffMs);

        out[tag] = avg === null ? null : round1(avg);
        kvSets.push([sampleKey(tag), serializeSamples(nextSamples)]);
        kvSets.push([avgKey(tag), String(out[tag])]);
    }

    // Persist updates best-effort; caller should degrade gracefully on any KV failure.
    await setManyChunked(client, kvSets);
    await client.set(KV_LAST_BUCKET_KEY, String(bucketMs));

    return out;
}

