import type { VercelRequest, VercelResponse } from '@vercel/node';
import { XMLParser } from 'fast-xml-parser';

function asArray<T>(value: T | T[] | null | undefined): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

type RouteTitlesCache = {
    fetchedAtMs: number;
    titlesByRouteTag: Record<string, string>;
};

let routeTitlesCache: RouteTitlesCache | null = null;
const ROUTE_TITLES_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetch TTC route titles (tag -> title) from NextBus/UmoIQ route metadata.
 *
 * Endpoint: `command=routeList&a=ttc`
 *
 * Notes:
 * - This is best-effort: if metadata fetch fails, we return the last cached value (if any) or `{}`.
 * - Titles are *not* hardcoded; callers should fall back gracefully if a title is missing.
 */
async function getRouteTitlesByTag(parser: XMLParser): Promise<Record<string, string>> {
    const now = Date.now();
    if (routeTitlesCache && now - routeTitlesCache.fetchedAtMs < ROUTE_TITLES_TTL_MS) {
        return routeTitlesCache.titlesByRouteTag;
    }

    try {
        const resp = await fetch(
            'https://webservices.umoiq.com/service/publicXMLFeed?command=routeList&a=ttc'
        );
        if (!resp.ok) {
            throw new Error(`Failed to fetch routeList (${resp.status})`);
        }

        const xml = await resp.text();
        const json = parser.parse(xml);

        // Feed shape guard: `body.route` may be an array OR a single object.
        const routes = asArray<Record<string, unknown>>(json?.body?.route);
        const titlesByRouteTag: Record<string, string> = {};

        for (const route of routes) {
            const tag = route['@_tag'];
            const title = route['@_title'];
            if (typeof tag !== 'string' || tag.length === 0) continue;
            if (typeof title !== 'string' || title.length === 0) continue;
            titlesByRouteTag[tag] = title;
        }

        routeTitlesCache = { fetchedAtMs: now, titlesByRouteTag };
        return titlesByRouteTag;
    } catch {
        // Degrade gracefully: keep serving live speeds even if route titles cannot be fetched.
        return routeTitlesCache?.titlesByRouteTag ?? {};
    }
}

/**
 * Parse and validate TTC/UmoIQ `speedKmHr` values.
 *
 * Rule (Iteration 6):
 * - Missing/empty/non-numeric values are invalid and ignored.
 * - Negative values are invalid and ignored.
 * - 0 is considered a valid speed (stopped vehicle) and is included in averages.
 *
 * This keeps aggregates deterministic and prevents `NaN`/`Infinity` from propagating.
 */
function parseSpeedKmh(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const raw = String(value).trim();
    if (raw.length === 0) return null;

    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (n < 0) return null;

    return n;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        const response = await fetch(
            'https://webservices.umoiq.com/service/publicXMLFeed?command=vehicleLocations&a=ttc'
        );

        if (!response.ok) {
            return res.status(response.status).json({ error: 'Failed to fetch TTC data' });
        }

        const xmlData = await response.text();

        // Parse XML to JSON
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
        });
        const jsonData = parser.parse(xmlData);

        // Feed shape guard:
        // - `body.vehicle` may be an array OR a single object depending on how many vehicles exist.
        // - It may also be missing entirely if the feed is empty or changes shape.
        const vehicles = asArray<Record<string, unknown>>(jsonData?.body?.vehicle);
        const trams: { [key: string]: { total_speed: number, total_trams: number } } = {};

        for (const vehicle of vehicles) {
            const route = vehicle['@_routeTag'];
            if (typeof route !== 'string' || route.length === 0) {
                // Unexpected/missing route tag; skip rather than throwing.
                continue;
            }
            const speedKmh = parseSpeedKmh(vehicle['@_speedKmHr']);
            if (speedKmh === null) {
                // Invalid speed values are excluded from averages.
                continue;
            }
            if (!trams[route]) {
                trams[route] = {
                    total_speed: 0,
                    total_trams: 0
                };
            }
            // Speed definition:
            // - Source: TTC/UmoIQ (NextBus) `vehicleLocations` feed attribute `speedKmHr`
            // - Units: km/h (instantaneous per-vehicle speed as reported in the feed)
            // - Per-route speed is the *simple arithmetic mean* of valid `speedKmHr` samples
            //   across active vehicles on that route. See `parseSpeedKmh(...)` for validation rules.
            trams[route].total_speed += speedKmh;
            trams[route].total_trams += 1;
        }

        const average_speeds: { [key: string]: number } = {};

        for (const route of Object.keys(trams)) {
            if (trams[route].total_trams <= 0) continue;
            average_speeds[route] = parseFloat((trams[route].total_speed / trams[route].total_trams).toFixed(1));
        }

        const sorted_average_speeds = Object.entries(average_speeds).sort((a, b) => b[1] - a[1]);
        const routeTitlesByTag = await getRouteTitlesByTag(parser);

        // Temporary API shape (kept backward compatible with the existing UI):
        // - index 0: routeTag
        // - index 1: live average speed (km/h)
        // - index 2: routeTitle (string) or null if unavailable
        const sorted_average_speeds_with_titles = sorted_average_speeds.map(([routeTag, speed]) => [
            routeTag,
            speed,
            routeTitlesByTag[routeTag] ?? null,
        ]);

        // Set CORS headers to allow requests from your frontend
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');

        return res.status(200).json(sorted_average_speeds_with_titles);
    } catch (error) {
        console.error('Error fetching TTC data:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
