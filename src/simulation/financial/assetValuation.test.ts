import { describe, expect, it } from 'vitest';

import { RECYCLER_BASE_RECOVERY_EFFICIENCY } from '../constants';
import { calculateCostsForConstruction } from '../planet/facility';
import type { AgentPlanetAssets } from '../planet/planet';
import { makeAgentPlanetAssets, makeProductionFacility } from '../utils/testHelper';
import { computeFacilitiesValue } from './assetValuation';

const CS_PRICE = 10;

function makeAssets(overrides: Parameters<typeof makeProductionFacility>[1]): AgentPlanetAssets {
    return makeAgentPlanetAssets('p', {
        productionFacilities: [makeProductionFacility(undefined, overrides)],
    });
}

function fullValue(scale: number): number {
    return calculateCostsForConstruction('raw', 0, scale).cost * RECYCLER_BASE_RECOVERY_EFFICIENCY * CS_PRICE;
}

describe('computeFacilitiesValue', () => {
    it('values a fully maintained facility at full construction cost', () => {
        const assets = makeAssets({
            maxScale: 1,
            scale: 1,
            construction: null,
            maintenanceStatus: 1,
            maxMaintenance: 1,
        });
        expect(computeFacilitiesValue(assets, CS_PRICE)).toBeCloseTo(fullValue(1));
    });

    it('scales value by maintenance state when under-maintained', () => {
        const assets = makeAssets({
            maxScale: 1,
            scale: 1,
            construction: null,
            maintenanceStatus: 0.5,
            maxMaintenance: 1,
        });
        expect(computeFacilitiesValue(assets, CS_PRICE)).toBeCloseTo(fullValue(1) * 0.5);
    });

    it('scales value by restoration state when permanently degraded', () => {
        const assets = makeAssets({
            maxScale: 1,
            scale: 1,
            construction: null,
            maintenanceStatus: 1,
            maxMaintenance: 0.5,
        });
        expect(computeFacilitiesValue(assets, CS_PRICE)).toBeCloseTo(fullValue(1) * 0.5);
    });

    it('multiplies maintenance and restoration states when both are degraded', () => {
        const assets = makeAssets({
            maxScale: 1,
            scale: 1,
            construction: null,
            maintenanceStatus: 0.5,
            maxMaintenance: 0.5,
        });
        expect(computeFacilitiesValue(assets, CS_PRICE)).toBeCloseTo(fullValue(1) * 0.25);
    });

    it('clamps out-of-range condition to zero', () => {
        const assets = makeAssets({
            maxScale: 1,
            scale: 1,
            construction: null,
            maintenanceStatus: -0.5,
            maxMaintenance: 1,
        });
        expect(computeFacilitiesValue(assets, CS_PRICE)).toBe(0);
    });

    it('clamps out-of-range condition above one to full value', () => {
        const assets = makeAssets({
            maxScale: 1,
            scale: 1,
            construction: null,
            maintenanceStatus: 2,
            maxMaintenance: 3,
        });
        expect(computeFacilitiesValue(assets, CS_PRICE)).toBeCloseTo(fullValue(1));
    });

    it('does not scale the in-construction portion by condition', () => {
        const assets = makeAssets({
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
            },
        });

        const completedValue = fullValue(1) * 0.25;
        const incrCost = calculateCostsForConstruction('raw', 1, 2).cost;
        const partialValue = incrCost * RECYCLER_BASE_RECOVERY_EFFICIENCY * CS_PRICE * 0.5;

        expect(computeFacilitiesValue(assets, CS_PRICE)).toBeCloseTo(completedValue + partialValue);
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
