import { describe, it, expect, vi } from 'vitest';

// Mock constants early so modules pick up the test-friendly tick rates
vi.doMock('./constants', () => {
    const TICKS_PER_MONTH = 2;
    const MONTHS_PER_YEAR = 4;
    const TICKS_PER_YEAR = TICKS_PER_MONTH * MONTHS_PER_YEAR;
    return {
        TICKS_PER_MONTH,
        MONTHS_PER_YEAR,
        TICKS_PER_YEAR,
        FOOD_PER_PERSON_PER_TICK: 1 / TICKS_PER_YEAR,
        MIN_EMPLOYABLE_AGE: 14,
        isMonthBoundary: (tick: number) => tick > 0 && tick % TICKS_PER_MONTH === 0,
        isYearBoundary: (tick: number) => tick > 0 && tick % TICKS_PER_YEAR === 0,
    };
});

// Now import simulation modules which will use the mocked constants
import { advanceTick } from './engine';
import { createWorkforceDemography } from './workforce';
import { createPopulation } from './entities';
import { totalPopulation } from './populationHelpers';
import { TICKS_PER_YEAR } from './constants';
import type { Planet, Agent, Infrastructure, Environment } from './planet';

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

function makeAgent(id = 'agent-1') {
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

function makePlanet(totalPop = 10000) {
    // reuse createPopulation from entities to mirror startup conditions
    const p: Planet = {
        id: 'p',
        name: 'P',
        position: { x: 0, y: 0, z: 0 },
        population: createPopulation(totalPop),
        resources: {},
        government: makeAgent('gov-1') as unknown as Agent,
        infrastructure: {
            primarySchools: 0,
            secondarySchools: 0,
            universities: 0,
            hospitals: 0,
            mobility: { roads: 0, railways: 0, airports: 0, seaports: 0, spaceports: 0 },
            energy: { production: 0 },
        } as Infrastructure,
        environment: {
            naturalDisasters: { earthquakes: 0, floods: 0, storms: 0 },
            pollution: { air: 0, water: 0, soil: 0 },
            regenerationRates: {
                air: { constant: 0, percentage: 0 },
                water: { constant: 0, percentage: 0 },
                soil: { constant: 0, percentage: 0 },
            },
        } as Environment,
    };

    // attach workforce demography to government
    (p.government as Agent).assets = {
        p: {
            resourceClaims: [],
            resourceTenancies: [],
            productionFacilities: [],
            storageFacility: makeStorageFacility(),
            allocatedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 },
            workforceDemography: createWorkforceDemography(),
        },
    };

    return p;
}

describe('fast-year integration', () => {
    it('runs a mocked short year and keeps workforce <= population', () => {
        const planet = makePlanet(5000);
        const company = makeAgent('company-1');
        const gov = planet.government;

        company.assets.p.allocatedWorkers.none = 10000; // over-request to stress

        const gameState = { tick: 0, planets: [planet], agents: [company, gov] };

        for (let t = 1; t <= TICKS_PER_YEAR; t++) {
            gameState.tick = t;
            advanceTick(gameState);

            const popTotal = totalPopulation(planet.population);

            // Sum workforce active + departing + retiring
            let workforceTotal = 0;
            for (const a of gameState.agents) {
                const wf = a.assets.p.workforceDemography as ReturnType<typeof createWorkforceDemography> | undefined;
                if (!wf) {
                    continue;
                }
                for (const cohort of wf) {
                    workforceTotal += (Object.values(cohort.active) as number[]).reduce((s, v) => s + v, 0);
                    const departingVals = Object.values(
                        cohort.departing || ({} as Record<string, number[]>),
                    ) as number[][];
                    for (const arr of departingVals) {
                        workforceTotal += arr.reduce((s, v) => s + v, 0);
                    }
                    const retiringVals = Object.values(
                        cohort.retiring || ({} as Record<string, number[]>),
                    ) as number[][];
                    for (const arr of retiringVals) {
                        workforceTotal += arr.reduce((s, v) => s + v, 0);
                    }
                }
            }

            expect(workforceTotal).toBeLessThanOrEqual(popTotal);
        }
    });
});
