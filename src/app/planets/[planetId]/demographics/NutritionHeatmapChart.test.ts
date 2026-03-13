/**
 * NutritionHeatmapChart.test.ts
 *
 * Unit test for the data transformation logic used by NutritionHeatmapChart.
 *
 * The chart classifies each population cell using a **two-tier** scheme:
 *   1. Starvation bands — based on the physiological starvationLevel (S):
 *      severe (S > 0.9), moderate (S > 0.3), light (S > 0)
 *   2. Food-security bands — based on instantaneous buffer ratio (when S = 0):
 *      food insecure (buffer < 10%), adequate (buffer < 100%), full buffer (≥ 100%)
 */

import { describe, it, expect } from 'vitest';
import { FOOD_BUFFER_TARGET_TICKS, FOOD_PER_PERSON_PER_TICK } from '@/simulation/constants';
import { educationLevelKeys } from '@/simulation/population/education';
import type { EducationLevelType } from '@/simulation/population/education';
import type { Occupation, Skill, PopulationCategory, Cohort } from '@/simulation/population/population';
import { OCCUPATIONS, SKILL, createEmptyPopulationCohort } from '@/simulation/population/population';

// ---- Replicate chart constants ----
const FOOD_TARGET_PER_PERSON = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

const BANDS = [
    { key: 'severeStarvation', label: 'Severe starvation' },
    { key: 'moderateStarvation', label: 'Moderate starvation' },
    { key: 'lightStarvation', label: 'Light starvation' },
    { key: 'foodInsecure', label: 'Food insecure' },
    { key: 'adequate', label: 'Adequate' },
    { key: 'fullBuffer', label: 'Full buffer' },
] as const;

type BandKey = (typeof BANDS)[number]['key'];

/** Two-tier classification: starvation level first, then buffer ratio. */
function classifyBand(starvationLevel: number, bufferRatio: number): number {
    if (starvationLevel > 0.9) {
        return 0;
    }
    if (starvationLevel > 0.3) {
        return 1;
    }
    if (starvationLevel > 0) {
        return 2;
    }
    if (bufferRatio < 0.1) {
        return 3;
    }
    if (bufferRatio < 1.0) {
        return 4;
    }
    return 5;
}

type ChartRow = {
    age: number;
    pop: number;
    severeStarvation: number;
    moderateStarvation: number;
    lightStarvation: number;
    foodInsecure: number;
    adequate: number;
    fullBuffer: number;
    avgBufferRatio: number;
    avgStarvationLevel: number;
    acuteStarvationFrac: number;
};

/** Replicate the useMemo computation from NutritionHeatmapChart. */
function computeChartData(
    demography: Cohort<PopulationCategory>[],
    filterEdu: EducationLevelType | null = null,
    filterOcc: Occupation | null = null,
): ChartRow[] {
    const rows: ChartRow[] = [];
    const edus: readonly EducationLevelType[] = filterEdu ? [filterEdu] : educationLevelKeys;
    const occs: readonly Occupation[] = filterOcc ? [filterOcc] : ([...OCCUPATIONS] as Occupation[]);

    for (let age = 0; age < demography.length; age++) {
        const cohort = demography[age];
        if (!cohort) {
            continue;
        }

        const bandPops: number[] = new Array(BANDS.length).fill(0);
        let totalPop = 0;
        let weightedRatio = 0;
        let weightedStarvation = 0;
        let acutePop = 0;

        for (const occ of occs) {
            for (const edu of edus) {
                for (const skill of SKILL) {
                    const cat = cohort[occ][edu][skill];
                    if (cat.total <= 0) {
                        continue;
                    }

                    const stock = cat.foodStock;
                    const bufferRatio = FOOD_TARGET_PER_PERSON > 0 ? stock / (FOOD_TARGET_PER_PERSON * cat.total) : 0;

                    totalPop += cat.total;
                    weightedRatio += cat.total * bufferRatio;
                    weightedStarvation += cat.total * cat.starvationLevel;
                    bandPops[classifyBand(cat.starvationLevel, bufferRatio)] += cat.total;

                    if (stock < FOOD_PER_PERSON_PER_TICK * cat.total) {
                        acutePop += cat.total;
                    }
                }
            }
        }

        rows.push({
            age,
            pop: totalPop,
            severeStarvation: bandPops[0],
            moderateStarvation: bandPops[1],
            lightStarvation: bandPops[2],
            foodInsecure: bandPops[3],
            adequate: bandPops[4],
            fullBuffer: bandPops[5],
            avgBufferRatio: totalPop > 0 ? weightedRatio / totalPop : 0,
            avgStarvationLevel: totalPop > 0 ? weightedStarvation / totalPop : 0,
            acuteStarvationFrac: totalPop > 0 ? acutePop / totalPop : 0,
        });
    }
    return rows;
}

/** Compute global stats from chart data, matching the component's rendering. */
function computeGlobalStats(chartData: ChartRow[]) {
    const totalPop = chartData.reduce((s, d) => s + d.pop, 0);
    const globalAvgStarvation =
        totalPop > 0 ? chartData.reduce((s, d) => s + d.avgStarvationLevel * d.pop, 0) / totalPop : 0;
    const globalAvgRatio = totalPop > 0 ? chartData.reduce((s, d) => s + d.avgBufferRatio * d.pop, 0) / totalPop : 0;
    const globalBands = BANDS.map((b) => chartData.reduce((s, d) => s + (d[b.key as BandKey] as number), 0));
    const globalStarvingPop = globalBands[0] + globalBands[1] + globalBands[2];

    return {
        totalPop,
        globalAvgStarvation,
        globalAvgRatio,
        globalBands,
        globalStarvingPop,
        starvingFrac: totalPop > 0 ? globalStarvingPop / totalPop : 0,
    };
}

/** Helper: create a population with one cell. */
function makePopulation(
    age: number,
    occ: Occupation,
    edu: EducationLevelType,
    skill: Skill,
    total: number,
    foodStock: number,
    starvationLevel = 0,
): { demography: Cohort<PopulationCategory>[] } {
    const demography = Array.from({ length: Math.max(age + 1, 1) }, () => createEmptyPopulationCohort());
    demography[age][occ][edu][skill].total = total;
    demography[age][occ][edu][skill].foodStock = foodStock;
    demography[age][occ][edu][skill].starvationLevel = starvationLevel;
    return { demography };
}

describe('NutritionHeatmapChart — two-tier classification', () => {
    it('classifies healthy + full buffer as fullBuffer', () => {
        const target = FOOD_TARGET_PER_PERSON * 1000;
        const pop = makePopulation(30, 'employed', 'primary', 'novice', 1000, target, 0);
        const data = computeChartData(pop.demography);
        const stats = computeGlobalStats(data);

        expect(stats.globalBands[5]).toBe(1000); // fullBuffer
        expect(stats.globalStarvingPop).toBe(0);
        expect(stats.globalAvgRatio).toBeCloseTo(1.0, 3);
        expect(stats.globalAvgStarvation).toBe(0);
    });

    it('classifies S=0 + no food as food insecure', () => {
        // S=0 but zero food stock → food insecure (NOT starving)
        const pop = makePopulation(30, 'employed', 'primary', 'novice', 1000, 0, 0);
        const data = computeChartData(pop.demography);
        const stats = computeGlobalStats(data);

        expect(stats.globalBands[3]).toBe(1000); // food insecure
        expect(stats.globalStarvingPop).toBe(0); // NOT starving (S=0)
    });

    it('classifies S>0.9 as severe starvation regardless of buffer', () => {
        // High starvation level but has food (recovering)
        const target = FOOD_TARGET_PER_PERSON * 1000;
        const pop = makePopulation(30, 'employed', 'primary', 'novice', 1000, target * 2, 0.95);
        const data = computeChartData(pop.demography);
        const stats = computeGlobalStats(data);

        expect(stats.globalBands[0]).toBe(1000); // severe starvation (S > 0.9)
        expect(stats.globalStarvingPop).toBe(1000);
        expect(stats.globalAvgRatio).toBeCloseTo(2.0, 3); // buffer is 200%
        expect(stats.globalAvgStarvation).toBeCloseTo(0.95, 3);
    });

    it('classifies S=0.5 as moderate starvation', () => {
        const pop = makePopulation(30, 'employed', 'primary', 'novice', 1000, 0, 0.5);
        const data = computeChartData(pop.demography);
        const stats = computeGlobalStats(data);

        expect(stats.globalBands[1]).toBe(1000); // moderate starvation
        expect(stats.globalStarvingPop).toBe(1000);
    });

    it('classifies S=0.1 as light starvation', () => {
        const pop = makePopulation(30, 'employed', 'primary', 'novice', 1000, 0, 0.1);
        const data = computeChartData(pop.demography);
        const stats = computeGlobalStats(data);

        expect(stats.globalBands[2]).toBe(1000); // light starvation (0 < S ≤ 0.3)
        expect(stats.globalStarvingPop).toBe(1000);
    });

    it('classifies S=0 + buffer=50% as adequate', () => {
        const target = FOOD_TARGET_PER_PERSON * 1000;
        const pop = makePopulation(30, 'employed', 'primary', 'novice', 1000, target * 0.5, 0);
        const data = computeChartData(pop.demography);
        const stats = computeGlobalStats(data);

        expect(stats.globalBands[4]).toBe(1000); // adequate
        expect(stats.globalStarvingPop).toBe(0);
    });

    it('the old impossible state is now consistent', () => {
        // The previously impossible scenario: high avg buffer + 100% "starving".
        // With the new semantics, people with S=0 and buffer=105% are NOT starving.
        // Only people with S>0 are in starvation bands.
        const demography = Array.from({ length: 31 }, () => createEmptyPopulationCohort());

        // Half the population: S=0, 200% buffer → should be fullBuffer
        demography[30].employed.primary.novice.total = 500;
        demography[30].employed.primary.novice.foodStock = 500 * FOOD_TARGET_PER_PERSON * 2;
        demography[30].employed.primary.novice.starvationLevel = 0;

        // Other half: S=0.1 (recovering), 50% buffer → should be lightStarvation
        demography[30].unoccupied.none.novice.total = 500;
        demography[30].unoccupied.none.novice.foodStock = 500 * FOOD_TARGET_PER_PERSON * 0.5;
        demography[30].unoccupied.none.novice.starvationLevel = 0.1;

        const data = computeChartData(demography);
        const stats = computeGlobalStats(data);

        // avg buffer = (500×2.0 + 500×0.5) / 1000 = 1.25 = 125%
        expect(stats.globalAvgRatio).toBeCloseTo(1.25, 3);
        // starving fraction = 500/1000 = 50% (only the S>0 group)
        expect(stats.starvingFrac).toBe(0.5);
        // These are now consistent: high buffer + only partial starving
        expect(stats.globalBands[5]).toBe(500); // fullBuffer
        expect(stats.globalBands[2]).toBe(500); // light starvation
    });

    it('handles zero-population ages correctly', () => {
        const demography = Array.from({ length: 31 }, () => createEmptyPopulationCohort());
        demography[30].employed.primary.novice.total = 100;
        demography[30].employed.primary.novice.foodStock = 100 * FOOD_TARGET_PER_PERSON;
        demography[30].employed.primary.novice.starvationLevel = 0;

        const data = computeChartData(demography);
        const stats = computeGlobalStats(data);

        expect(stats.totalPop).toBe(100);
        expect(stats.globalAvgRatio).toBeCloseTo(1.0, 3);
        expect(stats.globalStarvingPop).toBe(0);
    });

    it('classifyBand boundary cases', () => {
        expect(classifyBand(0.95, 2.0)).toBe(0); // S>0.9 → severe
        expect(classifyBand(0.9, 2.0)).toBe(1); // S=0.9 (not >0.9) → moderate
        expect(classifyBand(0.5, 2.0)).toBe(1); // S>0.3 → moderate
        expect(classifyBand(0.3, 2.0)).toBe(2); // S=0.3 (not >0.3) → light
        expect(classifyBand(0.01, 0)).toBe(2); // S>0 → light
        expect(classifyBand(0, 0)).toBe(3); // S=0, buffer<0.1 → food insecure
        expect(classifyBand(0, 0.05)).toBe(3); // S=0, buffer<0.1 → food insecure
        expect(classifyBand(0, 0.1)).toBe(4); // S=0, 0.1≤buffer<1.0 → adequate
        expect(classifyBand(0, 0.99)).toBe(4); // S=0, buffer<1.0 → adequate
        expect(classifyBand(0, 1.0)).toBe(5); // S=0, buffer≥1.0 → full buffer
        expect(classifyBand(0, 5.0)).toBe(5); // S=0, buffer≥1.0 → full buffer
    });

    it('FOOD_TARGET_PER_PERSON has expected value', () => {
        expect(FOOD_TARGET_PER_PERSON).toBeCloseTo(1 / 12, 10);
    });
});
