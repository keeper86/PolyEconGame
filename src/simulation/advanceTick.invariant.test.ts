import { describe, it, expect } from 'vitest';

import { advanceTick } from './engine';
import { createWorkforceDemography } from './workforce';
import { emptyCohort, totalPopulation } from './populationHelpers';

// Minimal storage facility stub (not used but assets expect it)
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

function makePlanet(unoccupiedTotal = 10000) {
    // 101 cohorts
    const demography = Array.from({ length: 101 }, () => emptyCohort());

    // Spread unoccupied 'none' across working ages
    const per = Math.floor(unoccupiedTotal / (64 - 18 + 1));
    let rem = unoccupiedTotal - per * (64 - 18 + 1);
    for (let age = 18; age <= 64; age++) {
        demography[age].none.unoccupied = per + (rem > 0 ? 1 : 0);
        rem -= 1;
    }

    const gov = makeAgent('gov-1');

    return {
        id: 'p',
        name: 'Planet',
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

describe('advanceTick invariants', () => {
    it('total active workforce across agents never exceeds planet population', () => {
        const planet = makePlanet(10000);
        const company = makeAgent('company-1');
        const gov = planet.government;

        // Attach assets for government
        gov.assets.p = {
            resourceClaims: [],
            resourceTenancies: [],
            productionFacilities: [],
            storageFacility: makeStorageFacility(),
            allocatedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 },
            workforceDemography: createWorkforceDemography(),
        };

        // Company requests more workers than exist to stress hiring
        company.assets.p.allocatedWorkers.none = 20000;

        const gameState = { tick: 0, planets: [planet], agents: [company, gov] };

        for (let t = 1; t <= 12; t++) {
            gameState.tick = t;
            advanceTick(gameState);

            // Sum population
            const popTotal = totalPopulation(planet.population);

            // Sum active workforce across agents (active + departing + retiring considered as still part of workforce demography)
            let workforceTotal = 0;
            for (const a of gameState.agents) {
                const wf = a.assets.p.workforceDemography;
                if (!wf) {
                    continue;
                }
                for (const cohort of wf) {
                    const activeValues = Object.values(cohort.active) as number[];
                    workforceTotal += activeValues.reduce((s: number, v: number) => s + v, 0);

                    if (cohort.departing) {
                        const depArrays = Object.values(cohort.departing) as number[][];
                        for (const arr of depArrays) {
                            workforceTotal += arr.reduce((s: number, v: number) => s + v, 0);
                        }
                    }

                    if (cohort.retiring) {
                        const retArrays = Object.values(cohort.retiring) as number[][];
                        for (const arr of retArrays) {
                            workforceTotal += arr.reduce((s: number, v: number) => s + v, 0);
                        }
                    }
                }
            }

            expect(workforceTotal).toBeLessThanOrEqual(popTotal);
        }
    });
});
