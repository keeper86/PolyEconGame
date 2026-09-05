import { describe, expect, it } from 'vitest';
import { makeAgentPlanetAssets, makePlanet, makeProductionFacility } from '../../utils/testHelper';
import type { ProductionFacility } from '../facility';
import { processedFoodResourceType } from '../resources';
import { groceryServiceResourceType, maintenanceServiceResourceType } from '../services';
import { MIN_SCALE_FRACTION } from './constants';
import { computePidDelta, getDefaultPidState } from './pidController';
import {
    SERVICE_FLOW_DECAY_TARGET,
    SERVICE_FLOW_EMA_ALPHA,
    isFlowControlledServiceFacility,
    serviceFlowError,
    updateServiceFlowSignal,
} from './serviceFlow';

function makeMaintenanceFacility(): ProductionFacility {
    return makeProductionFacility(undefined, {
        name: 'Maintenance Facility',
        maxScale: 100,
        scale: 100,
        produces: [{ resource: maintenanceServiceResourceType, quantity: 100 }],
    });
}

function makeGroceryFacility(): ProductionFacility {
    return makeProductionFacility(undefined, {
        name: 'Grocery Chain',
        maxScale: 100,
        scale: 100,
        produces: [{ resource: groceryServiceResourceType, quantity: 10 }],
    });
}

function makeGoodsFacility(): ProductionFacility {
    return makeProductionFacility(undefined, {
        name: 'Food Processor',
        maxScale: 100,
        scale: 100,
        produces: [{ resource: processedFoodResourceType, quantity: 10 }],
    });
}

function setMarketResult(planet: ReturnType<typeof makePlanet>, name: string, unfilledFrac: number): void {
    planet.lastMarketResult[name] = {
        resourceName: name,
        clearingPrice: 1,
        totalVolume: 100,
        totalDemand: 100,
        totalSupply: 100,
        unfilledDemand: unfilledFrac * 100,
        unsoldSupply: 0,
    };
}

/** Sets produced this tick and the service's decayed-this-tick in the agent's decay scratch. */
function setFlowRaw(
    facility: ProductionFacility,
    assets: ReturnType<typeof makeAgentPlanetAssets>,
    produced: number,
    decayed: number,
    name: string,
): void {
    facility.lastTickResults.lastProduced[name] = produced;
    assets.lastDepreciatedPerTick[name] = decayed;
}

describe('isFlowControlledServiceFacility', () => {
    it('selects every facility that produces a service', () => {
        expect(isFlowControlledServiceFacility(makeMaintenanceFacility())).toBe(true);
        expect(isFlowControlledServiceFacility(makeGroceryFacility())).toBe(true);
    });

    it('rejects pure goods facilities', () => {
        expect(isFlowControlledServiceFacility(makeGoodsFacility())).toBe(false);
    });

    it('selects mixed-output facilities that produce a service alongside goods', () => {
        const mixed = makeProductionFacility(undefined, {
            produces: [
                { resource: processedFoodResourceType, quantity: 10 },
                { resource: maintenanceServiceResourceType, quantity: 1 },
            ],
        });
        expect(isFlowControlledServiceFacility(mixed)).toBe(true);
    });
});

describe('serviceFlowError (decay-target controller)', () => {
    const T = SERVICE_FLOW_DECAY_TARGET;

    it('is neutral when nothing of what we produce decays away and demand is served', () => {
        expect(serviceFlowError(0, 0, T)).toBe(0);
    });

    it('is neutral when decay equals the tolerated target and demand is served', () => {
        expect(serviceFlowError(T, 0, T)).toBe(0);
    });

    it('expands into unfilled demand while decay stays at or under target', () => {
        expect(serviceFlowError(0.1, 0.3, T)).toBe(1);
        expect(serviceFlowError(0.05, 0.1, T)).toBeCloseTo(0.4, 5);
    });

    it('contracts when decay exceeds the tolerated share even if demand is unfilled', () => {
        const over = 0.6;
        const expected = -(over - T) / (1 - T);
        expect(serviceFlowError(over, 0.3, T)).toBeCloseTo(expected, 5);
    });

    it('is fully negative once all output rots', () => {
        expect(serviceFlowError(1, 0.3, T)).toBe(-1);
    });

    it('honors an override decay target', () => {
        expect(serviceFlowError(0.4, 0, 0.6)).toBe(0);
        expect(serviceFlowError(0.8, 0, 0.6)).toBeCloseTo(-(0.8 - 0.6) / 0.4, 5);
    });
});

describe('updateServiceFlowSignal', () => {
    it('reads produced + decayed-this-tick and market unfilled for a service facility', () => {
        const facility = makeMaintenanceFacility();
        const assets = makeAgentPlanetAssets('p');
        const planet = makePlanet();
        const state = getDefaultPidState();
        setFlowRaw(facility, assets, 100, 5, maintenanceServiceResourceType.name);
        setMarketResult(planet, maintenanceServiceResourceType.name, 0.3);
        const signal = updateServiceFlowSignal(facility, assets, planet, state);
        expect(signal?.resourceName).toBe(maintenanceServiceResourceType.name);
        expect(signal?.producedEMA).toBeCloseTo(100, 5);
        expect(signal?.decayedEMA).toBeCloseTo(5, 5);
        expect(signal?.decayShare).toBeCloseTo(0.05, 5);
        expect(signal?.unfilledEMA).toBeCloseTo(0.3, 5);
        expect(signal?.error).toBe(1);
        expect(state.flowProducedEMA).toBeCloseTo(100, 5);
        expect(state.flowDecayedEMA).toBeCloseTo(5, 5);
    });

    it('applies to consumer-facing service facilities like grocery', () => {
        const facility = makeGroceryFacility();
        const assets = makeAgentPlanetAssets('p');
        const planet = makePlanet();
        setFlowRaw(facility, assets, 50, 0, groceryServiceResourceType.name);
        setMarketResult(planet, groceryServiceResourceType.name, 0.1);
        const signal = updateServiceFlowSignal(facility, assets, planet, getDefaultPidState());
        expect(signal?.error).toBeCloseTo(0.4, 5);
    });

    it('returns null for non-service facilities', () => {
        const goods = makeGoodsFacility();
        expect(
            updateServiceFlowSignal(goods, makeAgentPlanetAssets('p'), makePlanet(), getDefaultPidState()),
        ).toBeNull();
    });
});

describe('flow-driven service scale responds to decay share', () => {
    it('ramps the operating scale down under sustained decay beyond the target', () => {
        const facility = makeMaintenanceFacility();
        const assets = makeAgentPlanetAssets('p');
        const planet = makePlanet();
        setMarketResult(planet, maintenanceServiceResourceType.name, 0);
        const state = getDefaultPidState();
        for (let tick = 0; tick < 5_000; tick++) {
            // produced 100, rots 50 each tick -> decay share 0.5 > 0.3 target
            setFlowRaw(facility, assets, 100, 50, maintenanceServiceResourceType.name);
            const signal = updateServiceFlowSignal(facility, assets, planet, state);
            expect(signal).not.toBeNull();
            const delta = computePidDelta(signal!.error, state) * facility.maxScale;
            facility.scale = Math.max(
                facility.maxScale * MIN_SCALE_FRACTION,
                Math.min(facility.maxScale, facility.scale + delta),
            );
        }
        expect(facility.scale).toBeLessThan(50);
    });

    it('ramps the operating scale up while nothing decays and demand is unfilled', () => {
        const facility = makeMaintenanceFacility();
        facility.scale = 10;
        const assets = makeAgentPlanetAssets('p');
        const planet = makePlanet();
        setMarketResult(planet, maintenanceServiceResourceType.name, 0.3);
        const state = getDefaultPidState();
        for (let tick = 0; tick < 5_000; tick++) {
            setFlowRaw(facility, assets, 100, 0, maintenanceServiceResourceType.name);
            const signal = updateServiceFlowSignal(facility, assets, planet, state);
            const delta = computePidDelta(signal!.error, state) * facility.maxScale;
            facility.scale = Math.max(
                facility.maxScale * MIN_SCALE_FRACTION,
                Math.min(facility.maxScale, facility.scale + delta),
            );
        }
        expect(facility.scale).toBeCloseTo(facility.maxScale);
    });

    it('holds the operating scale when decay is within the target and demand is served', () => {
        const facility = makeMaintenanceFacility();
        const assets = makeAgentPlanetAssets('p');
        const planet = makePlanet();
        setMarketResult(planet, maintenanceServiceResourceType.name, 0);
        const state = getDefaultPidState();
        for (let tick = 0; tick < 5_000; tick++) {
            setFlowRaw(facility, assets, 100, 30, maintenanceServiceResourceType.name);
            const signal = updateServiceFlowSignal(facility, assets, planet, state);
            const delta = computePidDelta(signal!.error, state) * facility.maxScale;
            facility.scale = Math.max(
                facility.maxScale * MIN_SCALE_FRACTION,
                Math.min(facility.maxScale, facility.scale + delta),
            );
        }
        expect(facility.scale).toBeGreaterThan(90);
    });

    it('exposes the flow state on the pid state for hysteresis', () => {
        const facility = makeMaintenanceFacility();
        const assets = makeAgentPlanetAssets('p');
        const planet = makePlanet();
        setMarketResult(planet, maintenanceServiceResourceType.name, 0);
        const state = getDefaultPidState();
        setFlowRaw(facility, assets, 200, 20, maintenanceServiceResourceType.name);
        updateServiceFlowSignal(facility, assets, planet, state);
        expect(state.flowProducedEMA).toBeCloseTo(200, 5);
        expect(state.flowDecayedEMA).toBeCloseTo(20, 5);
        expect(SERVICE_FLOW_EMA_ALPHA).toBeGreaterThan(0);
        expect(SERVICE_FLOW_EMA_ALPHA).toBeLessThan(1);
    });
});
