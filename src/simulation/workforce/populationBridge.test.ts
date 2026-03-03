import { describe, it, expect } from 'vitest';

import { MIN_EMPLOYABLE_AGE } from '../constants';
import { educationLevelKeys } from '../planet';

import { hireFromPopulation, returnToPopulation, retireToPopulation, totalUnoccupiedForEdu } from './populationBridge';
import { laborMarketTick } from './laborMarketTick';
import {
    makeAgent,
    makePlanet,
    makeStorageFacility,
    totalPopulation,
    sumPopOcc,
    assertTotalPopulationConserved,
} from './testHelpers';
import { createWorkforceDemography } from './workforceHelpers';

// ============================================================================
// hireFromPopulation
// ============================================================================

describe('populationBridge — hireFromPopulation', () => {
    it('conserves total population when hiring', () => {
        const { planet } = makePlanet({ none: 1000, primary: 500 });
        const before = totalPopulation(planet);

        hireFromPopulation(planet, 'none', 300, 'company');
        hireFromPopulation(planet, 'primary', 100, 'government');

        assertTotalPopulationConserved(planet, before);
    });

    it('moves workers from unoccupied to the specified occupation', () => {
        const { planet } = makePlanet({ none: 1000 });
        const unoccBefore = sumPopOcc(planet, 'none', 'unoccupied');
        const compBefore = sumPopOcc(planet, 'none', 'company');

        const result = hireFromPopulation(planet, 'none', 200, 'company');

        expect(result.count).toBe(200);
        expect(sumPopOcc(planet, 'none', 'unoccupied')).toBe(unoccBefore - 200);
        expect(sumPopOcc(planet, 'none', 'company')).toBe(compBefore + 200);
    });

    it('caps hiring at available unoccupied workers', () => {
        const { planet } = makePlanet({ none: 50 });
        const result = hireFromPopulation(planet, 'none', 1000, 'company');

        expect(result.count).toBe(50);
        expect(sumPopOcc(planet, 'none', 'unoccupied')).toBe(0);
        expect(sumPopOcc(planet, 'none', 'company')).toBe(50);
    });

    it('does not touch cohorts below MIN_EMPLOYABLE_AGE', () => {
        const { planet } = makePlanet();
        // Place children
        for (let age = 0; age < MIN_EMPLOYABLE_AGE; age++) {
            planet.population.demography[age].none.unoccupied = 100;
        }
        const childTotal = MIN_EMPLOYABLE_AGE * 100;

        hireFromPopulation(planet, 'none', 500, 'company');

        // Children untouched
        let childRemaining = 0;
        for (let age = 0; age < MIN_EMPLOYABLE_AGE; age++) {
            childRemaining += planet.population.demography[age].none.unoccupied;
        }
        expect(childRemaining).toBe(childTotal);
    });

    it('returns zero when no unoccupied workers exist', () => {
        const { planet } = makePlanet(); // no unoccupied
        const result = hireFromPopulation(planet, 'none', 100, 'company');
        expect(result.count).toBe(0);
    });

    it('handles hiring zero workers gracefully', () => {
        const { planet } = makePlanet({ none: 100 });
        const before = totalPopulation(planet);
        const result = hireFromPopulation(planet, 'none', 0, 'company');
        expect(result.count).toBe(0);
        assertTotalPopulationConserved(planet, before);
    });

    it('handles negative count gracefully', () => {
        const { planet } = makePlanet({ none: 100 });
        const before = totalPopulation(planet);
        const result = hireFromPopulation(planet, 'none', -5, 'company');
        expect(result.count).toBe(0);
        assertTotalPopulationConserved(planet, before);
    });

    it('returns correct mean age and variance for single-age-cohort hire', () => {
        const { planet } = makePlanet();
        for (const c of planet.population.demography) {
            c.primary.unoccupied = 0;
        }
        planet.population.demography[30].primary.unoccupied = 100;

        const result = hireFromPopulation(planet, 'primary', 50, 'company');
        expect(result.count).toBe(50);
        expect(result.meanAge).toBe(30);
        expect(result.varAge).toBe(0);
    });

    it('returns correct mean and positive variance for multi-age hire', () => {
        const { planet } = makePlanet();
        for (const c of planet.population.demography) {
            c.none.unoccupied = 0;
        }
        planet.population.demography[20].none.unoccupied = 50;
        planet.population.demography[40].none.unoccupied = 50;

        const result = hireFromPopulation(planet, 'none', 100, 'company');
        expect(result.count).toBe(100);
        expect(result.meanAge).toBe(30); // (50*20 + 50*40) / 100
        expect(result.varAge).toBe(100); // E[age²] - E[age]² = (50*400+50*1600)/100 - 900 = 100
    });

    it('conserves population when hiring exactly all available workers', () => {
        const { planet } = makePlanet({ secondary: 777 });
        const before = totalPopulation(planet);

        const result = hireFromPopulation(planet, 'secondary', 777, 'government');
        expect(result.count).toBe(777);
        assertTotalPopulationConserved(planet, before);
        expect(sumPopOcc(planet, 'secondary', 'unoccupied')).toBe(0);
        expect(sumPopOcc(planet, 'secondary', 'government')).toBe(777);
    });

    it('moves hired workers from unoccupied to company in population', () => {
        const { planet } = makePlanet({ secondary: 10000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.secondary = 3000;

        let unoccupiedBefore = 0;
        for (const cohort of planet.population.demography) {
            unoccupiedBefore += cohort.secondary.unoccupied;
        }

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        let unoccupiedAfter = 0;
        let companyAfter = 0;
        for (const cohort of planet.population.demography) {
            unoccupiedAfter += cohort.secondary.unoccupied;
            companyAfter += cohort.secondary.company;
        }

        const hired = agent.assets.p.workforceDemography![0].active.secondary;
        expect(hired).toBeGreaterThan(0);
        expect(unoccupiedBefore - unoccupiedAfter).toBe(hired);
        expect(companyAfter).toBe(hired);
    });

    it('marks hired workers as government when agent is the planet government', () => {
        const { planet, gov } = makePlanet({ primary: 10000 });
        gov.assets.p = {
            resourceClaims: [],
            resourceTenancies: [],
            productionFacilities: [],
            storageFacility: makeStorageFacility(),
            allocatedWorkers: { none: 0, primary: 500, secondary: 0, tertiary: 0, quaternary: 0 },
            workforceDemography: createWorkforceDemography(),
        };

        laborMarketTick(new Map([[gov.id, gov]]), new Map([[planet.id, planet]]));

        const hired = gov.assets.p.workforceDemography![0].active.primary;
        expect(hired).toBeGreaterThan(0);

        let govAfter = 0;
        let companyAfter = 0;
        for (const cohort of planet.population.demography) {
            govAfter += cohort.primary.government;
            companyAfter += cohort.primary.company;
        }
        expect(govAfter).toBe(hired);
        expect(companyAfter).toBe(0);
    });
});

// ============================================================================
// returnToPopulation
// ============================================================================

describe('populationBridge — returnToPopulation', () => {
    it('conserves total population', () => {
        const { planet } = makePlanet({ none: 1000 });
        hireFromPopulation(planet, 'none', 200, 'company');
        const after = totalPopulation(planet);

        returnToPopulation(planet, 'none', 100, 'company');

        assertTotalPopulationConserved(planet, after);
    });

    it('moves workers from company to unoccupied', () => {
        const { planet } = makePlanet({ none: 1000 });
        hireFromPopulation(planet, 'none', 200, 'company');

        returnToPopulation(planet, 'none', 50, 'company');

        expect(sumPopOcc(planet, 'none', 'company')).toBe(150);
        expect(sumPopOcc(planet, 'none', 'unoccupied')).toBe(850);
    });

    it('handles returning more workers than are in the occupation (edge case)', () => {
        const { planet } = makePlanet({ none: 100 });
        hireFromPopulation(planet, 'none', 50, 'company');
        const before = totalPopulation(planet);

        // Try to return 100 but only 50 are in company
        returnToPopulation(planet, 'none', 100, 'company');

        // Should still conserve — excess goes to first employable-age cohort
        assertTotalPopulationConserved(planet, before);
    });

    it('handles zero count', () => {
        const { planet } = makePlanet({ none: 100 });
        const before = totalPopulation(planet);
        returnToPopulation(planet, 'none', 0, 'company');
        assertTotalPopulationConserved(planet, before);
    });

    it('distributes returns proportionally across age cohorts', () => {
        const { planet } = makePlanet();
        // Place 100 company workers at age 25 and 300 at age 45
        for (const c of planet.population.demography) {
            c.none.company = 0;
            c.none.unoccupied = 0;
        }
        planet.population.demography[25].none.company = 100;
        planet.population.demography[45].none.company = 300;

        returnToPopulation(planet, 'none', 40, 'company');

        const returned25 = planet.population.demography[25].none.unoccupied;
        const returned45 = planet.population.demography[45].none.unoccupied;
        expect(returned25 + returned45).toBe(40);
        // Proportional to 100:300 = 1:3, so 10 and 30
        expect(returned25).toBe(10);
        expect(returned45).toBe(30);
    });

    it('handles overflow when some cohorts have fewer workers than assigned', () => {
        const { planet } = makePlanet();
        for (const c of planet.population.demography) {
            c.none.company = 0;
            c.none.unoccupied = 0;
        }
        // 2 workers at age 30, 50 workers at age 40
        planet.population.demography[30].none.company = 2;
        planet.population.demography[40].none.company = 50;

        returnToPopulation(planet, 'none', 30, 'company');

        const returned =
            planet.population.demography[30].none.unoccupied + planet.population.demography[40].none.unoccupied;
        expect(returned).toBe(30);
    });
});

// ============================================================================
// retireToPopulation
// ============================================================================

describe('populationBridge — retireToPopulation', () => {
    it('conserves total population', () => {
        const { planet } = makePlanet({ primary: 500 });
        hireFromPopulation(planet, 'primary', 200, 'company');
        const after = totalPopulation(planet);

        retireToPopulation(planet, 'primary', 100, 'company');

        assertTotalPopulationConserved(planet, after);
    });

    it('moves workers from company to unableToWork (not unoccupied)', () => {
        const { planet } = makePlanet({ primary: 500 });
        hireFromPopulation(planet, 'primary', 200, 'company');

        retireToPopulation(planet, 'primary', 80, 'company');

        expect(sumPopOcc(planet, 'primary', 'company')).toBe(120);
        expect(sumPopOcc(planet, 'primary', 'unableToWork')).toBe(80);
        expect(sumPopOcc(planet, 'primary', 'unoccupied')).toBe(300);
    });

    it('handles zero count', () => {
        const { planet } = makePlanet({ primary: 100 });
        const before = totalPopulation(planet);
        retireToPopulation(planet, 'primary', 0, 'company');
        assertTotalPopulationConserved(planet, before);
    });

    it('distributes retirements proportionally across age cohorts', () => {
        const { planet } = makePlanet();
        // Place 100 company workers at age 50 and 200 at age 60
        for (const c of planet.population.demography) {
            c.none.company = 0;
        }
        planet.population.demography[50].none.company = 100;
        planet.population.demography[60].none.company = 200;

        retireToPopulation(planet, 'none', 60, 'company');

        // Should distribute ~20 from age 50 and ~40 from age 60 (proportional to 100:200)
        const retired50 = planet.population.demography[50].none.unableToWork;
        const retired60 = planet.population.demography[60].none.unableToWork;
        expect(retired50 + retired60).toBe(60);
        expect(retired50).toBe(20);
        expect(retired60).toBe(40);
    });

    it('biases rounding remainder towards older workers', () => {
        const { planet } = makePlanet();
        for (const c of planet.population.demography) {
            c.none.company = 0;
        }
        // Equal workers at two ages; with 1 remainder, older should get it
        planet.population.demography[30].none.company = 10;
        planet.population.demography[60].none.company = 10;

        retireToPopulation(planet, 'none', 1, 'company');

        // The single retiree should come from age 60
        expect(planet.population.demography[60].none.unableToWork).toBe(1);
        expect(planet.population.demography[30].none.unableToWork).toBe(0);
    });

    it('handles overflow when some cohorts have fewer workers than assigned', () => {
        const { planet } = makePlanet();
        for (const c of planet.population.demography) {
            c.primary.company = 0;
        }
        // 1 worker at age 30, 100 workers at age 50
        planet.population.demography[30].primary.company = 1;
        planet.population.demography[50].primary.company = 100;

        retireToPopulation(planet, 'primary', 90, 'company');

        // All 90 should be accounted for
        const totalRetired =
            planet.population.demography[30].primary.unableToWork +
            planet.population.demography[50].primary.unableToWork;
        expect(totalRetired).toBe(90);
        expect(planet.population.demography[30].primary.company).toBe(0);
        expect(planet.population.demography[50].primary.company).toBe(11);
    });
});

// ============================================================================
// totalUnoccupiedForEdu
// ============================================================================

describe('populationBridge — totalUnoccupiedForEdu', () => {
    it('correctly counts unoccupied workers at and above MIN_EMPLOYABLE_AGE', () => {
        const { planet } = makePlanet({ none: 1000 });
        // Also add children who should NOT be counted
        for (let age = 0; age < MIN_EMPLOYABLE_AGE; age++) {
            planet.population.demography[age].none.unoccupied = 50;
        }

        const count = totalUnoccupiedForEdu(planet, 'none');
        expect(count).toBe(1000); // children excluded
    });

    it('returns zero for education level with no unoccupied workers', () => {
        const { planet } = makePlanet({ none: 1000 });
        expect(totalUnoccupiedForEdu(planet, 'tertiary')).toBe(0);
    });
});

// ============================================================================
// Age moments in hireFromPopulation (via laborMarketTick)
// ============================================================================

describe('age moments — hiring', () => {
    it('sets ageMoments.mean to the weighted mean age of hired workers', () => {
        const { planet } = makePlanet();
        for (const c of planet.population.demography) {
            c.none.unoccupied = 0;
        }
        planet.population.demography[25].none.unoccupied = 100;

        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 50;

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        const wf = agent.assets.p.workforceDemography!;
        const hired = wf[0].active.none;
        expect(hired).toBeGreaterThan(0);
        expect(wf[0].ageMoments.none.mean).toBe(25);
    });

    it('hired workers get correct ageMoments reflecting actual population ages', () => {
        const { planet } = makePlanet();
        for (const c of planet.population.demography) {
            c.none.unoccupied = 0;
        }
        planet.population.demography[25].none.unoccupied = 50;
        planet.population.demography[35].none.unoccupied = 50;

        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 100;

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        const wf = agent.assets.p.workforceDemography!;
        const moments = wf[0].ageMoments.none;

        expect(moments.mean).toBe(30);
        expect(moments.variance).toBeCloseTo(25, 5);
    });

    it('merges ageMoments correctly when hiring across multiple ticks', () => {
        const { planet } = makePlanet();
        for (const c of planet.population.demography) {
            c.none.unoccupied = 0;
        }
        planet.population.demography[20].none.unoccupied = 100;
        planet.population.demography[40].none.unoccupied = 100;

        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 200;

        for (let i = 0; i < 60; i++) {
            laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
        }

        const wf = agent.assets.p.workforceDemography!;
        expect(wf[0].ageMoments.none.mean).toBeGreaterThanOrEqual(20);
        expect(wf[0].ageMoments.none.mean).toBeLessThanOrEqual(40);
    });

    it('variance is non-negative after all operations', () => {
        const { planet } = makePlanet({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 1000;

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        const wf = agent.assets.p.workforceDemography!;
        for (const cohort of wf) {
            for (const edu of educationLevelKeys) {
                if (cohort.active[edu] > 0) {
                    expect(cohort.ageMoments[edu].variance, `negative variance for ${edu}`).toBeGreaterThanOrEqual(0);
                }
            }
        }
    });
});
