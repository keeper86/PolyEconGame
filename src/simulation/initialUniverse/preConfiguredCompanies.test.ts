import { describe, expect, it } from 'vitest';
import { getNamesFor, NAMES } from './preConfiguredCompanies';
import type { FacilityType } from '../planet/productionFacilities';

describe('getNamesFor', () => {
    it('returns existing names when count <= available', () => {
        const names = getNamesFor('coalMine', 3);
        expect(names).toEqual(NAMES.coalMine.slice(0, 3));
    });

    it('uses all existing names when count equals available', () => {
        const count = NAMES.coalMine.length;
        const names = getNamesFor('coalMine', count);
        expect(names).toEqual(NAMES.coalMine);
    });

    it('generates additional names when count exceeds available', () => {
        const existingCount = NAMES.coalMine.length;
        const names = getNamesFor('coalMine', existingCount + 10);
        expect(names.length).toBe(existingCount + 10);
        // First existingCount names should be the original ones
        expect(names.slice(0, existingCount)).toEqual(NAMES.coalMine);
    });

    it('generates unique names', () => {
        const names = getNamesFor('oilWell', 50);
        const unique = new Set(names);
        expect(unique.size).toBe(names.length);
    });

    it('generates differently for different facility types (prima vista check)', () => {
        const oilNames = getNamesFor('oilWell', 20);
        const coalNames = getNamesFor('coalMine', 20);
        // They should be entirely different sets
        const overlap = oilNames.filter((n) => coalNames.includes(n));
        expect(overlap.length).toBe(0);
    });

    it('generates enough names for each facility type to meet TARGETS', () => {
        const targets: Record<FacilityType, number> = {
            coalMine: 8,
            oilWell: 64,
            loggingCamp: 16,
            educationCenter: 5,
            maintenanceFacility: 1,
            stoneQuarry: 16,
            copperMine: 16,
            sandMine: 32,
            limestoneQuarry: 24,
            cottonFarm: 32,
            waterFacility: 64,
            ironMine: 32,
            ironSmelter: 32,
            copperSmelter: 24,
            oilRefinery: 80,
            sawmill: 32,
            cementPlant: 32,
            glassFactory: 24,
            pesticidePlant: 24,
            paperMill: 24,
            textileMill: 32,
            concretePlant: 32,
            foodProcessor: 32,
            beveragePlant: 24,
            pharmaPlant: 24,
            clothingFactory: 32,
            furnitureFactory: 32,
            electronicsFactory: 24,
            itDevicesFactory: 32,
            machineryFactory: 16,
            vehicleFactory: 16,
            agriculturalFacility: 32,
            packagingPlant: 32,
            administrativeCenter: 32,
            logisticsHub: 32,
            constructionFacility: 32,
            groceryChain: 48,
            retailChain: 32,
            hospital: 32,
            siliconWaferFactory: 32,
        };

        for (const [facilityType, needed] of Object.entries(targets)) {
            const names = getNamesFor(facilityType as FacilityType, needed);
            expect(names.length).toBe(needed);
            const unique = new Set(names);
            expect(unique.size).toBe(names.length);
        }
    });
});
