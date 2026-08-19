import { describe, expect, it } from 'vitest';
import { TICKS_PER_MONTH } from '../constants';
import { computeDynamicExpansionTarget } from '../planet/automaticProductionScale/expansionTarget';
import { updateProductionCostFloors } from '../planet/production';
import { servicesFacility } from '../planet/productionFacilities';
import { serviceResourceType } from '../planet/services';
import { makeAgentPlanetAssets, makePlanet } from '../utils/testHelper';
import {
    householdDemandPriority,
    referenceMonthlyIncome,
    SERVICE_DEFINITIONS,
    SERVICE_TIERS,
} from './serviceDefinitions';

describe('wage-grounded Engel saturation', () => {
    it('is scale-invariant: rescaling wealth and reference income by the same factor leaves the rate unchanged', () => {
        for (const key of ['grocery', 'retail', 'service'] as const) {
            const def = SERVICE_DEFINITIONS[key];
            const low = def.consumptionRatePerPersonPerTick(30, 'employed', { mean: 100, variance: 0 }, 30);
            const high = def.consumptionRatePerPersonPerTick(30, 'employed', { mean: 100000, variance: 0 }, 30000);
            expect(low).toBeCloseTo(high, 10);
        }
    });

    it('saturates only at high relative income, not at high absolute wealth', () => {
        const def = SERVICE_DEFINITIONS.service;
        const poor = def.consumptionRatePerPersonPerTick(30, 'employed', { mean: 1000, variance: 0 }, 30000);
        const rich = def.consumptionRatePerPersonPerTick(30, 'employed', { mean: 1000, variance: 0 }, 30);
        expect(rich).toBeGreaterThan(poor * 10);
    });

    it('derives reference income from the live planet wage', () => {
        const planet = makePlanet();
        planet.wagePerEdu = { none: 10, primary: 10, secondary: 10, tertiary: 10 };
        expect(referenceMonthlyIncome(planet)).toBe(10 * TICKS_PER_MONTH);
    });
});

describe('labor-only Service sector', () => {
    it('servicesFacility has no material inputs and produces Service', () => {
        const facility = servicesFacility('p', 's1');
        expect(facility.needs).toHaveLength(0);
        expect(facility.produces[0].resource.name).toBe(serviceResourceType.name);
    });

    it('is the residual demand (last in household priority) and not a cost-of-living tier', () => {
        expect(householdDemandPriority[householdDemandPriority.length - 1]).toBe(serviceResourceType.name);
        const tierServices = SERVICE_TIERS.flatMap((tier) => tier.services);
        expect(tierServices).not.toContain('service');
    });

    it('has a heavy Engel curve: relative demand grows ~60x from neutral to 10 years of income', () => {
        const refIncome = 30;
        const def = SERVICE_DEFINITIONS.service;
        const neutral = def.consumptionRatePerPersonPerTick(30, 'employed', { mean: 0, variance: 0 }, refIncome);
        const rich = def.consumptionRatePerPersonPerTick(
            30,
            'employed',
            { mean: 120 * refIncome, variance: 0 },
            refIncome,
        );
        expect(rich).toBeGreaterThan(neutral * 50);
    });

    it('outpaces retail in absolute rate once households hold ~10 years of income', () => {
        const refIncome = 30;
        const wealth = { mean: 120 * refIncome, variance: 0 };
        const serviceRate = SERVICE_DEFINITIONS.service.consumptionRatePerPersonPerTick(
            30,
            'employed',
            wealth,
            refIncome,
        );
        const retailRate = SERVICE_DEFINITIONS.retail.consumptionRatePerPersonPerTick(
            30,
            'employed',
            wealth,
            refIncome,
        );
        expect(serviceRate).toBeGreaterThan(retailRate * 2);
    });
});

describe('0-needs facility through production scale machinery', () => {
    it('produces a finite, positive wage-driven cost floor', () => {
        const planet = makePlanet();
        updateProductionCostFloors(planet);
        const floor = planet.lastProductionCostFloors[serviceResourceType.name];
        expect(Number.isFinite(floor)).toBe(true);
        expect(floor).toBeGreaterThan(0);
    });

    it('computes a finite expansion target despite having no needs', () => {
        const planet = makePlanet();
        const facility = servicesFacility('p', 's1');
        facility.maxScale = 100;
        facility.scale = 100;
        const assets = makeAgentPlanetAssets('p');
        const target = computeDynamicExpansionTarget(facility, assets, planet, new Map(), new Map(), true, 0);
        expect(Number.isFinite(target)).toBe(true);
        expect(target).toBeGreaterThanOrEqual(100);
    });
});
