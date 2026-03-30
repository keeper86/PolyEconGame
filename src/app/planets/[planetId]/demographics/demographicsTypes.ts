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

import { GROCERY_BUFFER_TARGET_TICKS, SERVICE_PER_PERSON_PER_TICK } from '@/simulation/constants';

export type GroupMode = 'occupation' | 'education';

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
};

export const SERVICE_TARGET_PER_PERSON = GROCERY_BUFFER_TARGET_TICKS * SERVICE_PER_PERSON_PER_TICK;

/** Index into groupValues tuple: population count. */
export const GV_POP = 0 as const;
/** Index into groupValues tuple: total service stock (sum over all people in group). */
export const GV_FOOD = 1 as const;
/** Index into groupValues tuple: population-weighted starvation sum. */
export const GV_STARV = 2 as const;
/** Index into groupValues tuple: population-weighted wealth sum. */
export const GV_WEALTH = 3 as const;
