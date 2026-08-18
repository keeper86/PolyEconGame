import { describe, it, expect } from 'vitest';
import { redistributeInheritance, type InheritanceRecord } from './inheritance';
import { makePopulation } from '../utils/testHelper';
import { forEachPopulationCohort } from './population';
import { GENERATION_GAP } from '../constants';

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
        pop.demography[30].unoccupied.none.total = 100;
        pop.demography[30].unoccupied.none.wealth = { mean: 50, variance: 0 };
        const wealthBefore = totalWealth(pop.demography);

        redistributeInheritance(pop.demography, []);

        expect(totalWealth(pop.demography)).toBeCloseTo(wealthBefore, 5);
    });

    it('conserves total wealth exactly', () => {
        const pop = makePopulation();

        pop.demography[50].unoccupied.none.total = 1000;
        pop.demography[50].unoccupied.none.wealth = { mean: 10, variance: 0 };

        pop.demography[48].employed.primary.total = 500;
        pop.demography[48].employed.primary.wealth = { mean: 5, variance: 0 };

        const wealthBefore = totalWealth(pop.demography);

        const records: InheritanceRecord[] = [{ sourceAge: 75, amount: 5000 }];
        redistributeInheritance(pop.demography, records);

        const wealthAfter = totalWealth(pop.demography);

        expect(wealthAfter).toBeCloseTo(wealthBefore + 5000, 2);
    });

    it('distributes wealth centred on sourceAge - GENERATION_GAP', () => {
        const pop = makePopulation();
        const sourceAge = 75;
        const targetAge = sourceAge - GENERATION_GAP;

        pop.demography[targetAge].unoccupied.none.total = 100;
        pop.demography[targetAge].unoccupied.none.wealth = { mean: 0, variance: 0 };

        pop.demography[10].unoccupied.none.total = 100;
        pop.demography[10].unoccupied.none.wealth = { mean: 0, variance: 0 };

        const records: InheritanceRecord[] = [{ sourceAge, amount: 1000 }];
        redistributeInheritance(pop.demography, records);

        const wealthAtTarget = pop.demography[targetAge].unoccupied.none.wealth.mean;
        const wealthAtFar = pop.demography[10].unoccupied.none.wealth.mean;

        expect(wealthAtTarget).toBeGreaterThan(wealthAtFar);
        expect(wealthAtTarget).toBeGreaterThan(0);
    });

    it('handles inheritance from very young people (no negative target age)', () => {
        const pop = makePopulation();

        pop.demography[0].education.none.total = 500;
        pop.demography[0].education.none.wealth = { mean: 0, variance: 0 };

        pop.demography[5].education.none.total = 200;
        pop.demography[5].education.none.wealth = { mean: 0, variance: 0 };

        const records: InheritanceRecord[] = [{ sourceAge: 5, amount: 100 }];
        redistributeInheritance(pop.demography, records);

        const wealthAt0 = pop.demography[0].education.none.wealth.mean;
        const wealthAt5 = pop.demography[5].education.none.wealth.mean;

        expect(wealthAt0 + wealthAt5).toBeGreaterThan(0);

        const totalAfter = totalWealth(pop.demography);
        expect(totalAfter).toBeCloseTo(100, 2);
    });

    it('handles zero-amount records gracefully', () => {
        const pop = makePopulation();
        pop.demography[30].unoccupied.none.total = 100;
        pop.demography[30].unoccupied.none.wealth = { mean: 10, variance: 0 };
        const wealthBefore = totalWealth(pop.demography);

        const records: InheritanceRecord[] = [{ sourceAge: 55, amount: 0 }];
        redistributeInheritance(pop.demography, records);

        expect(totalWealth(pop.demography)).toBeCloseTo(wealthBefore, 5);
    });
});
