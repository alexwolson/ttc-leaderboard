import type { VercelRequest, VercelResponse } from '@vercel/node';
import { XMLParser } from 'fast-xml-parser';

function asArray<T>(value: T | T[] | null | undefined): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
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

        // Set CORS headers to allow requests from your frontend
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');

        return res.status(200).json(sorted_average_speeds);
    } catch (error) {
        console.error('Error fetching TTC data:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
