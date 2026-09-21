import { describe, expect, it } from 'vitest';

import { RECYCLER_BASE_RECOVERY_EFFICIENCY } from '../constants';
import { calculateCostsForConstruction } from '../planet/facility';
import type { AgentPlanetAssets } from '../planet/planet';
import { makeAgentPlanetAssets, makeProductionFacility } from '../utils/testHelper';
import { computeFacilitiesValue } from './assetValuation';

const CS_PRICE = 10;

function makeAssets(overrides: Parameters<typeof makeProductionFacility>[1]): AgentPlanetAssets {
    const assets = makeAgentPlanetAssets('p', {
        productionFacilities: [makeProductionFacility(undefined, overrides)],
    });
    assets.storage.department = null;
    return assets;
}

function fullValue(scale: number): number {
    return calculateCostsForConstruction('raw', 0, scale).cost * RECYCLER_BASE_RECOVERY_EFFICIENCY * CS_PRICE;
}

// The agent fixture always carries a storage facility whose three physical shells are themselves
// capital facilities, so computeFacilitiesValue includes a constant shell baseline. These helpers
// isolate the contribution of the single production facility under test.
function storageShellBaseline(price: number = CS_PRICE): number {
    const assets = makeAgentPlanetAssets('p');
    assets.storage.department = null;
    return computeFacilitiesValue(assets, price);
}

function singleFacilityValue(
    overrides: Parameters<typeof makeProductionFacility>[1],
    price: number = CS_PRICE,
): number {
    return computeFacilitiesValue(makeAssets(overrides), price) - storageShellBaseline(price);
}

describe('computeFacilitiesValue', () => {
    it('values a fully maintained facility at full construction cost', () => {
        const value = singleFacilityValue({
            maxScale: 1,
            scale: 1,
            construction: null,
            maintenanceStatus: 1,
            maxMaintenance: 1,
        });
        expect(value).toBeCloseTo(fullValue(1));
    });

    it('scales value by maintenance state when under-maintained', () => {
        const value = singleFacilityValue({
            maxScale: 1,
            scale: 1,
            construction: null,
            maintenanceStatus: 0.5,
            maxMaintenance: 1,
        });
        expect(value).toBeCloseTo(fullValue(1) * 0.5);
    });

    it('scales value by restoration state when permanently degraded', () => {
        const value = singleFacilityValue({
            maxScale: 1,
            scale: 1,
            construction: null,
            maintenanceStatus: 1,
            maxMaintenance: 0.5,
        });
        expect(value).toBeCloseTo(fullValue(1) * 0.5);
    });

    it('multiplies maintenance and restoration states when both are degraded', () => {
        const value = singleFacilityValue({
            maxScale: 1,
            scale: 1,
            construction: null,
            maintenanceStatus: 0.5,
            maxMaintenance: 0.5,
        });
        expect(value).toBeCloseTo(fullValue(1) * 0.25);
    });

    it('clamps out-of-range condition to zero', () => {
        const value = singleFacilityValue({
            maxScale: 1,
            scale: 1,
            construction: null,
            maintenanceStatus: -0.5,
            maxMaintenance: 1,
        });
        expect(value).toBe(0);
    });

    it('clamps out-of-range condition above one to full value', () => {
        const value = singleFacilityValue({
            maxScale: 1,
            scale: 1,
            construction: null,
            maintenanceStatus: 2,
            maxMaintenance: 3,
        });
        expect(value).toBeCloseTo(fullValue(1));
    });

    it('does not scale the in-construction portion by condition', () => {
        const completedValue = fullValue(1) * 0.25;
        const incrCost = calculateCostsForConstruction('raw', 1, 2).cost;
        const partialValue = incrCost * 0.5 * CS_PRICE * 0.25;

        const value = singleFacilityValue({
            maxScale: 1,
            scale: 1,
            maintenanceStatus: 0.5,
            maxMaintenance: 0.5,
            construction: {
                type: 'expansion',
                constructionTargetMaxScale: 2,
                totalConstructionServiceRequired: 100,
                maximumConstructionServiceConsumption: 1,
                progress: 50,
                lastTickInvestedConstructionServices: 0,
                suspended: false,
            },
        });
        expect(value).toBeCloseTo(completedValue + partialValue);
    });

    it('returns zero when construction service price is non-positive', () => {
        const assets = makeAssets({
            maxScale: 1,
            scale: 1,
            construction: null,
            maintenanceStatus: 1,
            maxMaintenance: 1,
        });
        expect(computeFacilitiesValue(assets, 0)).toBe(0);
    });
});
