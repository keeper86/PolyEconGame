import { describe, expect, it } from 'vitest';
import { makePlanet } from '../utils/testHelper';
import { computeNormalizedBuffer } from './serviceBufferNormalizer';
import { SERVICE_DEFINITIONS } from './serviceDefinitions';

function setCategoryBuffer(
    planet: ReturnType<typeof makePlanet>,
    age: number,
    occ: 'education' | 'employed',
    buffer: number,
): void {
    const cat = planet.population.demography[age][occ].none.novice;
    cat.total = 1;
    cat.services.education.buffer = buffer;
    cat.services.grocery.buffer = buffer;
}

describe('computeNormalizedBuffer', () => {
    it('returns 0 when no consumers exist', () => {
        const planet = makePlanet();
        expect(computeNormalizedBuffer(planet, 'education')).toBe(0);
    });

    it('returns 1.0 when only students have a full education buffer', () => {
        const planet = makePlanet();
        for (let age = 6; age <= 15; age++) {
            setCategoryBuffer(planet, age, 'education', SERVICE_DEFINITIONS.education.bufferTargetTicks);
        }
        for (let age = 25; age <= 64; age++) {
            setCategoryBuffer(planet, age, 'employed', 0);
        }
        expect(computeNormalizedBuffer(planet, 'education')).toBe(1.0);
    });

    it('returns 0.5 with half-full education buffer', () => {
        const planet = makePlanet();
        for (let age = 6; age <= 15; age++) {
            setCategoryBuffer(planet, age, 'education', SERVICE_DEFINITIONS.education.bufferTargetTicks / 2);
        }
        expect(computeNormalizedBuffer(planet, 'education')).toBe(0.5);
    });

    it('grocery buffer is normalized per consumer with mixed-age populations', () => {
        const planet = makePlanet();
        for (let age = 6; age <= 15; age++) {
            setCategoryBuffer(planet, age, 'education', SERVICE_DEFINITIONS.grocery.bufferTargetTicks);
        }
        for (let age = 25; age <= 64; age++) {
            setCategoryBuffer(planet, age, 'employed', SERVICE_DEFINITIONS.grocery.bufferTargetTicks);
        }
        expect(computeNormalizedBuffer(planet, 'grocery')).toBe(1.0);
    });

    it('clamps to 1.0 when average buffer exceeds target', () => {
        const planet = makePlanet();
        for (let age = 6; age <= 15; age++) {
            setCategoryBuffer(planet, age, 'education', SERVICE_DEFINITIONS.education.bufferTargetTicks * 2);
        }
        expect(computeNormalizedBuffer(planet, 'education')).toBe(1.0);
    });
});
