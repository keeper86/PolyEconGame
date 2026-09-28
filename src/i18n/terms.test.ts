import { describe, expect, it } from 'vitest';
import de from '../../messages/terms.de.json';
import en from '../../messages/terms.en.json';
import { ALL_PRODUCTION_FACILITY_ENTRIES, facilityByName } from '@/simulation/planet/productionFacilities';
import { STORAGE_SHELL_FORM_NAMES } from '@/simulation/planet/facility';
import {
    HR_DEPARTMENT_NAME,
    LOGISTICS_DEPARTMENT_NAME,
    researchAndDevelopmentFacilityType,
    shipConstructionFacilityType,
    TRAINING_CENTER_NAME,
} from '@/simulation/planet/specialFacilities';
import { RESOURCES_BY_NAME } from '@/simulation/planet/resourceCatalog';
import { educationLevelKeys } from '@/simulation/population/education';
import { OCCUPATIONS } from '@/simulation/population/population';
import { constructionShipType, shiptypes } from '@/simulation/ships/ships';
import { termFor } from './terms';

const SHIP_CATEGORIES = ['transport', 'construction', 'passenger'];
const LICENSE_TYPES = ['commercial', 'workforce'];

const productionFacilityNames: string[] = Object.values(ALL_PRODUCTION_FACILITY_ENTRIES).map(
    (entry) => entry.template.name,
);

const specialFacilityNames = [
    HR_DEPARTMENT_NAME,
    LOGISTICS_DEPARTMENT_NAME,
    TRAINING_CENTER_NAME,
    researchAndDevelopmentFacilityType('catalog', 'preview').name,
    shipConstructionFacilityType('catalog', 'preview').name,
];

const shipTypeNames = [
    constructionShipType.name,
    ...Object.values(shiptypes).flatMap((category) =>
        Object.values(category).map((shipType) => (shipType as { name: string }).name),
    ),
];

const cargoTypes = [
    ...new Set(
        Object.values(shiptypes)
            .flatMap((category) => Object.values(category))
            .flatMap((shipType) => ('cargoSpecification' in shipType ? [shipType.cargoSpecification.type] : [])),
    ),
];

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

    it('translates every facility name', () => {
        const missing = [...productionFacilityNames, ...specialFacilityNames].filter((name) => !(name in de));

        expect(missing).toEqual([]);
    });

    it('translates every ship type and license type', () => {
        const missing = [...shipTypeNames, ...LICENSE_TYPES].filter((name) => !(name in de));

        expect(missing).toEqual([]);
    });

    it('translates every ship cargo type', () => {
        const missing = cargoTypes.filter((name) => !(name in de));

        expect(missing).toEqual([]);
    });

    it('translates every storage shell form name', () => {
        const missing = Object.values(STORAGE_SHELL_FORM_NAMES).filter((name) => !(name in de));

        expect(missing).toEqual([]);
    });

    it('resolves facility names through the catalog rather than falling back', () => {
        expect(facilityByName.has('Oil Well')).toBe(true);
        expect(termFor('de', 'Oil Well')).toBe('Ölquelle');
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
