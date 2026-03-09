import { describe, it, expect } from 'vitest';

import { MIN_EMPLOYABLE_AGE } from '../constants';
import { educationLevelKeys } from '../population/education';
import { SKILL } from '../population/population';

import { hireFromPopulation, returnToPopulation, retireToPopulation, totalUnoccupiedForEdu } from './populationBridge';
import { preProductionLaborMarketTick } from './laborMarketTick';
import {
    makeAgent,
    makePlanetWithPopulation,
    makePlanet,
    totalPopulation,
    sumPopOcc,
    sumActiveForEdu,
    agentMap,
    planetMap,
} from '../utils/testHelper';
import { assertTotalPopulationConserved } from '../utils/testAssertions';

// ============================================================================
// hireFromPopulation
// ============================================================================

describe('populationBridge — hireFromPopulation', () => {
    it('conserves total population when hiring', () => {
        const { planet } = makePlanetWithPopulation({ none: 1000, primary: 500 });
        const before = totalPopulation(planet);

        hireFromPopulation(planet, 'none', 'novice', 300);
        hireFromPopulation(planet, 'primary', 'novice', 100);

        assertTotalPopulationConserved(planet, before);
    });

    it('moves workers from unoccupied to employed', () => {
        const { planet } = makePlanetWithPopulation({ none: 1000 });
        const unoccBefore = sumPopOcc(planet, 'none', 'unoccupied');
        const empBefore = sumPopOcc(planet, 'none', 'employed');

        const result = hireFromPopulation(planet, 'none', 'novice', 200);

        expect(result.count).toBe(200);
        expect(sumPopOcc(planet, 'none', 'unoccupied')).toBe(unoccBefore - 200);
        expect(sumPopOcc(planet, 'none', 'employed')).toBe(empBefore + 200);
    });

    it('caps hiring at available unoccupied workers', () => {
        const { planet } = makePlanetWithPopulation({ none: 50 });
        const result = hireFromPopulation(planet, 'none', 'novice', 1000);

        expect(result.count).toBe(50);
        expect(sumPopOcc(planet, 'none', 'unoccupied')).toBe(0);
        expect(sumPopOcc(planet, 'none', 'employed')).toBe(50);
    });

    it('does not touch cohorts below MIN_EMPLOYABLE_AGE', () => {
        const planet = makePlanet();
        // Place children
        for (let age = 0; age < MIN_EMPLOYABLE_AGE; age++) {
            planet.population.demography[age].unoccupied.none.novice.total = 100;
        }
        const childTotal = MIN_EMPLOYABLE_AGE * 100;

        hireFromPopulation(planet, 'none', 'novice', 500);

        // Children untouched
        let childRemaining = 0;
        for (let age = 0; age < MIN_EMPLOYABLE_AGE; age++) {
            childRemaining += planet.population.demography[age].unoccupied.none.novice.total;
        }
        expect(childRemaining).toBe(childTotal);
    });

    it('returns zero when no unoccupied workers exist', () => {
        const planet = makePlanet(); // no unoccupied
        const result = hireFromPopulation(planet, 'none', 'novice', 100);
        expect(result.count).toBe(0);
    });

    it('handles hiring zero workers gracefully', () => {
        const { planet } = makePlanetWithPopulation({ none: 100 });
        const before = totalPopulation(planet);
        const result = hireFromPopulation(planet, 'none', 'novice', 0);
        expect(result.count).toBe(0);
        assertTotalPopulationConserved(planet, before);
    });

    it('handles negative count gracefully', () => {
        const { planet } = makePlanetWithPopulation({ none: 100 });
        const before = totalPopulation(planet);
        const result = hireFromPopulation(planet, 'none', 'novice', -5);
        expect(result.count).toBe(0);
        assertTotalPopulationConserved(planet, before);
    });

    it('returns correct hiredByAge for single-age-cohort hire', () => {
        const planet = makePlanet();
        // Place 100 at age 30
        planet.population.demography[30].unoccupied.primary.novice.total = 100;

        const result = hireFromPopulation(planet, 'primary', 'novice', 50);
        expect(result.count).toBe(50);
        expect(result.hiredByAge[30]).toBe(50);
        // All other ages should be 0
        const totalHired = result.hiredByAge.reduce((s, v) => s + v, 0);
        expect(totalHired).toBe(50);
    });

    it('returns correct hiredByAge for multi-age hire', () => {
        const planet = makePlanet();
        planet.population.demography[20].unoccupied.none.novice.total = 50;
        planet.population.demography[40].unoccupied.none.novice.total = 50;

        const result = hireFromPopulation(planet, 'none', 'novice', 100);
        expect(result.count).toBe(100);
        expect(result.hiredByAge[20]).toBe(50);
        expect(result.hiredByAge[40]).toBe(50);
    });

    it('conserves population when hiring exactly all available workers', () => {
        const { planet } = makePlanetWithPopulation({ secondary: 777 });
        const before = totalPopulation(planet);

        const result = hireFromPopulation(planet, 'secondary', 'novice', 777);
        expect(result.count).toBe(777);
        assertTotalPopulationConserved(planet, before);
        expect(sumPopOcc(planet, 'secondary', 'unoccupied')).toBe(0);
        expect(sumPopOcc(planet, 'secondary', 'employed')).toBe(777);
    });

    it('moves hired workers from unoccupied to employed via preProductionLaborMarketTick', () => {
        const { planet } = makePlanetWithPopulation({ secondary: 10000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.secondary = 3000;

        const unoccupiedBefore = sumPopOcc(planet, 'secondary', 'unoccupied');

        preProductionLaborMarketTick(agentMap(agent), planetMap(planet));

        const unoccupiedAfter = sumPopOcc(planet, 'secondary', 'unoccupied');
        const employedAfter = sumPopOcc(planet, 'secondary', 'employed');

        const hired = sumActiveForEdu(agent, 'p', 'secondary');
        expect(hired).toBeGreaterThan(0);
        expect(unoccupiedBefore - unoccupiedAfter).toBe(hired);
        expect(employedAfter).toBe(hired);
    });
});

// ============================================================================
// returnToPopulation
// ============================================================================

describe('populationBridge — returnToPopulation', () => {
    it('conserves total population', () => {
        const { planet } = makePlanetWithPopulation({ none: 1000 });
        hireFromPopulation(planet, 'none', 'novice', 200);
        const after = totalPopulation(planet);

        returnToPopulation(planet, 'none', 100);

        assertTotalPopulationConserved(planet, after);
    });

    it('moves workers from employed to unoccupied', () => {
        const { planet } = makePlanetWithPopulation({ none: 1000 });
        hireFromPopulation(planet, 'none', 'novice', 200);

        returnToPopulation(planet, 'none', 50);

        expect(sumPopOcc(planet, 'none', 'employed')).toBe(150);
        expect(sumPopOcc(planet, 'none', 'unoccupied')).toBe(850);
    });

    it('handles returning more workers than are employed (edge case)', () => {
        const { planet } = makePlanetWithPopulation({ none: 100 });
        hireFromPopulation(planet, 'none', 'novice', 50);
        const before = totalPopulation(planet);

        // Try to return 100 but only 50 are employed
        returnToPopulation(planet, 'none', 100);

        assertTotalPopulationConserved(planet, before);
    });

    it('handles zero count', () => {
        const { planet } = makePlanetWithPopulation({ none: 100 });
        const before = totalPopulation(planet);
        returnToPopulation(planet, 'none', 0);
        assertTotalPopulationConserved(planet, before);
    });

    it('distributes returns proportionally across age cohorts', () => {
        const planet = makePlanet();
        // Place 100 employed workers at age 25 and 300 at age 45
        planet.population.demography[25].employed.none.novice.total = 100;
        planet.population.demography[45].employed.none.novice.total = 300;

        returnToPopulation(planet, 'none', 40);

        // Check per age
        let unoccAge25 = 0;
        let unoccAge45 = 0;
        for (const skill of SKILL) {
            unoccAge25 += planet.population.demography[25].unoccupied.none[skill].total;
            unoccAge45 += planet.population.demography[45].unoccupied.none[skill].total;
        }
        expect(unoccAge25 + unoccAge45).toBe(40);
        // Proportional to 100:300 = 1:3, so 10 and 30
        expect(unoccAge25).toBe(10);
        expect(unoccAge45).toBe(30);
    });

    it('handles overflow when some cohorts have fewer workers than assigned', () => {
        const planet = makePlanet();
        // 2 workers at age 30, 50 workers at age 40
        planet.population.demography[30].employed.none.novice.total = 2;
        planet.population.demography[40].employed.none.novice.total = 50;

        returnToPopulation(planet, 'none', 30);

        let totalReturned = 0;
        for (const cohort of planet.population.demography) {
            for (const skill of SKILL) {
                totalReturned += cohort.unoccupied.none[skill].total;
            }
        }
        expect(totalReturned).toBe(30);
    });
});

// ============================================================================
// retireToPopulation
// ============================================================================

describe('populationBridge — retireToPopulation', () => {
    it('conserves total population', () => {
        const { planet } = makePlanetWithPopulation({ primary: 500 });
        hireFromPopulation(planet, 'primary', 'novice', 200);
        const after = totalPopulation(planet);

        retireToPopulation(planet, 'primary', 100);

        assertTotalPopulationConserved(planet, after);
    });

    it('moves workers from employed to unableToWork (not unoccupied)', () => {
        const planet = makePlanet();
        // Place workers at retirement-eligible ages
        planet.population.demography[70].employed.primary.novice.total = 120;
        planet.population.demography[75].employed.primary.novice.total = 80;

        retireToPopulation(planet, 'primary', 80);

        expect(sumPopOcc(planet, 'primary', 'unableToWork')).toBe(80);
        expect(sumPopOcc(planet, 'primary', 'employed')).toBe(120);
    });

    it('handles zero count', () => {
        const { planet } = makePlanetWithPopulation({ primary: 100 });
        const before = totalPopulation(planet);
        retireToPopulation(planet, 'primary', 0);
        assertTotalPopulationConserved(planet, before);
    });

    it('distributes retirements proportionally across age cohorts', () => {
        const planet = makePlanet();
        // Place workers at retirement-eligible ages (≥ RETIREMENT_AGE)
        planet.population.demography[70].employed.none.novice.total = 100;
        planet.population.demography[80].employed.none.novice.total = 200;

        retireToPopulation(planet, 'none', 60);

        let retired70 = 0;
        let retired80 = 0;
        for (const skill of SKILL) {
            retired70 += planet.population.demography[70].unableToWork.none[skill].total;
            retired80 += planet.population.demography[80].unableToWork.none[skill].total;
        }
        expect(retired70 + retired80).toBe(60);
        expect(retired70).toBe(20);
        expect(retired80).toBe(40);
    });

    it('does not retire workers below RETIREMENT_AGE', () => {
        const planet = makePlanet();
        // Only workers below retirement age
        planet.population.demography[40].employed.none.novice.total = 100;
        planet.population.demography[55].employed.none.novice.total = 200;

        const moved = retireToPopulation(planet, 'none', 50);

        expect(moved).toBe(0);
        expect(planet.population.demography[40].employed.none.novice.total).toBe(100);
        expect(planet.population.demography[55].employed.none.novice.total).toBe(200);
    });

    it('caps retirements at available retirement-eligible workers', () => {
        const planet = makePlanet();
        // 50 workers at age 70, 200 workers at age 40 (below retirement age)
        planet.population.demography[40].employed.none.novice.total = 200;
        planet.population.demography[70].employed.none.novice.total = 50;

        const moved = retireToPopulation(planet, 'none', 100);

        expect(moved).toBe(50);
        expect(planet.population.demography[70].employed.none.novice.total).toBe(0);
        expect(planet.population.demography[40].employed.none.novice.total).toBe(200);
    });

    it('handles overflow when some cohorts have fewer workers than assigned', () => {
        const planet = makePlanet();
        // 1 worker at age 68, 100 workers at age 75
        planet.population.demography[68].employed.primary.novice.total = 1;
        planet.population.demography[75].employed.primary.novice.total = 100;

        retireToPopulation(planet, 'primary', 90);

        let totalRetired = 0;
        for (const cohort of planet.population.demography) {
            for (const skill of SKILL) {
                totalRetired += cohort.unableToWork.primary[skill].total;
            }
        }
        expect(totalRetired).toBe(90);
        expect(planet.population.demography[68].employed.primary.novice.total).toBe(0);
        expect(planet.population.demography[75].employed.primary.novice.total).toBe(11);
    });
});

// ============================================================================
// totalUnoccupiedForEdu
// ============================================================================

describe('populationBridge — totalUnoccupiedForEdu', () => {
    it('correctly counts unoccupied workers at and above MIN_EMPLOYABLE_AGE', () => {
        const { planet } = makePlanetWithPopulation({ none: 1000 });
        // Also add children who should NOT be counted
        for (let age = 0; age < MIN_EMPLOYABLE_AGE; age++) {
            planet.population.demography[age].unoccupied.none.novice.total = 50;
        }

        const count = totalUnoccupiedForEdu(planet, 'none');
        expect(count).toBe(1000); // children excluded
    });

    it('returns zero for education level with no unoccupied workers', () => {
        const { planet } = makePlanetWithPopulation({ none: 1000 });
        expect(totalUnoccupiedForEdu(planet, 'tertiary')).toBe(0);
    });
});

// ============================================================================
// Age-indexed placement in hireFromPopulation (via preProductionLaborMarketTick)
// ============================================================================

describe('age-indexed hiring', () => {
    it('places hired workers at the correct age index in the workforce', () => {
        const planet = makePlanet();
        planet.population.demography[25].unoccupied.none.novice.total = 100;

        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 50;

        preProductionLaborMarketTick(agentMap(agent), planetMap(planet));

        const wf = agent.assets.p.workforceDemography!;
        // Workers should be at age index 25
        expect(wf[25].none.novice.active).toBeGreaterThan(0);
        // And not at age 0
        expect(wf[0].none.novice.active).toBe(0);
    });

    it('hired workers are placed at their actual population ages', () => {
        const planet = makePlanet();
        planet.population.demography[25].unoccupied.none.novice.total = 50;
        planet.population.demography[35].unoccupied.none.novice.total = 50;

        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 100;

        preProductionLaborMarketTick(agentMap(agent), planetMap(planet));

        const wf = agent.assets.p.workforceDemography!;
        const at25 = wf[25].none.novice.active;
        const at35 = wf[35].none.novice.active;
        expect(at25 + at35).toBeGreaterThan(0);
        expect(at25).toBeGreaterThan(0);
        expect(at35).toBeGreaterThan(0);
    });

    it('all workforce counts are non-negative after hiring', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 1000;

        preProductionLaborMarketTick(agentMap(agent), planetMap(planet));

        const wf = agent.assets.p.workforceDemography!;
        for (const cohort of wf) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    expect(cohort[edu][skill].active).toBeGreaterThanOrEqual(0);
                }
            }
        }
    });
});
