import fs from 'node:fs';
import path from 'node:path';

type Row = Record<string, number>;

function readSeries(dir: string): Row[] {
    const text = fs.readFileSync(path.join('tools/longrun/results', dir, 'series.csv'), 'utf8').trim().split('\n');
    const header = text[0].split(',');
    return text.slice(1).map((line) => {
        const cells = line.split(',');
        const row: Row = {};
        header.forEach((name, index) => {
            row[name] = Number(cells[index]);
        });
        return row;
    });
}

function atYears(rows: Row[], years: number[]): Map<number, Row> {
    const byYear = new Map<number, Row>();
    for (const row of rows) {
        const year = Math.round(row.tick / 360);
        if (years.includes(year) && !byYear.has(year)) {
            byYear.set(year, row);
        }
    }
    return byYear;
}

const baselineName = process.argv[2];
const candidateName = process.argv[3];
if (!baselineName || !candidateName) {
    throw new Error('usage: compareSeries.ts <baseline-run> <candidate-run> [columns...]');
}

const defaultColumns = [
    'totalPopulation',
    'gdpAnnual',
    'meanWealth',
    'bankEquity',
    'debtWriteOffs',
    'overheadWages',
    'companyCount',
    'companyNetWorthNegativeCount',
    'companiesDeepLoss',
    'highStarvationCompanies',
    'maxStorageStarvation',
    'storageDeptScale',
    'storageDeptMaxScale',
];
const columns = process.argv.slice(4).length > 0 ? process.argv.slice(4) : defaultColumns;

const baseline = readSeries(baselineName);
const candidate = readSeries(candidateName);
const maxYear = Math.round(Math.min(baseline.at(-1)!.tick, candidate.at(-1)!.tick) / 360);
const years = [1, 2, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200].filter((year) => year <= maxYear);
const baselineByYear = atYears(baseline, years);
const candidateByYear = atYears(candidate, years);

function format(value: number): string {
    const abs = Math.abs(value);
    if (!Number.isFinite(value)) {
        return 'n/a';
    }
    if (abs >= 1e12) {
        return `${(value / 1e12).toFixed(2)}T`;
    }
    if (abs >= 1e9) {
        return `${(value / 1e9).toFixed(2)}B`;
    }
    if (abs >= 1e6) {
        return `${(value / 1e6).toFixed(2)}M`;
    }
    if (abs >= 1e3) {
        return `${(value / 1e3).toFixed(2)}k`;
    }
    return abs >= 1 ? value.toFixed(2) : value.toExponential(1);
}

console.log(`${baselineName} (base) vs ${candidateName} (cand)  —  through y${maxYear}\n`);
const yearWidth = 6;
console.log('metric'.padEnd(30) + years.map((year) => `y${year}`.padStart(yearWidth)).join(''));
for (const column of columns) {
    for (const [label, byYear] of [
        ['base', baselineByYear],
        ['cand', candidateByYear],
    ] as const) {
        const cells = years.map((year) => {
            const value = byYear.get(year)?.[column];
            return (value === undefined ? '-' : format(value)).padStart(yearWidth);
        });
        console.log(`${column.padEnd(24)}${label.padStart(6)}` + cells.join(''));
    }
}
