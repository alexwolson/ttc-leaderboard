import type { VercelRequest, VercelResponse } from '@vercel/node';
import { XMLParser } from 'fast-xml-parser';

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

        const vehicles = jsonData.body.vehicle;
        const trams: { [key: string]: { total_speed: number, total_trams: number } } = {};

        for (const vehicle of vehicles) {
            const route = vehicle["@_routeTag"];
            if (!trams[route]) {
                trams[route] = {
                    total_speed: 0,
                    total_trams: 0
                };
            }
            // Speed definition (current behavior):
            // - Source: TTC/UmoIQ (NextBus) `vehicleLocations` feed attribute `speedKmHr`
            // - Units: km/h (instantaneous per-vehicle speed as reported in the feed)
            // - Per-route speed is currently the *simple arithmetic mean* of `speedKmHr`
            //   across all active vehicles on that route (including stopped vehicles at 0 km/h).
            // - Pitfall: if `@_speedKmHr` is missing/non-numeric, `parseInt(...)` becomes NaN and
            //   can poison the route average. Later iterations will add validation rules.
            trams[route].total_speed += parseInt(vehicle["@_speedKmHr"]);
            trams[route].total_trams += 1;
        }

        const average_speeds: { [key: string]: number } = {};

        for (const route of Object.keys(trams)) {
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
