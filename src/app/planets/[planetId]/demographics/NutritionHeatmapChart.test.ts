/**
 * NutritionHeatmapChart.test.ts
 *
 * Unit test for the data transformation logic used by NutritionHeatmapChart.
 *
 * The chart classifies each group using a **six-band starvation-only** scheme:
 *   fatalStarvation    (S > 0.9)
 *   severeStarvation   (S > 0.75)
 *   seriousStarvation  (S > 0.5)
 *   moderateStarvation (S > 0.25)
 *   lightStarvation    (S > 0.05)
 *   noStarvation       (S ≤ 0.05)
 *
 * The component receives AggRow[] from the server (not raw demography) and
 * classifies each group by its population-weighted average starvation.
 */

import { describe, it, expect } from 'vitest';
import { GROCERY_BUFFER_TARGET_TICKS, SERVICE_PER_PERSON_PER_TICK } from '@/simulation/constants';
import type { AggRow } from '@/app/planets/[planetId]/demographics/demographicsTypes';
import { SERVICE_TARGET_PER_PERSON, GV_FOOD, GV_POP, GV_STARV } from '@/app/planets/[planetId]/demographics/demographicsTypes';
import { OCCUPATIONS } from '@/simulation/population/population';

// ---- Replicate component structure ----

const BANDS = [
    { key: 'fatalStarvation', label: 'Fatal' },
    { key: 'severeStarvation', label: 'Severe' },
    { key: 'seriousStarvation', label: 'Serious' },
    { key: 'moderateStarvation', label: 'Moderate' },
    { key: 'lightStarvation', label: 'Light' },
    { key: 'noStarvation', label: 'None' },
] as const;

type BandKey = (typeof BANDS)[number]['key'];

/** Replicate the component's single-arg classifyBand (starvation level → band index). */
function classifyBand(starvationLevel: number): number {
    if (starvationLevel > 0.9) return 0;
    if (starvationLevel > 0.75) return 1;
    if (starvationLevel > 0.5) return 2;
    if (starvationLevel > 0.25) return 3;
    if (starvationLevel > 0.05) return 4;
    return 5;
}

type ChartRow = Record<string, number>;

/** Replicate the component's useMemo logic using AggRow[] input. */
function computeChartData(rows: AggRow[], groupKeys: readonly string[]): ChartRow[] {
    const result: ChartRow[] = [];
    for (const r of rows) {
        const row: ChartRow = { age: r.age };
        let ageTotalPop = 0;

        for (let gi = 0; gi < groupKeys.length; gi++) {
            const gk = groupKeys[gi];
            const gv = r.groupValues[gi];
            const gPop = gv[GV_POP];
            const totalFood = gv[GV_FOOD];
            const weightedStarv = gv[GV_STARV];

            const avgStarvation = gPop > 0 && weightedStarv > 0 ? weightedStarv / gPop : 0;
            const avgStock = gPop > 0 ? totalFood / gPop : 0;
            const avgBuffer = SERVICE_TARGET_PER_PERSON > 0 ? avgStock / SERVICE_TARGET_PER_PERSON : 0;

            const bandIdx = classifyBand(avgStarvation);
            for (let bi = 0; bi < BANDS.length; bi++) {
                row[`${gk}_${BANDS[bi].key}`] = bi === bandIdx ? gPop : 0;
            }
            row[`${gk}_total`] = gPop;
            row[`${gk}_avgStarvation`] = avgStarvation;
            row[`${gk}_avgBuffer`] = avgBuffer;
            ageTotalPop += gPop;
        }

        if (ageTotalPop > 0) result.push(row);
    }
    return result;
}

/** Compute global stats aggregated across all chart rows. */
function computeGlobalStats(chartData: ChartRow[], groupKeys: readonly string[]) {
    let totalPop = 0;
    let totalStarving = 0;
    let wStarv = 0;
    let wBuffer = 0;
    const bandTotals: Record<BandKey, number> = {
        fatalStarvation: 0,
        severeStarvation: 0,
        seriousStarvation: 0,
        moderateStarvation: 0,
        lightStarvation: 0,
        noStarvation: 0,
    };

    for (const row of chartData) {
        for (const gk of groupKeys) {
            const gPop = row[`${gk}_total`] ?? 0;
            totalPop += gPop;
            for (const b of BANDS) {
                const cnt = row[`${gk}_${b.key}`] ?? 0;
                (bandTotals as Record<string, number>)[b.key] += cnt;
            }
            // bands 0-4 = starving (all except noStarvation which is index 5)
            const starvingInRow = BANDS.slice(0, 5).reduce((s, b) => s + (row[`${gk}_${b.key}`] ?? 0), 0);
            totalStarving += starvingInRow;
            wStarv += gPop * (row[`${gk}_avgStarvation`] ?? 0);
            wBuffer += gPop * (row[`${gk}_avgBuffer`] ?? 0);
        }
    }

    return {
        totalPop,
        totalStarving,
        starvingFrac: totalPop > 0 ? totalStarving / totalPop : 0,
        globalAvgStarvation: totalPop > 0 ? wStarv / totalPop : 0,
        globalAvgBuffer: totalPop > 0 ? wBuffer / totalPop : 0,
        bandTotals,
    };
}

// --- Test data helpers ---

const TEST_GROUP_KEYS = [...OCCUPATIONS] as string[];

/** Create an AggRow with all population in the first group (education). */
function makeAggRow(
    age: number,
    pop: number,
    totalFoodStock: number,
    weightedStarvation: number,
): AggRow {
    return {
        age,
        total: pop,
        occ: [pop, 0, 0, 0],
        edu: [pop, 0, 0, 0],
        groupValues: [
            [pop, totalFoodStock, weightedStarvation, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ],
    };
}

describe('NutritionHeatmapChart — classifyBand (starvation-only, single arg)', () => {
    it('S > 0.9 → fatalStarvation (band 0)', () => {
        expect(classifyBand(0.91)).toBe(0);
        expect(classifyBand(1.0)).toBe(0);
    });

    it('S > 0.75 and ≤ 0.9 → severeStarvation (band 1)', () => {
        expect(classifyBand(0.9)).toBe(1);
        expect(classifyBand(0.76)).toBe(1);
    });

    it('S > 0.5 and ≤ 0.75 → seriousStarvation (band 2)', () => {
        expect(classifyBand(0.75)).toBe(2);
        expect(classifyBand(0.51)).toBe(2);
    });

    it('S > 0.25 and ≤ 0.5 → moderateStarvation (band 3)', () => {
        expect(classifyBand(0.5)).toBe(3);
        expect(classifyBand(0.26)).toBe(3);
    });

    it('S > 0.05 and ≤ 0.25 → lightStarvation (band 4)', () => {
        expect(classifyBand(0.25)).toBe(4);
        expect(classifyBand(0.06)).toBe(4);
    });

    it('S ≤ 0.05 → noStarvation (band 5)', () => {
        expect(classifyBand(0.05)).toBe(5);
        expect(classifyBand(0.0)).toBe(5);
    });

    it('all thresholds are exclusive on the upper end', () => {
        expect(classifyBand(0.9)).not.toBe(0); // exactly 0.9 is NOT fatal
        expect(classifyBand(0.75)).not.toBe(1); // exactly 0.75 is NOT severe
    });
});

describe('NutritionHeatmapChart — computeChartData', () => {
    it('no starvation + full buffer → noStarvation band', () => {
        const foodStock = SERVICE_TARGET_PER_PERSON * 1000; // full buffer for 1000 people
        const row = makeAggRow(30, 1000, foodStock, 0);
        const data = computeChartData([row], TEST_GROUP_KEYS);
        const stats = computeGlobalStats(data, TEST_GROUP_KEYS);

        expect(stats.bandTotals.noStarvation).toBe(1000);
        expect(stats.totalStarving).toBe(0);
        expect(stats.globalAvgBuffer).toBeCloseTo(1.0, 3);
        expect(stats.globalAvgStarvation).toBe(0);
    });

    it('S = 0.95 → fatalStarvation regardless of buffer', () => {
        const foodStock = SERVICE_TARGET_PER_PERSON * 1000; // full buffer
        const weightedStarv = 0.95 * 1000;
        const row = makeAggRow(30, 1000, foodStock, weightedStarv);
        const data = computeChartData([row], TEST_GROUP_KEYS);
        const stats = computeGlobalStats(data, TEST_GROUP_KEYS);

        expect(stats.bandTotals.fatalStarvation).toBe(1000);
        expect(stats.totalStarving).toBe(1000);
        expect(stats.globalAvgStarvation).toBeCloseTo(0.95, 3);
        expect(stats.globalAvgBuffer).toBeCloseTo(1.0, 3); // high buffer but still fatal
    });

    it('S = 0.8 → severeStarvation', () => {
        const row = makeAggRow(30, 500, 0, 0.8 * 500);
        const data = computeChartData([row], TEST_GROUP_KEYS);
        const stats = computeGlobalStats(data, TEST_GROUP_KEYS);

        expect(stats.bandTotals.severeStarvation).toBe(500);
        expect(stats.totalStarving).toBe(500);
    });

    it('S = 0.6 → seriousStarvation', () => {
        const row = makeAggRow(30, 200, 0, 0.6 * 200);
        const data = computeChartData([row], TEST_GROUP_KEYS);
        const stats = computeGlobalStats(data, TEST_GROUP_KEYS);

        expect(stats.bandTotals.seriousStarvation).toBe(200);
    });

    it('S = 0.3 → moderateStarvation', () => {
        const row = makeAggRow(30, 400, 0, 0.3 * 400);
        const data = computeChartData([row], TEST_GROUP_KEYS);
        const stats = computeGlobalStats(data, TEST_GROUP_KEYS);

        expect(stats.bandTotals.moderateStarvation).toBe(400);
    });

    it('S = 0.1 → lightStarvation', () => {
        const row = makeAggRow(30, 300, 0, 0.1 * 300);
        const data = computeChartData([row], TEST_GROUP_KEYS);
        const stats = computeGlobalStats(data, TEST_GROUP_KEYS);

        expect(stats.bandTotals.lightStarvation).toBe(300);
    });

    it('empty rows are skipped (zero-population ages excluded)', () => {
        const zeroRow = makeAggRow(20, 0, 0, 0);
        const data = computeChartData([zeroRow], TEST_GROUP_KEYS);
        expect(data).toHaveLength(0);
    });

    it('avgBuffer correctly reflects grocery stock ratio', () => {
        const pop = 1000;
        const foodStock = SERVICE_TARGET_PER_PERSON * pop * 0.5; // 50% of target
        const row = makeAggRow(30, pop, foodStock, 0);
        const data = computeChartData([row], TEST_GROUP_KEYS);
        const stats = computeGlobalStats(data, TEST_GROUP_KEYS);

        expect(stats.globalAvgBuffer).toBeCloseTo(0.5, 3);
    });

    it('SERVICE_TARGET_PER_PERSON matches GROCERY_BUFFER_TARGET_TICKS × SERVICE_PER_PERSON_PER_TICK', () => {
        expect(SERVICE_TARGET_PER_PERSON).toBeCloseTo(
            GROCERY_BUFFER_TARGET_TICKS * SERVICE_PER_PERSON_PER_TICK,
            10,
        );
    });

    it('mixed ages: each age classified independently', () => {
        const age30 = makeAggRow(30, 500, SERVICE_TARGET_PER_PERSON * 500, 0); // no starvation
        const age50 = makeAggRow(50, 300, 0, 0.95 * 300); // fatal starvation
        const data = computeChartData([age30, age50], TEST_GROUP_KEYS);
        const stats = computeGlobalStats(data, TEST_GROUP_KEYS);

        expect(data).toHaveLength(2);
        expect(stats.bandTotals.noStarvation).toBe(500);
        expect(stats.bandTotals.fatalStarvation).toBe(300);
        expect(stats.totalStarving).toBe(300);
        expect(stats.starvingFrac).toBeCloseTo(300 / 800, 6);
    });
});

import { educationLevelKeys } from '@/simulation/population/education';
