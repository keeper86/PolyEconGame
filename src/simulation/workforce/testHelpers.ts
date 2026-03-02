/**
 * workforce/testHelpers.ts
 *
 * Shared test helpers for all workforce module tests.
 * Provides factory functions for Agents, Planets, StorageFacilities,
 * and invariant assertion helpers for population conservation checks.
 */

import { expect } from 'vitest';

import type { Agent, EducationLevelType, Planet, Occupation } from '../planet';
import { educationLevelKeys, OCCUPATIONS, maxAge } from '../planet';
import type { StorageFacility, ProductionFacility } from '../facilities';
import { emptyCohort, sumCohort } from '../population/populationHelpers';

import { createWorkforceDemography, NOTICE_PERIOD_MONTHS } from './workforceHelpers';

// ============================================================================
// Factory helpers
// ============================================================================

export function makeStorageFacility(): StorageFacility {
    return {
        planetId: 'p',
        id: 's',
        name: 'test-storage',
        scale: 1,
        powerConsumptionPerTick: 0,
        workerRequirement: {},
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        capacity: { volume: 1e9, mass: 1e9 },
        current: { volume: 0, mass: 0 },
        currentInStorage: {},
    } as StorageFacility;
}

export function makeAgent(id = 'agent-1'): Agent {
    return {
        id,
        name: id,
        associatedPlanetId: 'p',
        wealth: 0,
        transportShips: [],
        assets: {
            p: {
                resourceClaims: [],
                resourceTenancies: [],
                productionFacilities: [],
                storageFacility: makeStorageFacility(),
                allocatedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 },
                workforceDemography: createWorkforceDemography(),
            },
        },
    };
}

export function makeGovernmentAgent(): Agent {
    return makeAgent('gov-1');
}

export function makePlanet(unoccupiedByEdu?: Partial<Record<string, number>>): Planet {
    const demography = Array.from({ length: maxAge + 1 }, () => emptyCohort());

    if (unoccupiedByEdu) {
        for (const [edu, total] of Object.entries(unoccupiedByEdu)) {
            const workingAges = 64 - 18 + 1; // ages 18–64 inclusive
            const perAge = Math.floor((total ?? 0) / workingAges);
            const remainder = (total ?? 0) - perAge * workingAges;
            for (let age = 18; age <= 64; age++) {
                (demography[age] as Record<string, Record<string, number>>)[edu].unoccupied =
                    perAge + (age === 18 ? remainder : 0);
            }
        }
    }

    const gov = makeGovernmentAgent();

    return {
        id: 'p',
        name: 'Test Planet',
        position: { x: 0, y: 0, z: 0 },
        population: { demography, starvationLevel: 0 },
        resources: {},
        government: gov,
        infrastructure: {
            primarySchools: 0,
            secondarySchools: 0,
            universities: 0,
            hospitals: 0,
            mobility: { roads: 0, railways: 0, airports: 0, seaports: 0, spaceports: 0 },
            energy: { production: 0 },
        },
        environment: {
            naturalDisasters: { earthquakes: 0, floods: 0, storms: 0 },
            pollution: { air: 0, water: 0, soil: 0 },
            regenerationRates: {
                air: { constant: 0, percentage: 0 },
                water: { constant: 0, percentage: 0 },
                soil: { constant: 0, percentage: 0 },
            },
        },
    };
}

/** Creates a production facility with given worker requirements. */
export function makeFacility(workerReq: Partial<Record<EducationLevelType, number>>, scale = 1): ProductionFacility {
    return {
        planetId: 'p',
        id: 'f1',
        name: 'Test Facility',
        scale,
        lastTickEfficiencyInPercent: 0,
        powerConsumptionPerTick: 0,
        workerRequirement: workerReq as Record<string, number>,
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        needs: [],
        produces: [],
    } as ProductionFacility;
}

// ============================================================================
// Invariant / assertion helpers
// ============================================================================

/**
 * Count total people across ALL education levels and ALL occupations
 * in the entire population demography.
 */
export function totalPopulation(planet: Planet): number {
    let total = 0;
    for (const cohort of planet.population.demography) {
        total += sumCohort(cohort);
    }
    return total;
}

/**
 * Sum population demography for a specific education and occupation across
 * all ages.
 */
export function sumPopOcc(planet: Planet, edu: EducationLevelType, occ: Occupation): number {
    let total = 0;
    for (const cohort of planet.population.demography) {
        total += cohort[edu][occ];
    }
    return total;
}

/**
 * Sum active + departing + retiring across all tenure cohorts for a given
 * education level in an agent's workforce on a specific planet.
 */
export function sumWorkforceForEdu(agent: Agent, planetId: string, edu: EducationLevelType): number {
    const wf = agent.assets[planetId]?.workforceDemography;
    if (!wf) {
        return 0;
    }
    let total = 0;
    for (const cohort of wf) {
        total += cohort.active[edu];
        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
            total += cohort.departing[edu][m];
            total += cohort.retiring[edu][m];
        }
    }
    return total;
}

/**
 * Core conservation invariant: for each edu level, workforce total
 * (active + departing + retiring) for all agents of a given occupation
 * must equal the population's count for that occupation.
 */
export function assertWorkforcePopulationConsistency(planet: Planet, agents: Agent[], label = ''): void {
    for (const edu of educationLevelKeys) {
        // Company agents
        const companyAgents = agents.filter((a) => a.id !== planet.government.id);
        const popCompany = sumPopOcc(planet, edu, 'company');
        let wfCompany = 0;
        for (const agent of companyAgents) {
            wfCompany += sumWorkforceForEdu(agent, planet.id, edu);
        }
        expect(
            wfCompany,
            `${label} company workforce ↔ population mismatch for edu=${edu}: wf=${wfCompany}, pop=${popCompany}`,
        ).toBe(popCompany);

        // Government agent
        const govWf = sumWorkforceForEdu(planet.government, planet.id, edu);
        const popGov = sumPopOcc(planet, edu, 'government');
        expect(govWf, `${label} gov workforce ↔ population mismatch for edu=${edu}: wf=${govWf}, pop=${popGov}`).toBe(
            popGov,
        );
    }
}

/**
 * Total-population conservation: the total number of people across all
 * education levels and occupations must not change (no births, deaths,
 * or immigration in these tests).
 */
export function assertTotalPopulationConserved(planet: Planet, expectedTotal: number, label = ''): void {
    const actual = totalPopulation(planet);
    expect(actual, `${label} total population changed: expected=${expectedTotal}, got=${actual}`).toBe(expectedTotal);
}

/**
 * Assert all population slots and workforce slots are non-negative.
 */
export function assertAllNonNegative(planet: Planet, agents: Agent[]): void {
    for (let age = 0; age < planet.population.demography.length; age++) {
        const cohort = planet.population.demography[age];
        for (const edu of educationLevelKeys) {
            for (const occ of OCCUPATIONS) {
                expect(
                    cohort[edu][occ],
                    `negative population at age=${age}, edu=${edu}, occ=${occ}: ${cohort[edu][occ]}`,
                ).toBeGreaterThanOrEqual(0);
            }
        }
    }

    for (const agent of agents) {
        const wf = agent.assets.p?.workforceDemography;
        if (!wf) {
            continue;
        }
        for (let t = 0; t < wf.length; t++) {
            for (const edu of educationLevelKeys) {
                expect(wf[t].active[edu]).toBeGreaterThanOrEqual(0);
                for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
                    expect(wf[t].departing[edu][m]).toBeGreaterThanOrEqual(0);
                    expect(wf[t].departingFired[edu][m]).toBeGreaterThanOrEqual(0);
                    expect(wf[t].retiring[edu][m]).toBeGreaterThanOrEqual(0);
                }
            }
        }
    }
}
