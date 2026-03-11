/**
 * simulation/utils/testHelper.test.ts
 *
 * Smoke tests for centralized test fixture factories.
 */

import { describe, expect, it } from 'vitest';
import { educationLevelKeys } from '../population/education';
import { MAX_AGE, OCCUPATIONS, SKILL } from '../population/population';
import { NOTICE_PERIOD_MONTHS } from '../workforce/laborMarketTick';

import {
    makeAgent,
    makeGameState,
    makePlanet,
    makePlanetWithPopulation,
    makePopulation,
    makePopulationByEducation,
    makePopulationCategory,
    makePopulationCohort,
    makePopulationDemography,
    makePopulationWithWorkers,
    makeProductionFacility,
    makeStorageFacility,
    makeStorageFacilityWithFood,
    makeWorkforceCategory,
    makeWorkforceCohort,
    makeWorkforceDemography,
    makeWorld,
    sumActiveForEdu,
    sumPopOcc,
    sumWorkforceForEdu,
    totalPopulation,
} from './testHelper';

// ============================================================================
// Leaf factories
// ============================================================================

describe('makePopulationCategory', () => {
    it('returns zeroed category', () => {
        const cat = makePopulationCategory();
        expect(cat.total).toBe(0);
        expect(cat.wealth.mean).toBe(0);
        expect(cat.foodStock).toBe(0);
        expect(cat.starvationLevel).toBe(0);
        expect(cat.deaths.countThisMonth).toBe(0);
    });

    it('applies overrides', () => {
        const cat = makePopulationCategory({ total: 100, foodStock: 50 });
        expect(cat.total).toBe(100);
        expect(cat.foodStock).toBe(50);
    });
});

describe('makeWorkforceCategory', () => {
    it('returns zeroed category with departing arrays', () => {
        const wf = makeWorkforceCategory();
        expect(wf.active).toBe(0);
        expect(wf.departing).toHaveLength(NOTICE_PERIOD_MONTHS);
        expect(wf.departingFired).toHaveLength(NOTICE_PERIOD_MONTHS);
        expect(wf.departing.every((v) => v === 0)).toBe(true);
    });
});

// ============================================================================
// Cohort factories
// ============================================================================

describe('makePopulationCohort', () => {
    it('has the correct shape: [occ][edu][skill]', () => {
        const cohort = makePopulationCohort();
        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    expect(cohort[occ][edu][skill].total).toBe(0);
                }
            }
        }
    });
});

describe('makeWorkforceCohort', () => {
    it('has the correct shape: [edu][skill]', () => {
        const cohort = makeWorkforceCohort();
        for (const edu of educationLevelKeys) {
            for (const skill of SKILL) {
                expect(cohort[edu][skill].active).toBe(0);
                expect(cohort[edu][skill].departing).toHaveLength(NOTICE_PERIOD_MONTHS);
            }
        }
    });
});

// ============================================================================
// Demography arrays
// ============================================================================

describe('makePopulationDemography', () => {
    it('has MAX_AGE + 1 entries', () => {
        const dem = makePopulationDemography();
        expect(dem).toHaveLength(MAX_AGE + 1);
    });
});

describe('makeWorkforceDemography', () => {
    it('has MAX_AGE + 1 entries', () => {
        const dem = makeWorkforceDemography();
        expect(dem).toHaveLength(MAX_AGE + 1);
    });
});

// ============================================================================
// Population
// ============================================================================

describe('makePopulation', () => {
    it('creates empty population', () => {
        const pop = makePopulation();
        expect(pop.demography).toHaveLength(MAX_AGE + 1);
    });
});

describe('makePopulationWithWorkers', () => {
    it('distributes total across working ages', () => {
        const pop = makePopulationWithWorkers(1000);
        let total = 0;
        for (const cohort of pop.demography) {
            total += cohort.unoccupied.none.novice.total;
        }
        expect(total).toBe(1000);
    });

    it('only places workers in working ages', () => {
        const pop = makePopulationWithWorkers(100);
        for (let age = 0; age < 14; age++) {
            expect(pop.demography[age].unoccupied.none.novice.total).toBe(0);
        }
        for (let age = 65; age <= MAX_AGE; age++) {
            expect(pop.demography[age].unoccupied.none.novice.total).toBe(0);
        }
    });

    it('respects education override', () => {
        const pop = makePopulationWithWorkers(100, { edu: 'secondary' });
        let total = 0;
        for (const cohort of pop.demography) {
            total += cohort.unoccupied.secondary.novice.total;
        }
        expect(total).toBe(100);
    });
});

describe('makePopulationByEducation', () => {
    it('distributes multiple education levels', () => {
        const pop = makePopulationByEducation({ none: 500, primary: 300 });
        let noneTotal = 0;
        let primaryTotal = 0;
        for (const cohort of pop.demography) {
            noneTotal += cohort.unoccupied.none.novice.total;
            primaryTotal += cohort.unoccupied.primary.novice.total;
        }
        expect(noneTotal).toBe(500);
        expect(primaryTotal).toBe(300);
    });
});

// ============================================================================
// Planet, Agent, GameState
// ============================================================================

describe('makePlanet', () => {
    it('creates planet with defaults', () => {
        const planet = makePlanet();
        expect(planet.id).toBe('p');
        expect(planet.governmentId).toBe('gov-1');
        expect(planet.bank.deposits).toBe(0);
    });

    it('applies overrides', () => {
        const planet = makePlanet({ id: 'earth', name: 'Earth' });
        expect(planet.id).toBe('earth');
        expect(planet.name).toBe('Earth');
    });
});

describe('makePlanetWithPopulation', () => {
    it('creates planet + gov with population', () => {
        const { planet, gov } = makePlanetWithPopulation({ none: 1000 });
        expect(planet.governmentId).toBe(gov.id);
        const total = totalPopulation(planet);
        expect(total).toBe(1000);
    });
});

describe('makeAgent', () => {
    it('creates agent with planet assets', () => {
        const agent = makeAgent('co-1');
        expect(agent.id).toBe('co-1');
        expect(agent.assets.p).toBeDefined();
        expect(agent.assets.p.workforceDemography).toHaveLength(MAX_AGE + 1);
    });
});

describe('makeGameState', () => {
    it('wraps planet and agents into maps', () => {
        const planet = makePlanet();
        const agent = makeAgent('a1');
        const gs = makeGameState(planet, [agent]);
        expect(gs.planets.get('p')).toBe(planet);
        expect(gs.agents.get('a1')).toBe(agent);
    });
});

describe('makeWorld', () => {
    it('creates a complete world with gov and companies', () => {
        const { gameState, planet, gov, agents } = makeWorld({
            populationByEdu: { none: 1000 },
            companyIds: ['co-1', 'co-2'],
        });
        expect(gameState.agents.size).toBe(3); // gov + 2 companies
        expect(planet.governmentId).toBe(gov.id);
        expect(agents).toHaveLength(3);
    });
});

// ============================================================================
// Counting helpers
// ============================================================================

describe('totalPopulation', () => {
    it('counts all people across all dimensions', () => {
        const { planet } = makePlanetWithPopulation({ none: 500, primary: 300 });
        expect(totalPopulation(planet)).toBe(800);
    });
});

describe('sumPopOcc', () => {
    it('counts people for a specific edu/occ', () => {
        const { planet } = makePlanetWithPopulation({ none: 500 });
        expect(sumPopOcc(planet, 'none', 'unoccupied')).toBe(500);
        expect(sumPopOcc(planet, 'none', 'employed')).toBe(0);
    });
});

describe('sumWorkforceForEdu / sumActiveForEdu', () => {
    it('returns 0 for empty workforce', () => {
        const agent = makeAgent();
        expect(sumWorkforceForEdu(agent, 'p', 'none')).toBe(0);
        expect(sumActiveForEdu(agent, 'p', 'none')).toBe(0);
    });

    it('counts active workers', () => {
        const agent = makeAgent();
        // Put 10 active workers at age 25, edu=none, skill=novice
        agent.assets.p.workforceDemography[25].none.novice.active = 10;
        expect(sumActiveForEdu(agent, 'p', 'none')).toBe(10);
        expect(sumWorkforceForEdu(agent, 'p', 'none')).toBe(10);
    });

    it('counts departing workers in sumWorkforceForEdu', () => {
        const agent = makeAgent();
        agent.assets.p.workforceDemography[30].primary.novice.departing[0] = 5;
        expect(sumWorkforceForEdu(agent, 'p', 'primary')).toBe(5);
        expect(sumActiveForEdu(agent, 'p', 'primary')).toBe(0);
    });
});

// ============================================================================
// Facilities
// ============================================================================

describe('makeStorageFacility', () => {
    it('creates empty storage', () => {
        const sf = makeStorageFacility();
        expect(sf.planetId).toBe('p');
        expect(sf.capacity.volume).toBe(1e9);
        expect(Object.keys(sf.currentInStorage)).toHaveLength(0);
    });
});

describe('makeStorageFacilityWithFood', () => {
    it('creates storage pre-loaded with food', () => {
        const sf = makeStorageFacilityWithFood(500);
        const food = sf.currentInStorage['Agricultural Product'];
        expect(food).toBeDefined();
        expect(food.quantity).toBe(500);
    });
});

describe('makeProductionFacility', () => {
    it('creates facility with worker requirements', () => {
        const pf = makeProductionFacility({ none: 10, primary: 5 });
        expect(pf.workerRequirement.none).toBe(10);
        expect(pf.workerRequirement.primary).toBe(5);
    });
});
