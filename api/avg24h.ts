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
        if (!item || typeof item !== 'object') continue;
        const t = asNumber((item as Record<string, unknown>).t);
        const v = asNumber((item as Record<string, unknown>).v);
        if (t === null || v === null) continue;
        out.push({ t, v });
    }
    return out;
}

function trimAndUpsert(samples: SpeedSample[], cutoffMs: number, sample: SpeedSample): SpeedSample[] {
    // Keep only last-24h window, and ensure at most one sample per bucket.
    const kept = samples.filter((s) => Number.isFinite(s.t) && Number.isFinite(s.v) && s.t >= cutoffMs);
    const withoutBucket = kept.filter((s) => s.t !== sample.t);
    withoutBucket.push(sample);
    withoutBucket.sort((a, b) => a.t - b.t);
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

/**
 * Compute (and persist) rolling 24h averages for the given live per-route samples.
 *
 * Behavior:
 * - Samples are stored per-route as a JSON array of `{ t, v }` items (timestamp + km/h).
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

    // If we've already sampled for this bucket, just read the latest cached averages.
    if (lastBucketMs === bucketMs) {
        const keys = routeTags.map(avgKey);
        const values = (await client.mget(...keys)) as unknown[];

        const out: Record<string, number | null> = {};
        for (let i = 0; i < routeTags.length; i++) {
            const v = asNumber(values[i]);
            out[routeTags[i]] = v === null ? null : round1(v);
        }
        return out;
    }

    // Otherwise: update sample history and refresh cached averages for this bucket.
    const samplesKeys = routeTags.map(sampleKey);
    const existing = (await client.mget(...samplesKeys)) as unknown[];

    const kvSets: Array<[string, string]> = [];
    const out: Record<string, number | null> = {};

    for (let i = 0; i < routeTags.length; i++) {
        const tag = routeTags[i];
        const currentLive = liveRoutes.find((r) => r.routeTag === tag);
        if (!currentLive) {
            out[tag] = null;
            continue;
        }

        const prevSamples = parseSamples(existing[i]);
        const nextSamples = trimAndUpsert(prevSamples, cutoffMs, { t: bucketMs, v: currentLive.liveSpeedKmh });
        const avg = compute24hAvgKmh(nextSamples, nowMs, cutoffMs);

        out[tag] = avg === null ? null : round1(avg);
        kvSets.push([sampleKey(tag), JSON.stringify(nextSamples)]);
        kvSets.push([avgKey(tag), JSON.stringify(out[tag])]);
    }

    // Persist updates best-effort; caller should degrade gracefully on any KV failure.
    if (kvSets.length > 0) {
        const pipeline = typeof client.pipeline === 'function' ? client.pipeline() : null;
        if (pipeline) {
            for (const [k, v] of kvSets) pipeline.set(k, v);
            pipeline.set(KV_LAST_BUCKET_KEY, String(bucketMs));
            await pipeline.exec();
        } else {
            await Promise.all(kvSets.map(([k, v]) => client.set(k, v)));
            await client.set(KV_LAST_BUCKET_KEY, String(bucketMs));
        }
    } else {
        await client.set(KV_LAST_BUCKET_KEY, String(bucketMs));
    }

    return out;
}

