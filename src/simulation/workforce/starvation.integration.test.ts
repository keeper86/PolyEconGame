/**
 * Integration test that reproduces the population ↔ workforce divergence
 * that occurs during starvation events.  The original bug manifested as
 * agents reporting more active workers than the population demography has
 * in the corresponding occupation.
 *
 * Key: we run the full advanceTick with starvation to trigger mortality
 * and disability paths, then verify consistency after every tick.
 */
import { describe, expect, it } from 'vitest';

import { MIN_EMPLOYABLE_AGE, TICKS_PER_MONTH } from '../constants';
import { advanceTick } from '../engine';
import type { Agent, EducationLevelType, GameState, Occupation, Planet } from '../planet';
import { educationLevelKeys, maxAge } from '../planet';
import { emptyCohort } from '../population/populationHelpers';
import { createWorkforceDemography, NOTICE_PERIOD_MONTHS } from './workforceHelpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStorageFacility() {
    return {
        planetId: 'p',
        id: 's',
        name: 's',
        scale: 1,
        powerConsumptionPerTick: 0,
        workerRequirement: {},
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        capacity: { volume: 1e9, mass: 1e9 },
        current: { volume: 0, mass: 0 },
        currentInStorage: {},
    };
}

function makeAgent(id = 'agent-1'): Agent {
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
    } as Agent;
}

function makePlanet(totalPop: number): Planet {
    const demography = Array.from({ length: maxAge + 1 }, () => emptyCohort());

    // Distribute population across working ages with various edu levels
    const workingAges = 64 - 18 + 1; // 18–64
    const perAge = Math.floor(totalPop / workingAges);
    let rem = totalPop - perAge * workingAges;

    for (let age = 18; age <= 64; age++) {
        const n = perAge + (rem > 0 ? 1 : 0);
        if (rem > 0) {
            rem--;
        }
        // Split across education levels
        demography[age].none.unoccupied = Math.floor(n * 0.05);
        demography[age].primary.unoccupied = Math.floor(n * 0.35);
        demography[age].secondary.unoccupied = Math.floor(n * 0.35);
        demography[age].tertiary.unoccupied = Math.floor(n * 0.2);
        // Put remainder into primary
        const assigned =
            demography[age].none.unoccupied +
            demography[age].primary.unoccupied +
            demography[age].secondary.unoccupied +
            demography[age].tertiary.unoccupied;
        demography[age].primary.unoccupied += n - assigned;
    }

    const gov = makeAgent('gov-1');

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
    } as Planet;
}

function sumPopOccPerEdu(planet: Planet, occ: Occupation): Record<EducationLevelType, number> {
    const result = {} as Record<EducationLevelType, number>;
    for (const edu of educationLevelKeys) {
        result[edu] = 0;
    }
    for (let age = MIN_EMPLOYABLE_AGE; age < planet.population.demography.length; age++) {
        const cohort = planet.population.demography[age];
        for (const edu of educationLevelKeys) {
            result[edu] += cohort[edu][occ] ?? 0;
        }
    }
    return result;
}

function sumWorkforceActivePerEdu(
    agents: Agent[],
    planetId: string,
    isGov: boolean,
): Record<EducationLevelType, number> {
    const result = {} as Record<EducationLevelType, number>;
    for (const edu of educationLevelKeys) {
        result[edu] = 0;
    }
    for (const agent of agents) {
        if (isGov !== /gov|government/i.test(agent.id)) {
            continue;
        }
        const wf = agent.assets[planetId]?.workforceDemography;
        if (!wf) {
            continue;
        }
        for (const cohort of wf) {
            for (const edu of educationLevelKeys) {
                result[edu] += cohort.active[edu];
            }
        }
    }
    return result;
}

function sumWorkforcePipelinePerEdu(
    agents: Agent[],
    planetId: string,
    isGov: boolean,
): Record<EducationLevelType, number> {
    const result = {} as Record<EducationLevelType, number>;
    for (const edu of educationLevelKeys) {
        result[edu] = 0;
    }
    for (const agent of agents) {
        if (isGov !== /gov|government/i.test(agent.id)) {
            continue;
        }
        const wf = agent.assets[planetId]?.workforceDemography;
        if (!wf) {
            continue;
        }
        for (const cohort of wf) {
            for (const edu of educationLevelKeys) {
                for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
                    result[edu] += cohort.departing[edu][m];
                    result[edu] += cohort.retiring[edu][m];
                }
            }
        }
    }
    return result;
}

/**
 * Check the full consistency invariant:
 * For each edu level, workforce (active + departing + retiring) must equal
 * population occupation count.
 */
function checkFullConsistency(planet: Planet, agents: Agent[], label: string): string[] {
    const discrepancies: string[] = [];

    // Government
    const popGov = sumPopOccPerEdu(planet, 'government');
    const wfGovActive = sumWorkforceActivePerEdu(agents, planet.id, true);
    const wfGovPipeline = sumWorkforcePipelinePerEdu(agents, planet.id, true);

    for (const edu of educationLevelKeys) {
        const wfTotal = wfGovActive[edu] + wfGovPipeline[edu];
        if (wfTotal !== popGov[edu]) {
            discrepancies.push(
                `${label} gov ${edu}: wf(active=${wfGovActive[edu]}+pipe=${wfGovPipeline[edu]}=${wfTotal}) != pop(${popGov[edu]}) diff=${wfTotal - popGov[edu]}`,
            );
        }
    }

    // Company
    const popCompany = sumPopOccPerEdu(planet, 'company');
    const wfCompanyActive = sumWorkforceActivePerEdu(agents, planet.id, false);
    const wfCompanyPipeline = sumWorkforcePipelinePerEdu(agents, planet.id, false);

    for (const edu of educationLevelKeys) {
        const wfTotal = wfCompanyActive[edu] + wfCompanyPipeline[edu];
        if (wfTotal !== popCompany[edu]) {
            discrepancies.push(
                `${label} company ${edu}: wf(active=${wfCompanyActive[edu]}+pipe=${wfCompanyPipeline[edu]}=${wfTotal}) != pop(${popCompany[edu]}) diff=${wfTotal - popCompany[edu]}`,
            );
        }
    }

    return discrepancies;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('starvation integration — population ↔ workforce consistency', () => {
    it('maintains consistency through starvation mortality for 3 months', () => {
        const planet = makePlanet(500_000);
        const gov = planet.government;
        const company = makeAgent('company-1');

        // Give the gov agent a workforce demography on the planet
        gov.assets = {
            p: {
                resourceClaims: [],
                resourceTenancies: [],
                productionFacilities: [],
                storageFacility: makeStorageFacility(),
                allocatedWorkers: { none: 500, primary: 3000, secondary: 3000, tertiary: 1500, quaternary: 0 },
                workforceDemography: createWorkforceDemography(),
            },
        };
        company.assets.p.allocatedWorkers = {
            none: 200,
            primary: 2000,
            secondary: 2000,
            tertiary: 1000,
            quaternary: 0,
        };

        const agents = [company, gov];
        const gameState: GameState = { tick: 0, planets: [planet], agents };

        // Phase 1: hire workers (run a few ticks to fill up)
        for (let t = 1; t <= 5; t++) {
            gameState.tick = t;
            advanceTick(gameState);
        }

        // Verify initial consistency
        const initial = checkFullConsistency(planet, agents, 'initial');
        expect(initial, 'initial consistency failed:\n' + initial.join('\n')).toEqual([]);

        // Phase 2: induce starvation
        planet.population.starvationLevel = 0.8; // severe starvation

        // Run for 3 months (90 ticks) with starvation
        for (let t = 6; t <= 96; t++) {
            gameState.tick = t;
            advanceTick(gameState);

            const d = checkFullConsistency(planet, agents, `tick ${t}`);
            if (d.length > 0) {
                // Print the first few discrepancies for debugging
                throw new Error(`Consistency check failed at tick ${t}:\n${d.slice(0, 10).join('\n')}`);
            }
        }
    });

    it('maintains consistency across a full year with starvation', () => {
        const planet = makePlanet(200_000);
        const gov = planet.government;
        const company = makeAgent('company-1');

        gov.assets = {
            p: {
                resourceClaims: [],
                resourceTenancies: [],
                productionFacilities: [],
                storageFacility: makeStorageFacility(),
                allocatedWorkers: { none: 200, primary: 1500, secondary: 1500, tertiary: 800, quaternary: 0 },
                workforceDemography: createWorkforceDemography(),
            },
        };
        company.assets.p.allocatedWorkers = { none: 100, primary: 800, secondary: 800, tertiary: 400, quaternary: 0 };

        const agents = [company, gov];
        const gameState: GameState = { tick: 0, planets: [planet], agents };

        // Hire workers
        for (let t = 1; t <= 5; t++) {
            gameState.tick = t;
            advanceTick(gameState);
        }

        // Starvation event through full year + extra months
        planet.population.starvationLevel = 0.7;

        const totalTicks = TICKS_PER_MONTH * 15; // 15 months (> 1 year)
        for (let t = 6; t <= totalTicks + 5; t++) {
            gameState.tick = t;
            advanceTick(gameState);

            const d = checkFullConsistency(planet, agents, `tick ${t}`);
            if (d.length > 0) {
                throw new Error(`Consistency check failed at tick ${t}:\n${d.slice(0, 10).join('\n')}`);
            }
        }
    });

    it('maintains consistency through extreme starvation (S=1) for 1 month', () => {
        const planet = makePlanet(100_000);
        const gov = planet.government;
        const company = makeAgent('company-1');

        gov.assets = {
            p: {
                resourceClaims: [],
                resourceTenancies: [],
                productionFacilities: [],
                storageFacility: makeStorageFacility(),
                allocatedWorkers: { none: 100, primary: 500, secondary: 500, tertiary: 200, quaternary: 0 },
                workforceDemography: createWorkforceDemography(),
            },
        };
        company.assets.p.allocatedWorkers = { none: 50, primary: 200, secondary: 200, tertiary: 100, quaternary: 0 };

        const agents = [company, gov];
        const gameState: GameState = { tick: 0, planets: [planet], agents };

        // Phase 1: hire
        for (let t = 1; t <= 3; t++) {
            gameState.tick = t;
            advanceTick(gameState);
        }

        // Phase 2: extreme starvation
        planet.population.starvationLevel = 1.0;

        for (let t = 4; t <= TICKS_PER_MONTH + 4; t++) {
            gameState.tick = t;
            advanceTick(gameState);

            const d = checkFullConsistency(planet, agents, `tick ${t}`);
            if (d.length > 0) {
                throw new Error(`Consistency check failed at tick ${t}:\n${d.slice(0, 10).join('\n')}`);
            }
        }
    });

    it('maintains consistency across 4 years with starvation and large population', () => {
        const planet = makePlanet(2_000_000);
        const gov = planet.government;
        const company = makeAgent('company-1');

        gov.assets = {
            p: {
                resourceClaims: [],
                resourceTenancies: [],
                productionFacilities: [],
                storageFacility: makeStorageFacility(),
                allocatedWorkers: { none: 1000, primary: 8000, secondary: 8000, tertiary: 4000, quaternary: 0 },
                workforceDemography: createWorkforceDemography(),
            },
        };
        company.assets.p.allocatedWorkers = {
            none: 500,
            primary: 4000,
            secondary: 4000,
            tertiary: 2000,
            quaternary: 0,
        };

        const agents = [company, gov];
        const gameState: GameState = { tick: 0, planets: [planet], agents };

        // Hire workers (several ticks)
        for (let t = 1; t <= 10; t++) {
            gameState.tick = t;
            advanceTick(gameState);
        }

        // Phase 1: normal operation for 6 months
        for (let t = 11; t <= 11 + TICKS_PER_MONTH * 6; t++) {
            gameState.tick = t;
            advanceTick(gameState);
        }

        // Phase 2: starvation event for the rest (3+ years)
        planet.population.starvationLevel = 0.8;
        const startTick = 11 + TICKS_PER_MONTH * 6 + 1;
        const endTick = startTick + TICKS_PER_MONTH * 42; // 3.5 years of starvation

        for (let t = startTick; t <= endTick; t++) {
            gameState.tick = t;
            advanceTick(gameState);

            // Only check every 10th tick to speed up test
            if (t % 10 === 0) {
                const d = checkFullConsistency(planet, agents, `tick ${t}`);
                if (d.length > 0) {
                    throw new Error(`Consistency check failed at tick ${t}:\n${d.slice(0, 10).join('\n')}`);
                }
            }
        }
    });
});
