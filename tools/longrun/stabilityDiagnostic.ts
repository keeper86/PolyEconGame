import fs from 'node:fs';
import path from 'node:path';

import { TICKS_PER_YEAR } from '../../src/simulation/constants';

type Row = Record<string, number>;
type RawRow = Record<string, string | number>;

function readCsv(file: string): Row[] {
    return readCsvRaw(file).map((raw) => {
        const row: Row = {};
        for (const [key, value] of Object.entries(raw)) {
            const num = typeof value === 'number' ? value : Number(value);
            if (Number.isFinite(num)) {
                row[key] = num;
            }
        }
        return row;
    });
}

function readCsvRaw(file: string): RawRow[] {
    if (!fs.existsSync(file)) {
        return [];
    }
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    if (lines.length < 2) {
        return [];
    }
    const headers = lines[0]!.split(',');
    const out: RawRow[] = [];
    for (const line of lines.slice(1)) {
        const cells = line.split(',');
        const row: RawRow = {};
        for (let i = 0; i < headers.length; i++) {
            row[headers[i]!] = cells[i] ?? '';
        }
        out.push(row);
    }
    return out;
}

function numericRows(raw: RawRow[]): Row[] {
    return raw.map((r) => {
        const row: Row = {};
        for (const [key, value] of Object.entries(r)) {
            const num = Number(value);
            if (Number.isFinite(num)) {
                row[key] = num;
            }
        }
        return row;
    });
}

function firstColumnBelow(rows: Row[], column: string, threshold: number): Row | undefined {
    return rows.find((r) => r[column] !== undefined && r[column]! < threshold);
}

function fmt(value: number | undefined, digits = 4): string {
    return value === undefined || !Number.isFinite(value) ? 'n/a' : value.toFixed(digits);
}

function median(values: number[]): number {
    if (values.length === 0) {
        return Number.NaN;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function reportConstraintMargins(yearly: Row[]): void {
    console.log('\n== 1. State-constraint margins (distance of critical buffers from zero) ==');
    const columns = [
        'groceryBuffer',
        'groceryFillRate',
        'market_Grocery_fillRate',
        'avgGroceryStarvation',
    ].filter((c) => yearly.some((r) => r[c] !== undefined));

    for (const column of columns) {
        const values = yearly.map((r) => r[column]!).filter((v) => Number.isFinite(v));
        if (values.length === 0) {
            continue;
        }
        const min = Math.min(...values);
        const minRow = yearly.find((r) => r[column] === min);
        const minYear = minRow ? Math.round((minRow.tick ?? 0) / TICKS_PER_YEAR) : NaN;
        const threshold = column === 'groceryFillRate' ? 0.5 : 1e-6;
        const crossing = firstColumnBelow(yearly, column, threshold);
        console.log(
            `  ${column.padEnd(24)} min=${fmt(min, 6)} @y${minYear}` +
                `  first<${threshold}=${crossing ? 'y' + Math.round((crossing.tick ?? 0) / TICKS_PER_YEAR) : 'never'}`,
        );
    }
}

function reportSwitchIntervals(tickProbeRaw: RawRow[]): void {
    console.log('\n== 2. Slow-loop switching events (capacity = maxScale jumps) ==');
    for (const facility of ['Maintenance_Facility', 'Grocery_Chain', 'Construction_Facility']) {
        const raw = tickProbeRaw
            .filter((r) => r.facility === facility)
            .map((r) => numericRows([r])[0]!)
            .sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0));
        if (raw.length === 0) {
            console.log(`  ${facility}: no tickProbe rows`);
            continue;
        }
        const jumps: number[] = [];
        for (let i = 1; i < raw.length; i++) {
            const delta = (raw[i]!.maxScale ?? 0) - (raw[i - 1]!.maxScale ?? 0);
            if (Math.abs(delta) > 1e-6) {
                jumps.push(raw[i]!.tick ?? 0);
            }
        }
        const intervals: number[] = [];
        for (let i = 1; i < jumps.length; i++) {
            intervals.push((jumps[i]! - jumps[i - 1]!) / TICKS_PER_YEAR);
        }
        const half = Math.floor(intervals.length / 2);
        const med1 = median(intervals.slice(0, half));
        const med2 = median(intervals.slice(half));
        const last = raw[raw.length - 1]!;
        console.log(
            `  ${facility}: scaleFrac=${fmt((last.scale ?? 0) / (last.maxScale ?? 1))} ` +
                `${jumps.length} switches, gap med1=${fmt(med1, 2)}y med2=${fmt(med2, 2)}y` +
                ` (ratio ${fmt(med2 / med1, 2)})`,
        );
    }
}

function reportOscillationAmplitude(yearly: Row[]): void {
    console.log('\n== 3. Oscillation amplitude trend (growing amplitude => multiplier > 1) ==');
    const columns = ['avgFacilityCondition', 'maintFacilityCondition', 'maintAggregateConsumption'];
    for (const column of columns) {
        const values = yearly.map((r) => r[column]!).filter((v) => Number.isFinite(v));
        if (values.length < 20) {
            continue;
        }
        const third = Math.floor(values.length / 3);
        const amp = (slice: number[]): number => Math.max(...slice) - Math.min(...slice);
        const mean = (slice: number[]): number => slice.reduce((a, b) => a + b, 0) / slice.length;
        console.log(
            `  ${column.padEnd(26)} mean early=${fmt(mean(values.slice(0, third)))} late=${fmt(
                mean(values.slice(2 * third)),
            )}  amplitude early=${fmt(amp(values.slice(0, third)))} mid=${fmt(
                amp(values.slice(third, 2 * third)),
            )} late=${fmt(amp(values.slice(2 * third)))}`,
        );
    }
}

function reportCapacitySaturation(yearly: Row[]): void {
    console.log('\n== 4. Capacity saturation: when did the binding ceiling lock in? ==');
    const pairs: Array<[string, string, string]> = [
        ['maintFacilityScale', 'maintFacilityMaxScale', 'maintenance'],
        ['hrScale', 'hrMaxScale', 'HR'],
    ];
    for (const [scaleCol, maxCol, label] of pairs) {
        const rows = yearly.filter((r) => r[scaleCol] !== undefined && r[maxCol] !== undefined);
        if (rows.length === 0) {
            console.log(`  ${label}: columns missing`);
            continue;
        }
        const locked = rows.find((r) => r[maxCol]! > 0 && r[scaleCol]! / r[maxCol]! > 0.99);
        const lockYear = locked ? Math.round((locked.tick ?? 0) / TICKS_PER_YEAR) : NaN;
        const last = rows[rows.length - 1]!;
        const dropped = rows.find((r) => r[maxCol]! > 0 && r[scaleCol]! / r[maxCol]! < 0.9);
        console.log(
            `  ${label}: first at >=99% capacity @${locked ? 'y' + lockYear : 'never'}, final ratio=${fmt(
                (last[scaleCol] ?? 0) / (last[maxCol] ?? 1),
            )}, first dropped below 90% @${
                dropped ? 'y' + Math.round((dropped.tick ?? 0) / TICKS_PER_YEAR) : 'never'
            }`,
        );
    }
}

export function runStabilityDiagnostic(outDir: string): void {
    const yearly = readCsv(path.join(outDir, 'series.csv'));
    const tickProbeRaw = readCsvRaw(path.join(outDir, 'tickProbe.csv'));
    console.log(`\n=== stability diagnostic: ${outDir} ===`);
    console.log(`  series samples: ${yearly.length}, tickProbe rows: ${tickProbeRaw.length}`);
    reportConstraintMargins(yearly);
    reportSwitchIntervals(tickProbeRaw);
    reportOscillationAmplitude(yearly);
    reportCapacitySaturation(yearly);
}

const target = process.argv[2];
if (target) {
    runStabilityDiagnostic(path.isAbsolute(target) ? target : path.join(__dirname, 'results', target));
}

