import { readFileSync } from 'node:fs';
import {
    QUIT_FAIRNESS_SENSITIVITY,
    QUIT_OUTSIDE_SENSITIVITY,
    QUIT_OUTSIDE_WAGE_BIAS,
    QUIT_TARGET_RATE,
    TICKS_PER_MONTH,
    WAGE_SHARE,
} from '../../src/simulation/constants';
import { outsideIncome } from '../../src/simulation/workforce/laborMarket';

const CAP = 0.01;
const OLD = { outside: 0.05, fairness: 0.1 };

const clamp = (v: number): number => Math.max(-1, Math.min(1, v));

const load = (path: string): Record<string, number>[] => {
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    const head = lines[0].split(',');
    return lines.slice(1).map((line) => {
        const cells = line.split(',');
        const row: Record<string, number> = {};
        head.forEach((h, i) => {
            row[h] = Number(cells[i]);
        });
        return row;
    });
};

const median = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)] ?? 0;
};

const pct = (xs: number[], pred: (x: number) => boolean): number =>
    (100 * xs.filter(pred).length) / Math.max(1, xs.length);

const TIERS = ['Primary', 'Secondary', 'Tertiary', 'None'] as const;

const analyse = (path: string): void => {
    const rows = load(path);
    console.log(`\n=== ${path}  (${rows.length} samples) ===`);
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const observedQuit = mean(rows.map((r) => r.wageQuitRate ?? 0));
    for (const tier of TIERS) {
        const exitGaps: number[] = [];
        const fairGaps: number[] = [];
        const rawsNew: number[] = [];
        const rawsOld: number[] = [];
        let validRows = 0;
        for (const r of rows) {
            const wage = r[`wage${tier}`] ?? r.wagePrimary;
            const ceiling = r[`wageCeiling${tier}`] ?? r.wageCeiling;
            const tightness = r[`tightness${tier}`] ?? 0;
            const vacancyWage = r[`vacancyWage${tier}`] ?? 0;
            if (!wage || !ceiling) {
                continue;
            }
            const fairWage = WAGE_SHARE * ceiling;
            const fairGap = clamp((fairWage - wage) / fairWage);
            fairGaps.push(fairGap);
            if (tightness <= 0 || vacancyWage <= 0) {
                continue;
            }
            validRows += 1;
            const outside = QUIT_OUTSIDE_WAGE_BIAS * outsideIncome(tightness, vacancyWage);
            const exitGap = clamp((outside - wage) / wage);
            exitGaps.push(exitGap);
            rawsNew.push(
                Math.max(0, QUIT_OUTSIDE_SENSITIVITY * exitGap + QUIT_FAIRNESS_SENSITIVITY * fairGap),
            );
            rawsOld.push(Math.max(0, OLD.outside * exitGap + OLD.fairness * fairGap));
        }
        if (exitGaps.length === 0) {
            continue;
        }
        console.log(
            `${tier.padEnd(10)} valid=${String(validRows).padStart(5)}  exitGap med=${median(exitGaps)
                .toFixed(3)
                .padStart(6)} mean=${mean(exitGaps).toFixed(3).padStart(6)} maxed(< -0.99)=${pct(
                exitGaps,
                (v) => v < -0.99,
            )
                .toFixed(0)
                .padStart(3)}%  fairGap med=${median(fairGaps).toFixed(3).padStart(6)} mean=${mean(fairGaps)
                .toFixed(3)
                .padStart(6)} pos=${pct(fairGaps, (v) => v > 0)
                .toFixed(0)
                .padStart(3)}%`,
        );
        console.log(
            `           raw NEW   mean=${mean(rawsNew).toFixed(6)} pos=${pct(rawsNew, (v) => v > 0)
                .toFixed(1)
                .padStart(5)}% atCap=${pct(rawsNew, (v) => v >= CAP)
                .toFixed(1)
                .padStart(5)}%  -> implied quit ${(mean(rawsNew) * TICKS_PER_MONTH).toFixed(4)}/mo  (target ${QUIT_TARGET_RATE})`,
        );
        console.log(
            `           raw OLD   mean=${mean(rawsOld).toFixed(6)} pos=${pct(rawsOld, (v) => v > 0)
                .toFixed(1)
                .padStart(5)}% atCap=${pct(rawsOld, (v) => v >= CAP)
                .toFixed(1)
                .padStart(5)}%  -> implied quit ${(mean(rawsOld) * TICKS_PER_MONTH).toFixed(4)}/mo`,
        );
    }
    console.log(`observed mean wageQuitRate = ${observedQuit.toFixed(4)}/mo (target ${QUIT_TARGET_RATE})`);
};

for (const path of process.argv.slice(2)) {
    analyse(path);
}
