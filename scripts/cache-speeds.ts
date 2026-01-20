#!/usr/bin/env tsx

import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const FETCH_INTERVAL_MS = 60 * 1000; // 1 minute
const DEFAULT_DURATION_DAYS = 30;
const CACHE_DIR = path.join(process.cwd(), 'speed-cache');
const CACHE_FILE = path.join(CACHE_DIR, 'speed-data.json');

// Types
type SpeedRecord = {
    timestamp: string; // ISO 8601 timestamp
    timestampMs: number; // Unix timestamp in milliseconds
    routeTag: string;
    routeTitle: string | null;
    speedKmh: number;
    vehicleCount: number;
};

type CacheData = {
    startTime: string;
    records: SpeedRecord[];
};

// Utility functions from api/ttc.ts
function asArray<T>(value: T | T[] | null | undefined): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function parseSpeedKmh(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const raw = String(value).trim();
    if (raw.length === 0) return null;

    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (n < 0) return null;

    return n;
}

async function getRouteTitlesByTag(parser: XMLParser): Promise<Record<string, string>> {
    try {
        const resp = await fetch(
            'https://webservices.umoiq.com/service/publicXMLFeed?command=routeList&a=ttc'
        );
        if (!resp.ok) {
            console.warn(`Failed to fetch routeList (${resp.status}), continuing without titles`);
            return {};
        }

        const xml = await resp.text();
        const json = parser.parse(xml);

        const routes = asArray<Record<string, unknown>>(json?.body?.route);
        const titlesByRouteTag: Record<string, string> = {};

        for (const route of routes) {
            const tag = route['@_tag'];
            const title = route['@_title'];
            if (typeof tag !== 'string' || tag.length === 0) continue;
            if (typeof title !== 'string' || title.length === 0) continue;
            titlesByRouteTag[tag] = title;
        }

        return titlesByRouteTag;
    } catch (error) {
        console.warn('Error fetching route titles:', error);
        return {};
    }
}

async function fetchCurrentSpeeds(): Promise<SpeedRecord[]> {
    const nowMs = Date.now();
    const timestamp = new Date(nowMs).toISOString();

    try {
        const response = await fetch(
            'https://webservices.umoiq.com/service/publicXMLFeed?command=vehicleLocations&a=ttc'
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch TTC data: ${response.status}`);
        }

        const xmlData = await response.text();

        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
        });
        const jsonData = parser.parse(xmlData);

        const vehicles = asArray<Record<string, unknown>>(jsonData?.body?.vehicle);
        const routeData: { [key: string]: { total_speed: number; total_vehicles: number } } = {};

        for (const vehicle of vehicles) {
            const route = vehicle['@_routeTag'];
            if (typeof route !== 'string' || route.length === 0) {
                continue;
            }
            const speedKmh = parseSpeedKmh(vehicle['@_speedKmHr']);
            if (speedKmh === null) {
                continue;
            }
            if (!routeData[route]) {
                routeData[route] = {
                    total_speed: 0,
                    total_vehicles: 0
                };
            }
            routeData[route].total_speed += speedKmh;
            routeData[route].total_vehicles += 1;
        }

        const routeTitlesByTag = await getRouteTitlesByTag(parser);
        const records: SpeedRecord[] = [];

        for (const [routeTag, data] of Object.entries(routeData)) {
            if (data.total_vehicles <= 0) continue;
            const avgSpeed = parseFloat((data.total_speed / data.total_vehicles).toFixed(1));
            records.push({
                timestamp,
                timestampMs: nowMs,
                routeTag,
                routeTitle: routeTitlesByTag[routeTag] ?? null,
                speedKmh: avgSpeed,
                vehicleCount: data.total_vehicles
            });
        }

        return records;
    } catch (error) {
        console.error('Error fetching speeds:', error);
        return [];
    }
}

function loadCache(): CacheData {
    if (!fs.existsSync(CACHE_FILE)) {
        const startTime = new Date().toISOString();
        return { startTime, records: [] };
    }

    try {
        const content = fs.readFileSync(CACHE_FILE, 'utf-8');
        return JSON.parse(content) as CacheData;
    } catch (error) {
        console.error('Error loading cache, starting fresh:', error);
        const startTime = new Date().toISOString();
        return { startTime, records: [] };
    }
}

function saveCache(data: CacheData): void {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

async function collectSample(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Fetching speed data...`);
    const records = await fetchCurrentSpeeds();
    
    if (records.length === 0) {
        console.log('  No data fetched (possibly an error or no vehicles active)');
        return;
    }

    const cache = loadCache();
    cache.records.push(...records);
    saveCache(cache);

    console.log(`  Collected ${records.length} route speed records`);
    console.log(`  Total records in cache: ${cache.records.length}`);
}

function printStats(cache: CacheData): void {
    if (cache.records.length === 0) {
        console.log('No data collected yet');
        return;
    }

    const routeTags = new Set(cache.records.map(r => r.routeTag));
    const startMs = cache.records[0].timestampMs;
    const endMs = cache.records[cache.records.length - 1].timestampMs;
    const durationHours = (endMs - startMs) / (1000 * 60 * 60);

    console.log('\n=== Cache Statistics ===');
    console.log(`Start time: ${cache.startTime}`);
    console.log(`Duration: ${durationHours.toFixed(2)} hours (${(durationHours / 24).toFixed(2)} days)`);
    console.log(`Total records: ${cache.records.length}`);
    console.log(`Unique routes: ${routeTags.size}`);
    console.log(`Cache file: ${CACHE_FILE}`);
    console.log('========================\n');
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const durationDays = args.length > 0 ? parseInt(args[0], 10) : DEFAULT_DURATION_DAYS;

    if (isNaN(durationDays) || durationDays <= 0) {
        console.error('Invalid duration. Usage: npm run cache-speeds [days]');
        process.exit(1);
    }

    console.log('=================================================');
    console.log('TTC Speed Data Caching Script');
    console.log('=================================================');
    console.log(`Collection interval: ${FETCH_INTERVAL_MS / 1000} seconds`);
    console.log(`Target duration: ${durationDays} days`);
    console.log(`Cache directory: ${CACHE_DIR}`);
    console.log('=================================================\n');
    console.log('Press Ctrl+C to stop collection\n');

    // Load existing cache to show stats
    const cache = loadCache();
    printStats(cache);

    // Collect first sample immediately
    await collectSample();

    // Set up interval for subsequent collections
    const interval = setInterval(async () => {
        await collectSample();
        
        // Check if we've reached the target duration
        const cache = loadCache();
        if (cache.records.length > 0) {
            const startMs = cache.records[0].timestampMs;
            const nowMs = Date.now();
            const elapsedDays = (nowMs - startMs) / (1000 * 60 * 60 * 24);
            
            if (elapsedDays >= durationDays) {
                console.log(`\nTarget duration of ${durationDays} days reached.`);
                printStats(cache);
                clearInterval(interval);
                process.exit(0);
            }
        }
    }, FETCH_INTERVAL_MS);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n\nStopping data collection...');
        clearInterval(interval);
        const cache = loadCache();
        printStats(cache);
        process.exit(0);
    });
}

// Run the script
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
