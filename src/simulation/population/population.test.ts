import { describe, it, expect } from 'vitest';

import { TICKS_PER_YEAR } from '../constants';
import { makePopulationCohort, makePlanet, makeWorkforceCohort } from '../utils/testHelper';

import {
    createEmptyPopulationCohort,
    nullPopulationCategory,
    transferPopulation,
    reducePopulationCohort,
    forEachPopulationCohort,
    mergeGaussianMoments,
    OCCUPATIONS,
    SKILL,
    type PopulationCategory,
} from './population';
import { convertAnnualToPerTick } from '../utils/convertAnnualToPerTick';
import { forEachWorkforceCohort } from '../workforce/workforce';
import { reduceWorkforceCohort } from '../workforce/workforce';
import { nullWorkforceCohort, nullWorkforceCategory } from '../workforce/workforce';
import { educationLevelKeys } from './education';

// ============================================================================
// createEmptyPopulationCohort
// ============================================================================

describe('createEmptyPopulationCohort', () => {
    it('creates a cohort with all 4 occupations', () => {
        const cohort = createEmptyPopulationCohort();
        for (const occ of OCCUPATIONS) {
            expect(cohort[occ]).toBeDefined();
        }
    });

    it('creates all education × skill cells for every occupation', () => {
        const cohort = createEmptyPopulationCohort();
        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    expect(cohort[occ][edu][skill]).toBeDefined();
                    expect(cohort[occ][edu][skill].total).toBe(0);
                }
            }
        }
    });

    it('produces independent cells — mutating one does not affect others', () => {
        const cohort = createEmptyPopulationCohort();
        cohort.employed.none.novice.total = 42;

        // Other cells should still be zero
        expect(cohort.employed.none.professional.total).toBe(0);
        expect(cohort.employed.primary.novice.total).toBe(0);
        expect(cohort.unoccupied.none.novice.total).toBe(0);
    });

    it('uses a fresh factory for every cell (not shared reference)', () => {
        const cohort = createEmptyPopulationCohort();
        const cells: PopulationCategory[] = [];
        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    cells.push(cohort[occ][edu][skill]);
                }
            }
        }

        // Should have 4 occupations × 4 edu × 3 skill = 48 cells
        expect(cells.length).toBe(OCCUPATIONS.length * educationLevelKeys.length * SKILL.length);

        // All cells should be unique references
        const unique = new Set(cells);
        expect(unique.size).toBe(cells.length);

        // Verify reference independence
        cells[0].total = 100;
        expect(cells[1].total).toBe(0);
    });
});

// ============================================================================
// createEmptyWorkforceCohort
// ============================================================================

describe('createEmptyWorkforceCohort', () => {
    it('returns a CohortByOccupation with zeroed WorkforceCategory values', () => {
        const cohort = nullWorkforceCohort();
        for (const edu of educationLevelKeys) {
            for (const skill of SKILL) {
                const cat = cohort[edu][skill];
                expect(cat.active).toBe(0);
                expect(cat.voluntaryDeparting).toEqual([0, 0, 0]);
                expect(cat.departingFired).toEqual([0, 0, 0]);
            }
        }
    });
});

// ============================================================================
// nullPopulationCategory / nullWorkforceCategory
// ============================================================================

describe('nullPopulationCategory', () => {
    it('returns a fresh zeroed PopulationCategory each call', () => {
        const a = nullPopulationCategory();
        const b = nullPopulationCategory();
        expect(a).not.toBe(b); // distinct objects
        expect(a.total).toBe(0);
        expect(a.deaths.type).toBe('death');
        expect(a.disabilities.type).toBe('disability');
        expect(a.retirements.type).toBe('retirement');
    });

    it('mutations do not affect subsequent calls', () => {
        const a = nullPopulationCategory();
        a.total = 999;
        const b = nullPopulationCategory();
        expect(b.total).toBe(0);
    });
});

describe('nullWorkforceCategory', () => {
    it('returns a zeroed WorkforceCategory each call', () => {
        const a = nullWorkforceCategory();
        expect(a.active).toBe(0);
        expect(a.voluntaryDeparting).toEqual([0, 0, 0]);
        expect(a.departingFired).toEqual([0, 0, 0]);
    });
});

// ============================================================================
// transferPopulation
// ============================================================================

describe('transferPopulation', () => {
    it('moves population from source to destination', () => {
        const planet = makePlanet();
        planet.population.demography[25].unoccupied.none.novice.total = 100;

        const result = transferPopulation(
            planet,
            { age: 25, occ: 'unoccupied', edu: 'none', skill: 'novice' },
            { age: 25, occ: 'employed', edu: 'none', skill: 'novice' },
            40,
        );

        expect(result.count).toBe(40);
        expect(result.inheritedWealth).toBe(0);
        expect(planet.population.demography[25].unoccupied.none.novice.total).toBe(60);
        expect(planet.population.demography[25].employed.none.novice.total).toBe(40);
    });

    it('caps transfer at available population', () => {
        const planet = makePlanet();
        planet.population.demography[30].employed.primary.novice.total = 10;

        const result = transferPopulation(
            planet,
            { age: 30, occ: 'employed', edu: 'primary', skill: 'novice' },
            { age: 30, occ: 'unoccupied', edu: 'primary', skill: 'novice' },
            100,
        );

        expect(result.count).toBe(10);
        expect(planet.population.demography[30].employed.primary.novice.total).toBe(0);
        expect(planet.population.demography[30].unoccupied.primary.novice.total).toBe(10);
    });

    it('returns count 0 for zero or negative count', () => {
        const planet = makePlanet();
        planet.population.demography[20].unoccupied.none.novice.total = 50;

        expect(
            transferPopulation(
                planet,
                { age: 20, occ: 'unoccupied', edu: 'none', skill: 'novice' },
                { age: 20, occ: 'employed', edu: 'none', skill: 'novice' },
                0,
            ).count,
        ).toBe(0);

        expect(
            transferPopulation(
                planet,
                { age: 20, occ: 'unoccupied', edu: 'none', skill: 'novice' },
                { age: 20, occ: 'employed', edu: 'none', skill: 'novice' },
                -5,
            ).count,
        ).toBe(0);

        expect(planet.population.demography[20].unoccupied.none.novice.total).toBe(50);
    });

    it('destroys population when destination is undefined (deaths)', () => {
        const planet = makePlanet();
        planet.population.demography[50].employed.secondary.expert.total = 100;

        const result = transferPopulation(
            planet,
            { age: 50, occ: 'employed', edu: 'secondary', skill: 'expert' },
            undefined,
            30,
        );

        expect(result.count).toBe(30);
        expect(planet.population.demography[50].employed.secondary.expert.total).toBe(70);
    });

    it('returns inherited wealth on death (to=undefined)', () => {
        const planet = makePlanet();
        planet.population.demography[50].employed.secondary.expert.total = 100;
        planet.population.demography[50].employed.secondary.expert.wealth = { mean: 50, variance: 10 };

        const result = transferPopulation(
            planet,
            { age: 50, occ: 'employed', edu: 'secondary', skill: 'expert' },
            undefined,
            30,
        );

        expect(result.count).toBe(30);
        // 30 people × 50 mean wealth = 1500 inherited
        expect(result.inheritedWealth).toBeCloseTo(1500, 5);
        // Remaining population still has same per-capita wealth
        expect(planet.population.demography[50].employed.secondary.expert.wealth.mean).toBeCloseTo(50, 5);
    });

    it('transfers across different ages', () => {
        const planet = makePlanet();
        planet.population.demography[20].unoccupied.none.novice.total = 50;

        const result = transferPopulation(
            planet,
            { age: 20, occ: 'unoccupied', edu: 'none', skill: 'novice' },
            { age: 21, occ: 'unoccupied', edu: 'none', skill: 'novice' },
            30,
        );

        expect(result.count).toBe(30);
        expect(planet.population.demography[20].unoccupied.none.novice.total).toBe(20);
        expect(planet.population.demography[21].unoccupied.none.novice.total).toBe(30);
    });

    it('transfers wealth proportionally', () => {
        const planet = makePlanet();
        const src = planet.population.demography[30].employed.none.novice;
        src.total = 100;
        src.wealth = { mean: 1000, variance: 100 };

        transferPopulation(
            planet,
            { age: 30, occ: 'employed', edu: 'none', skill: 'novice' },
            { age: 30, occ: 'unoccupied', edu: 'none', skill: 'novice' },
            50,
        );

        const dst = planet.population.demography[30].unoccupied.none.novice;
        // Source wealth moments are unchanged (same distribution, fewer people)
        expect(src.wealth.mean).toBeCloseTo(1000, 0);
        expect(src.wealth.variance).toBeCloseTo(100, 0);
        // Destination receives the transferred wealth:
        //   mergeGaussianMoments(0, {0,0}, 50, {1000,100})
        //   nA=0 branch → returns B = {1000, 100}
        expect(dst.wealth.mean).toBeCloseTo(1000, 0);
        expect(dst.wealth.variance).toBeCloseTo(100, 0);
    });

    it('transfers service buffers preserving per-capita coverage', () => {
        const planet = makePlanet();
        const src = planet.population.demography[25].unoccupied.primary.novice;
        src.total = 200;
        src.services.grocery.buffer = 10; // 10 ticks of coverage for the whole group

        transferPopulation(
            planet,
            { age: 25, occ: 'unoccupied', edu: 'primary', skill: 'novice' },
            { age: 25, occ: 'employed', edu: 'primary', skill: 'novice' },
            100,
        );

        // `buffer` is per-capita coverage ticks (analogous to wealth.mean).
        // FROM keeps its buffer unchanged — physical food per person is conserved.
        // TO (empty before) gets the same buffer as FROM via weighted average:
        //   (0 * 0 + 10 * 100) / (0 + 100) = 10
        expect(src.services.grocery.buffer).toBeCloseTo(10, 5);
        expect(planet.population.demography[25].employed.primary.novice.services.grocery.buffer).toBeCloseTo(10, 5);
    });

    it('conserves total across transfer', () => {
        const planet = makePlanet();
        planet.population.demography[40].unoccupied.tertiary.professional.total = 500;

        transferPopulation(
            planet,
            { age: 40, occ: 'unoccupied', edu: 'tertiary', skill: 'professional' },
            { age: 40, occ: 'employed', edu: 'tertiary', skill: 'professional' },
            200,
        );

        const srcTotal = planet.population.demography[40].unoccupied.tertiary.professional.total;
        const dstTotal = planet.population.demography[40].employed.tertiary.professional.total;
        expect(srcTotal + dstTotal).toBe(500);
    });
});

// ============================================================================
// reducePopulationCohort
// ============================================================================

describe('reducePopulationCohort', () => {
    it('sums totals across all cells in a cohort', () => {
        const cohort = makePopulationCohort();
        cohort.unoccupied.none.novice.total = 100;
        cohort.employed.primary.expert.total = 200;
        cohort.education.secondary.professional.total = 50;

        const result = reducePopulationCohort(cohort);
        expect(result.total).toBe(350);
    });

    it('returns zero for an empty cohort', () => {
        const cohort = makePopulationCohort();
        const result = reducePopulationCohort(cohort);
        expect(result.total).toBe(0);
    });

    it('sums death/disability/retirement stats', () => {
        const cohort = makePopulationCohort();
        cohort.employed.none.novice.deaths.countThisMonth = 3;
        cohort.employed.primary.novice.deaths.countThisMonth = 2;
        cohort.unoccupied.none.novice.disabilities.countThisMonth = 1;

        const result = reducePopulationCohort(cohort);
        expect(result.deaths.countThisMonth).toBe(5);
        expect(result.disabilities.countThisMonth).toBe(1);
    });
});

// ============================================================================
// reduceWorkforceCohort
// ============================================================================

describe('reduceWorkforceCohort', () => {
    it('sums active across all edu×skill cells', () => {
        const cohort = makeWorkforceCohort();
        cohort.none.novice.active = 100;
        cohort.primary.expert.active = 50;

        const result = reduceWorkforceCohort(cohort);
        expect(result.active).toBe(150);
    });

    it('returns zero for an empty workforce cohort', () => {
        const cohort = makeWorkforceCohort();
        const result = reduceWorkforceCohort(cohort);
        expect(result.active).toBe(0);
    });
});

// ============================================================================
// forEachPopulationCohort
// ============================================================================

describe('forEachPopulationCohort', () => {
    it('iterates over all occupation × education × skill cells', () => {
        const cohort = makePopulationCohort();
        let count = 0;
        forEachPopulationCohort(cohort, () => {
            count++;
        });
        expect(count).toBe(OCCUPATIONS.length * educationLevelKeys.length * SKILL.length);
    });

    it('provides correct (occ, edu, skill) in callback', () => {
        const cohort = makePopulationCohort();
        cohort.employed.tertiary.expert.total = 42;

        let found = false;
        forEachPopulationCohort(cohort, (cat, occ, edu, skill) => {
            if (occ === 'employed' && edu === 'tertiary' && skill === 'expert') {
                expect(cat.total).toBe(42);
                found = true;
            }
        });
        expect(found).toBe(true);
    });
});

describe('forEachWorkforceCohort', () => {
    it('iterates over all education × skill cells', () => {
        const cohort = makeWorkforceCohort();
        let count = 0;
        forEachWorkforceCohort(cohort, () => {
            count++;
        });
        expect(count).toBe(educationLevelKeys.length * SKILL.length);
    });
});

// ============================================================================
// mergeGaussianMoments
// ============================================================================

describe('mergeGaussianMoments', () => {
    it('returns B when nA is 0', () => {
        const result = mergeGaussianMoments(0, { mean: 0, variance: 0 }, 100, { mean: 50, variance: 10 });
        expect(result.mean).toBe(50);
        expect(result.variance).toBe(10);
    });

    it('returns A when nB is 0', () => {
        const result = mergeGaussianMoments(100, { mean: 50, variance: 10 }, 0, { mean: 0, variance: 0 });
        expect(result.mean).toBe(50);
        expect(result.variance).toBe(10);
    });

    it('computes correct pooled mean', () => {
        const result = mergeGaussianMoments(100, { mean: 40, variance: 0 }, 100, { mean: 60, variance: 0 });
        expect(result.mean).toBeCloseTo(50, 10);
    });

    it('computes correct pooled variance (parallel-axis theorem)', () => {
        // Two groups with same variance but different means
        const result = mergeGaussianMoments(100, { mean: 40, variance: 4 }, 100, { mean: 60, variance: 4 });
        // pooledMean = 50
        // pooledVar = (100*(4 + (40-50)²) + 100*(4 + (60-50)²)) / 200
        //           = (100*(4+100) + 100*(4+100)) / 200
        //           = (10400 + 10400) / 200 = 104
        expect(result.mean).toBeCloseTo(50, 10);
        expect(result.variance).toBeCloseTo(104, 10);
    });

    it('merging identical groups preserves mean and variance', () => {
        const result = mergeGaussianMoments(50, { mean: 100, variance: 25 }, 50, { mean: 100, variance: 25 });
        expect(result.mean).toBeCloseTo(100, 10);
        expect(result.variance).toBeCloseTo(25, 10);
    });

    it('handles unequal group sizes', () => {
        const result = mergeGaussianMoments(300, { mean: 10, variance: 0 }, 100, { mean: 30, variance: 0 });
        // pooledMean = (300*10 + 100*30) / 400 = 6000/400 = 15
        expect(result.mean).toBeCloseTo(15, 10);
    });
});

// ============================================================================
// convertAnnualToPerTick
// ============================================================================

describe('convertAnnualToPerTick', () => {
    it('returns 0 for annual rate of 0', () => {
        expect(convertAnnualToPerTick(0)).toBe(0);
    });

    it('returns 1 for annual rate of 1 (certainty)', () => {
        expect(convertAnnualToPerTick(1)).toBe(1);
    });

    it('returns 1 for annual rate > 1', () => {
        expect(convertAnnualToPerTick(1.5)).toBe(1);
    });

    it('compounding per-tick yields correct annual rate', () => {
        const annualRate = 0.05;
        const perTick = convertAnnualToPerTick(annualRate);

        // (1 - perTick)^TICKS_PER_YEAR should ≈ (1 - annualRate)
        const survivedYear = Math.pow(1 - perTick, TICKS_PER_YEAR);
        expect(survivedYear).toBeCloseTo(1 - annualRate, 8);
    });

    it('works for high annual rates', () => {
        const annualRate = 0.9;
        const perTick = convertAnnualToPerTick(annualRate);
        const survivedYear = Math.pow(1 - perTick, TICKS_PER_YEAR);
        expect(survivedYear).toBeCloseTo(1 - annualRate, 6);
    });

    it('works for small annual rates', () => {
        const annualRate = 0.001;
        const perTick = convertAnnualToPerTick(annualRate);
        const survivedYear = Math.pow(1 - perTick, TICKS_PER_YEAR);
        expect(survivedYear).toBeCloseTo(1 - annualRate, 8);
    });
});
