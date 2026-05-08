/**
 * demographicsTypes.ts
 *
 * Shared types for the demographics accordion page.
 *
 * The server returns one AggRow per living age, with groupValues already
 * filtered by the chosen groupMode and activeSkills.  All three chart
 * components (population pyramid, wealth, food) consume this same array —
 * no further aggregation is needed on the client.
 */

import {
    GROCERY_BUFFER_TARGET_TICKS,
    HEALTHCARE_BUFFER_TARGET_TICKS,
    LOGISTICS_BUFFER_TARGET_TICKS,
    RETAIL_BUFFER_TARGET_TICKS,
    CONSTRUCTION_BUFFER_TARGET_TICKS,
    ADMINISTRATIVE_BUFFER_TARGET_TICKS,
    EDUCATION_BUFFER_TARGET_TICKS,
    SERVICE_PER_PERSON_PER_TICK,
} from '@/simulation/constants';
import type { ServiceName } from '@/simulation/population/population';

export type GroupMode = 'occupation' | 'education';

type SvcGroupPair = [number, number];
type SvcBands4 = [SvcGroupPair, SvcGroupPair, SvcGroupPair, SvcGroupPair];

/**
 * One entry per living age, produced by the server.
 *
 * - `occ` / `edu`  — full-skill population pyramid counts (never skill-filtered).
 * - `groupValues`  — 4 entries parallel to OCCUPATIONS or educationLevelKeys,
 *                    already filtered by the chosen groupMode + activeSkills.
 *
 * Each groupValues entry is a 4-tuple:
 *   [population, totalServiceStock, weightedStarvation, weightedWealth]
 *
 * Client derives:
 *   avgStarvation  = weightedStarvation / population
 *   avgWealth      = weightedWealth     / population
 *   avgBufferRatio = totalServiceStock  / (population * SERVICE_TARGET_PER_PERSON)
 *
 * - `serviceBuffers` — per-service data for non-grocery services.
 *   serviceBuffers[svc][gi] = [totalBufferUnits, weightedStarvation]
 */
export type AggRow = {
    age: number;
    total: number;
    occ: [number, number, number, number];
    edu: [number, number, number, number];
    groupValues: [
        [number, number, number, number],
        [number, number, number, number],
        [number, number, number, number],
        [number, number, number, number],
    ];
    serviceBuffers: { [K in Exclude<ServiceName, 'grocery'>]: SvcBands4 };
};

export const SERVICE_TARGET_PER_PERSON = GROCERY_BUFFER_TARGET_TICKS * SERVICE_PER_PERSON_PER_TICK;

/**
 * Target service units per person for each service.
 * bufferTargetTicks × consumptionRatePerPersonPerTick
 * Note: construction = 0.5×, administrative ≈ 0.67× the base rate.
 */
export const SERVICE_TARGET_MAP: Record<ServiceName, number> = {
    grocery: GROCERY_BUFFER_TARGET_TICKS * SERVICE_PER_PERSON_PER_TICK,
    healthcare: HEALTHCARE_BUFFER_TARGET_TICKS * SERVICE_PER_PERSON_PER_TICK,
    logistics: LOGISTICS_BUFFER_TARGET_TICKS * SERVICE_PER_PERSON_PER_TICK,
    retail: RETAIL_BUFFER_TARGET_TICKS * SERVICE_PER_PERSON_PER_TICK,
    construction: CONSTRUCTION_BUFFER_TARGET_TICKS * (SERVICE_PER_PERSON_PER_TICK / 2),
    administrative: ADMINISTRATIVE_BUFFER_TARGET_TICKS * (SERVICE_PER_PERSON_PER_TICK / 1.5),
    education: EDUCATION_BUFFER_TARGET_TICKS * SERVICE_PER_PERSON_PER_TICK,
};

/** Index into groupValues tuple: population count. */
export const GV_POP = 0 as const;
/** Index into groupValues tuple: total service stock (sum over all people in group). */
export const GV_FOOD = 1 as const;
/** Index into groupValues tuple: population-weighted starvation sum. */
export const GV_STARV = 2 as const;
/** Index into groupValues tuple: population-weighted wealth sum. */
export const GV_WEALTH = 3 as const;
