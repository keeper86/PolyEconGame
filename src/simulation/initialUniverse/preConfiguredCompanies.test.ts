import { describe, expect, it } from 'vitest';
import { getNamesFor, NAMES } from './preConfiguredCompanies';

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

    it('generates deterministically (same facilityType, same count, same result)', () => {
        const a = getNamesFor('oilWell', 40);
        const b = getNamesFor('oilWell', 40);
        expect(a).toEqual(b);
    });

    it('generates differently for different facility types (prima vista check)', () => {
        const oilNames = getNamesFor('oilWell', 20);
        const coalNames = getNamesFor('coalMine', 20);
        // They should be entirely different sets
        const overlap = oilNames.filter((n) => coalNames.includes(n));
        expect(overlap.length).toBe(0);
    });

    it('handles tankerTransport (empty existing names)', () => {
        const names = getNamesFor('tankerTransport', 5);
        expect(names.length).toBe(5);
        const unique = new Set(names);
        expect(unique.size).toBe(5);
    });

    it('generates enough names for each facility type to meet TARGETS', () => {
        const targets: Record<string, number> = {
            coalMine: 8,
            oilWell: 64,
            loggingCamp: 16,
            stoneQuarry: 16,
            copperMine: 16,
            sandMine: 32,
            limestoneQuarry: 24,
            clayMine: 24,
            cottonFarm: 32,
            waterExtractionFacility: 64,
            ironExtractionFacility: 32,
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
            foodProcessingPlant: 32,
            beveragePlant: 24,
            pharmaceuticalPlant: 24,
            clothingFactory: 32,
            furnitureFactory: 32,
            electronicComponentFactory: 24,
            consumerElectronicsFactory: 32,
            machineryFactory: 16,
            vehicleFactory: 16,
            intensiveFarmFacility: 32,
            packagingPlant: 32,
            administrativeCenter: 32,
            logisticsHub: 32,
            constructionService: 32,
            groceryChain: 48,
            retailChain: 32,
            hospital: 32,
            siliconWaferFactory: 32,
        };

        for (const [facilityType, needed] of Object.entries(targets)) {
            const names = getNamesFor(facilityType, needed);
            expect(names.length).toBe(needed);
            const unique = new Set(names);
            expect(unique.size).toBe(names.length);
        }
    });
});
