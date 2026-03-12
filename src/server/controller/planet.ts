/**
 * controller/planet.ts
 *
 * Granular tRPC endpoints for the planet detail sub-pages.
 * Each endpoint fetches the live planet from the worker and projects
 * only the data that the corresponding sub-page actually needs,
 * keeping payloads small.
 */

import { z } from 'zod';
import { procedure } from '../trpcRoot';
import { workerQueries } from '../../lib/workerQueries';
import { computePopulationTotal, computeGlobalStarvation } from '../../simulation/snapshotRepository';
import { OCCUPATIONS, SKILL } from '../../simulation/population/population';
import { educationLevelKeys } from '../../simulation/population/education';
import type { Planet } from '../../simulation/planet/planet';

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

/**
 * Minimal data for the overview sub-page:
 * planet identity, position, resources, infrastructure, environment,
 * and pre-computed population/starvation totals for the live chart point.
 */
export const getPlanetOverview = () =>
    procedure
        .input(z.object({ planetId: z.string() }))
        .output(
            z.object({
                tick: z.number(),
                overview: z
                    .object({
                        id: z.string(),
                        name: z.string(),
                        position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
                        populationTotal: z.number(),
                        starvationLevel: z.number(),
                        resources: z.record(z.string(), z.any()),
                        infrastructure: z.any(),
                        environment: z.any(),
                    })
                    .nullable(),
            }),
        )
        .query(async ({ input }) => {
            const [{ tick }, { planet }] = await Promise.all([
                workerQueries.getCurrentTick(),
                workerQueries.getPlanet(input.planetId),
            ]);
            if (!planet) {
                return { tick, overview: null };
            }
            return {
                tick,
                overview: {
                    id: planet.id,
                    name: planet.name,
                    position: planet.position,
                    populationTotal: computePopulationTotal(planet),
                    starvationLevel: computeGlobalStarvation(planet),
                    resources: planet.resources,
                    infrastructure: planet.infrastructure,
                    environment: planet.environment,
                },
            };
        });

// ---------------------------------------------------------------------------
// Demographics
// ---------------------------------------------------------------------------

/**
 * Slim demography for the demographics sub-page.
 *
 * The full `Population.demography` matrix is large (100 ages × 4 occs ×
 * 4 edus × 3 skills = 4800 cells).  For PlanetDemography we only need
 * per-age totals already broken down by edu/occ — the charts never drill
 * into individual (occ, edu, skill) triples.
 *
 * Shape sent: one row per age with { age, edu0..3, occ0..3, total }.
 */

type DemographyRow = {
    age: number;
    total: number;
    edu: [number, number, number, number]; // none, primary, secondary, tertiary
    occ: [number, number, number, number]; // unoccupied, employed, education, unableToWork
};

function buildDemographyRows(planet: Planet): DemographyRow[] {
    const rows: DemographyRow[] = [];
    for (let age = 0; age < planet.population.demography.length; age++) {
        const cohort = planet.population.demography[age];
        if (!cohort) {
            continue;
        }

        const edu: [number, number, number, number] = [0, 0, 0, 0];
        const occ: [number, number, number, number] = [0, 0, 0, 0];
        let total = 0;

        for (let occIdx = 0; occIdx < OCCUPATIONS.length; occIdx++) {
            const o = OCCUPATIONS[occIdx];
            for (let eduIdx = 0; eduIdx < educationLevelKeys.length; eduIdx++) {
                const e = educationLevelKeys[eduIdx];
                let cell = 0;
                for (const skill of SKILL) {
                    cell += cohort[o][e][skill].total;
                }
                edu[eduIdx] += cell;
                occ[occIdx] += cell;
                total += cell;
            }
        }

        rows.push({ age, total, edu, occ });
    }
    return rows;
}

export const getPlanetDemographics = () =>
    procedure
        .input(z.object({ planetId: z.string() }))
        .output(
            z.object({
                tick: z.number(),
                demographics: z
                    .object({
                        planetName: z.string(),
                        rows: z.array(
                            z.object({
                                age: z.number(),
                                total: z.number(),
                                edu: z.tuple([z.number(), z.number(), z.number(), z.number()]),
                                occ: z.tuple([z.number(), z.number(), z.number(), z.number()]),
                            }),
                        ),
                    })
                    .nullable(),
            }),
        )
        .query(async ({ input }) => {
            const [{ tick }, { planet }] = await Promise.all([
                workerQueries.getCurrentTick(),
                workerQueries.getPlanet(input.planetId),
            ]);
            if (!planet) {
                return { tick, demographics: null };
            }
            return {
                tick,
                demographics: {
                    planetName: planet.name,
                    rows: buildDemographyRows(planet),
                },
            };
        });

// ---------------------------------------------------------------------------
// Economy
// ---------------------------------------------------------------------------

/**
 * Data for the economy sub-page: bank, wagePerEdu, priceLevel, and
 * a slim demography that retains only wealth moments (mean, variance) and
 * total per (age, occ, edu, skill) cell — everything else (foodStock,
 * starvation, death stats) is dropped.
 *
 * Also includes the lastTransferMatrix for IntergenerationalTransferChart.
 */

type SlimCategory = {
    total: number;
    wealthMean: number;
    wealthVariance: number;
};

type SlimCohort = {
    [occ: string]: {
        [edu: string]: {
            [skill: string]: SlimCategory;
        };
    };
};

function buildSlimDemographyForEconomy(planet: Planet): SlimCohort[] {
    return planet.population.demography.map((cohort) => {
        if (!cohort) {
            return {} as SlimCohort;
        }
        const slimCohort: SlimCohort = {};
        for (const occ of OCCUPATIONS) {
            slimCohort[occ] = {};
            for (const edu of educationLevelKeys) {
                slimCohort[occ][edu] = {};
                for (const skill of SKILL) {
                    const cat = cohort[occ][edu][skill];
                    slimCohort[occ][edu][skill] = {
                        total: cat.total,
                        wealthMean: cat.wealth.mean,
                        wealthVariance: cat.wealth.variance,
                    };
                }
            }
        }
        return slimCohort;
    });
}

export const getPlanetEconomy = () =>
    procedure
        .input(z.object({ planetId: z.string() }))
        .output(
            z.object({
                tick: z.number(),
                economy: z
                    .object({
                        planetName: z.string(),
                        bank: z.any(),
                        wagePerEdu: z.record(z.string(), z.number()).nullable(),
                        priceLevel: z.number().nullable(),
                        /** Slim demography: wealth moments only, no food/starvation data. */
                        demography: z.array(z.any()),
                        /** Transfer matrix for intergenerational chart. */
                        lastTransferMatrix: z.array(z.any()),
                    })
                    .nullable(),
            }),
        )
        .query(async ({ input }) => {
            const [{ tick }, { planet }] = await Promise.all([
                workerQueries.getCurrentTick(),
                workerQueries.getPlanet(input.planetId),
            ]);
            if (!planet) {
                return { tick, economy: null };
            }
            return {
                tick,
                economy: {
                    planetName: planet.name,
                    bank: planet.bank,
                    wagePerEdu: (planet.wagePerEdu as Record<string, number> | null) ?? null,
                    priceLevel: planet.priceLevel ?? null,
                    demography: buildSlimDemographyForEconomy(planet),
                    lastTransferMatrix: planet.population.lastTransferMatrix,
                },
            };
        });

// ---------------------------------------------------------------------------
// Food & Nutrition
// ---------------------------------------------------------------------------

/**
 * Data for the food & nutrition sub-page.
 *
 * Strips the demography down to only food-relevant fields:
 * (total, foodStock, starvationLevel) per (age, occ, edu, skill) cell.
 * Wealth moments and death/disability stats are dropped entirely.
 */

type FoodCategory = {
    total: number;
    foodStock: number;
    starvationLevel: number;
};

type FoodCohort = {
    [occ: string]: {
        [edu: string]: {
            [skill: string]: FoodCategory;
        };
    };
};

function buildFoodDemography(planet: Planet): FoodCohort[] {
    return planet.population.demography.map((cohort) => {
        if (!cohort) {
            return {} as FoodCohort;
        }
        const slimCohort: FoodCohort = {};
        for (const occ of OCCUPATIONS) {
            slimCohort[occ] = {};
            for (const edu of educationLevelKeys) {
                slimCohort[occ][edu] = {};
                for (const skill of SKILL) {
                    const cat = cohort[occ][edu][skill];
                    slimCohort[occ][edu][skill] = {
                        total: cat.total,
                        foodStock: cat.foodStock,
                        starvationLevel: cat.starvationLevel,
                    };
                }
            }
        }
        return slimCohort;
    });
}

export const getPlanetFood = () =>
    procedure
        .input(z.object({ planetId: z.string() }))
        .output(
            z.object({
                tick: z.number(),
                food: z
                    .object({
                        planetName: z.string(),
                        /** Food-only demography: total, foodStock, starvationLevel per cell. */
                        demography: z.array(z.any()),
                        priceLevel: z.number(),
                        starvationLevel: z.number(),
                    })
                    .nullable(),
            }),
        )
        .query(async ({ input }) => {
            const [{ tick }, { planet }] = await Promise.all([
                workerQueries.getCurrentTick(),
                workerQueries.getPlanet(input.planetId),
            ]);
            if (!planet) {
                return { tick, food: null };
            }
            return {
                tick,
                food: {
                    planetName: planet.name,
                    demography: buildFoodDemography(planet),
                    priceLevel: planet.priceLevel ?? 1,
                    starvationLevel: computeGlobalStarvation(planet),
                },
            };
        });
