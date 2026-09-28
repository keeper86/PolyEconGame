import { describe, expect, it } from 'vitest';
import de from '../../messages/terms.de.json';
import en from '../../messages/terms.en.json';
import { RESOURCES_BY_NAME } from '@/simulation/planet/resourceCatalog';
import { educationLevelKeys } from '@/simulation/population/education';
import { OCCUPATIONS } from '@/simulation/population/population';
import { termFor } from './terms';

const SHIP_CATEGORIES = ['transport', 'construction', 'passenger'];

describe('term catalogs', () => {
    it('keeps every locale in sync with the default locale', () => {
        expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    });

    it('translates every resource in the simulation', () => {
        const missing = [...RESOURCES_BY_NAME.keys()].filter((name) => !(name in de));

        expect(missing).toEqual([]);
    });

    it('translates every occupation, education level and ship category', () => {
        const missing = [...OCCUPATIONS, ...educationLevelKeys, ...SHIP_CATEGORIES].filter((name) => !(name in de));

        expect(missing).toEqual([]);
    });

    it('falls back to the untranslated name', () => {
        expect(termFor('de', 'Nonexistent Thing')).toBe('Nonexistent Thing');
        expect(termFor('en', 'Crude Oil')).toBe('Crude Oil');
    });

    it('translates known names', () => {
        expect(termFor('de', 'Crude Oil')).toBe('Rohöl');
        expect(termFor('de', 'Iron Mine')).toBe('Eisenbergwerk');
    });
});
