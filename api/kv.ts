type KvEnv = {
    url: string;
    token: string;
};

/**
 * Vercel KV environment variable wiring.
 *
 * Vercel KV uses the Upstash REST API under the hood. The `@vercel/kv` client can
 * be configured from environment variables (recommended on Vercel).
 *
 * We centralize config detection here so callers can degrade gracefully when KV
 * is not configured (e.g., in local dev).
 */
export function getKvEnv(): KvEnv | null {
    const url = (process.env.KV_REST_API_URL ?? '').trim();
    const token = (process.env.KV_REST_API_TOKEN ?? '').trim();

    if (!url || !token) return null;
    return { url, token };
}

/**
 * Get a KV client if configured; otherwise return `null`.
 *
 * This avoids module initialization errors in environments where KV env vars
 * aren't set, while still allowing the rest of the API to function.
 */
export async function getKvClient() {
    const env = getKvEnv();
    if (!env) return null;

    const { createClient } = await import('@vercel/kv');
    return createClient({ url: env.url, token: env.token });
}

