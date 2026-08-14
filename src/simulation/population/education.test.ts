import { describe, it, expect, beforeEach } from 'vitest';

import { MIN_EMPLOYABLE_AGE } from '../constants';
import { seedRng } from '../engine';
import { makePlanet } from '../utils/testHelper';
import {
    applyEducationTransition,
    ageDropoutProbabilityForEducation,
    educationGraduationProbabilityForAge,
} from './education';

describe('ageDropoutProbabilityForEducation', () => {
    it('returns 0 for any age below MIN_EMPLOYABLE_AGE', () => {
        for (let age = 0; age < MIN_EMPLOYABLE_AGE; age++) {
            expect(ageDropoutProbabilityForEducation(age, 'primary')).toBe(0);
            expect(ageDropoutProbabilityForEducation(age, 'secondary')).toBe(0);
            expect(ageDropoutProbabilityForEducation(age, 'none')).toBe(0);
        }
    });

    it('returns the generic dropout probability before the graduation spread window', () => {
        const prob = ageDropoutProbabilityForEducation(MIN_EMPLOYABLE_AGE, 'secondary');
        expect(prob).toBe(0.06);
    });

    it('returns 0.5 at exactly the graduation age + spread boundary', () => {
        const prob = ageDropoutProbabilityForEducation(50, 'primary');
        expect(prob).toBe(0.95);
    });
});

describe('educationGraduationProbabilityForAge', () => {
    it('returns base graduation probability at graduation age', () => {
        expect(educationGraduationProbabilityForAge(17, 'primary')).toBe(0.75);
    });

    it('decays graduation probability for each year past graduation age', () => {
        expect(educationGraduationProbabilityForAge(18, 'primary')).toBeCloseTo(0.75 * 0.9);
        expect(educationGraduationProbabilityForAge(19, 'primary')).toBeCloseTo(0.75 * 0.9 ** 2);
    });

    it('returns pre-age probability squared for two years before graduation', () => {
        expect(educationGraduationProbabilityForAge(15, 'primary')).toBeCloseTo(0.01);
    });

    it('returns pre-age probability for one year before graduation', () => {
        expect(educationGraduationProbabilityForAge(16, 'primary')).toBeCloseTo(0.1);
    });
});

describe('applyEducationTransition', () => {
    beforeEach(() => {
        seedRng(42);
    });

    it('does not produce any unoccupied people for ages below MIN_EMPLOYABLE_AGE', () => {
        const planet = makePlanet();

        const age = 5;
        planet.population.demography[age].education.none.total = 100;

        applyEducationTransition(planet, age, age + 1, 'none');

        expect(planet.population.demography[age + 1].unoccupied.none.total).toBe(0);
        expect(planet.population.demography[age + 1].unoccupied.primary.total).toBe(0);
    });

    it('places dropouts into unoccupied keeping their current edu level', () => {
        const planet = makePlanet();

        const sourceAge = 40;
        const count = 10_000;
        planet.population.demography[sourceAge].education.secondary.total = count;

        applyEducationTransition(planet, sourceAge, sourceAge + 1, 'secondary');

        const unoccSecondary = planet.population.demography[sourceAge + 1].unoccupied.secondary.total;
        expect(unoccSecondary).toBeGreaterThan(0);

        expect(planet.population.demography[sourceAge + 1].unoccupied.none.total).toBe(0);
    });

    it('none-level graduates who do not continue land in unoccupied with edu=primary', () => {
        const planet = makePlanet();

        const sourceAge = 9;
        const count = 10_000;
        planet.population.demography[sourceAge].education.none.total = count;

        applyEducationTransition(planet, sourceAge, sourceAge + 1, 'none');

        const unoccPrimary = planet.population.demography[sourceAge + 1].unoccupied.primary.total;
        expect(unoccPrimary).toBeGreaterThan(0);
        expect(planet.population.demography[sourceAge + 1].unoccupied.none.total).toBe(0);
    });

    it('none-level kids who never graduate by age 14 drop out as edu=none', () => {
        const planet = makePlanet();

        const sourceAge = MIN_EMPLOYABLE_AGE;
        const count = 100_000;
        planet.population.demography[sourceAge].education.none.total = count;

        applyEducationTransition(planet, sourceAge, sourceAge + 1, 'none');

        const unoccNone = planet.population.demography[sourceAge + 1].unoccupied.none.total;
        expect(unoccNone).toBeGreaterThan(0);
    });

    it('places voluntary graduates-who-do-not-transition into unoccupied with the next edu level', () => {
        const planet = makePlanet();

        const sourceAge = 17;
        const count = 10_000;
        planet.population.demography[sourceAge].education.primary.total = count;

        applyEducationTransition(planet, sourceAge, sourceAge + 1, 'primary');

        expect(planet.population.demography[sourceAge + 1].unoccupied.secondary.total).toBeGreaterThan(0);
        expect(planet.population.demography[sourceAge + 1].unoccupied.none.total).toBe(0);
    });

    it('moves everyone to the next age-bracket in education when graduation is near-zero', () => {
        const planet = makePlanet();

        const age = 5;
        const count = 100;
        planet.population.demography[age].education.none.total = count;

        applyEducationTransition(planet, age, age + 1, 'none');

        const inEducation =
            planet.population.demography[age + 1].education.none.total +
            planet.population.demography[age + 1].education.primary.total;
        const unoccupied =
            planet.population.demography[age + 1].unoccupied.none.total +
            planet.population.demography[age + 1].unoccupied.primary.total;

        expect(inEducation + unoccupied).toBe(count);
        expect(unoccupied).toBe(0);
    });
});
