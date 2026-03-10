/**
 * population/inheritance.test.ts
 *
 * Unit tests for the inheritance redistribution system.
 */

import { describe, it, expect } from 'vitest';
import { redistributeInheritance, type InheritanceRecord } from './inheritance';
import { makePopulation } from '../utils/testHelper';
import { forEachPopulationCohort } from './population';
import { GENERATION_GAP } from '../constants';

/** Sum total wealth (count × mean) across all cells in demography. */
function totalWealth(demography: ReturnType<typeof makePopulation>['demography']): number {
    let total = 0;
    for (const cohort of demography) {
        forEachPopulationCohort(cohort, (cat) => {
            if (cat.total > 0) {
                total += cat.total * cat.wealth.mean;
            }
        });
    }
    return total;
}

describe('redistributeInheritance', () => {
    it('is a no-op when records are empty', () => {
        const pop = makePopulation();
        pop.demography[30].unoccupied.none.novice.total = 100;
        pop.demography[30].unoccupied.none.novice.wealth = { mean: 50, variance: 0 };
        const wealthBefore = totalWealth(pop.demography);

        redistributeInheritance(pop.demography, []);

        expect(totalWealth(pop.demography)).toBeCloseTo(wealthBefore, 5);
    });

    it('conserves total wealth exactly', () => {
        const pop = makePopulation();
        // Set up heirs at age 50 (GENERATION_GAP below 75)
        pop.demography[50].unoccupied.none.novice.total = 1000;
        pop.demography[50].unoccupied.none.novice.wealth = { mean: 10, variance: 0 };

        // Also some people near age 50
        pop.demography[48].employed.primary.novice.total = 500;
        pop.demography[48].employed.primary.novice.wealth = { mean: 5, variance: 0 };

        const wealthBefore = totalWealth(pop.demography);

        const records: InheritanceRecord[] = [{ sourceAge: 75, amount: 5000 }];
        redistributeInheritance(pop.demography, records);

        const wealthAfter = totalWealth(pop.demography);
        // Total wealth should increase by exactly the inherited amount
        expect(wealthAfter).toBeCloseTo(wealthBefore + 5000, 2);
    });

    it('distributes wealth centred on sourceAge - GENERATION_GAP', () => {
        const pop = makePopulation();
        const sourceAge = 75;
        const targetAge = sourceAge - GENERATION_GAP; // 50

        // Place population at the target age and far from it
        pop.demography[targetAge].unoccupied.none.novice.total = 100;
        pop.demography[targetAge].unoccupied.none.novice.wealth = { mean: 0, variance: 0 };

        pop.demography[10].unoccupied.none.novice.total = 100;
        pop.demography[10].unoccupied.none.novice.wealth = { mean: 0, variance: 0 };

        const records: InheritanceRecord[] = [{ sourceAge, amount: 1000 }];
        redistributeInheritance(pop.demography, records);

        // People at targetAge should receive much more than people at age 10
        const wealthAtTarget = pop.demography[targetAge].unoccupied.none.novice.wealth.mean;
        const wealthAtFar = pop.demography[10].unoccupied.none.novice.wealth.mean;

        expect(wealthAtTarget).toBeGreaterThan(wealthAtFar);
        expect(wealthAtTarget).toBeGreaterThan(0);
    });

    it('handles inheritance from very young people (no negative target age)', () => {
        const pop = makePopulation();
        // Young person dies at age 5 — target heir age would be 5-25 = -20
        // Gaussian should still find nearest living people
        pop.demography[0].education.none.novice.total = 500;
        pop.demography[0].education.none.novice.wealth = { mean: 0, variance: 0 };

        pop.demography[5].education.none.novice.total = 200;
        pop.demography[5].education.none.novice.wealth = { mean: 0, variance: 0 };

        const records: InheritanceRecord[] = [{ sourceAge: 5, amount: 100 }];
        redistributeInheritance(pop.demography, records);

        // Should distribute to age 0 and 5 (closest to kernel centre)
        const wealthAt0 = pop.demography[0].education.none.novice.wealth.mean;
        const wealthAt5 = pop.demography[5].education.none.novice.wealth.mean;

        // Both should receive something
        expect(wealthAt0 + wealthAt5).toBeGreaterThan(0);

        // Total should be conserved
        const totalAfter = totalWealth(pop.demography);
        expect(totalAfter).toBeCloseTo(100, 2);
    });

    it('handles zero-amount records gracefully', () => {
        const pop = makePopulation();
        pop.demography[30].unoccupied.none.novice.total = 100;
        pop.demography[30].unoccupied.none.novice.wealth = { mean: 10, variance: 0 };
        const wealthBefore = totalWealth(pop.demography);

        const records: InheritanceRecord[] = [{ sourceAge: 55, amount: 0 }];
        redistributeInheritance(pop.demography, records);

        expect(totalWealth(pop.demography)).toBeCloseTo(wealthBefore, 5);
    });
});
