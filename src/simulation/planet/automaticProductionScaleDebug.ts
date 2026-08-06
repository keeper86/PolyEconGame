import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DEBUG_ENABLED = process.env.SIM_DEBUG_AUTOSCALE === '1';
const DEBUG_DIR = path.join(process.cwd(), 'debug');
const FACILITY_LOG_FILE = path.join(DEBUG_DIR, `autoscale_facilities_${process.pid}.jsonl`);
const PLANET_LOG_FILE = path.join(DEBUG_DIR, `autoscale_planets_${process.pid}.jsonl`);

let initialized = false;

function ensureInitialized(): void {
    if (!DEBUG_ENABLED || initialized) {
        return;
    }
    try {
        mkdirSync(DEBUG_DIR, { recursive: true });
        writeFileSync(FACILITY_LOG_FILE, '');
        writeFileSync(PLANET_LOG_FILE, '');
        initialized = true;
    } catch (err) {
        console.error('[autoscale-debug] Failed to initialize log files:', err);
    }
}

function appendToLog(file: string, entry: object): void {
    if (!DEBUG_ENABLED) {
        return;
    }
    if (!initialized) {
        ensureInitialized();
        if (!initialized) {
            return;
        }
    }
    try {
        appendFileSync(file, JSON.stringify(entry) + '\n');
    } catch (err) {
        console.error(`[autoscale-debug] Failed to append to ${file}:`, err);
    }
}

export function isAutoscaleDebugEnabled(): boolean {
    return DEBUG_ENABLED;
}

export function logAutoscaleFacility(entry: object): void {
    appendToLog(FACILITY_LOG_FILE, entry);
}

export function logAutoscalePlanet(entry: object): void {
    appendToLog(PLANET_LOG_FILE, entry);
}
