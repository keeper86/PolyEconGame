import type { ManagementFacility, ProductionFacility, ShipConstructionFacility } from '../planet/facility';
import { constructionServiceResourceType } from '../planet/services';
import type { ConstructionShip, Ship, TransportShip } from '../ships/ships';

// ── Slim ship info needed for consumption computation ──────────────────────

export type ConsumptionShipInfo = {
    id: string;
    type: { type: string };
    state: {
        type: string;
        planetId: string;
        cargoGoal: { resource: { name: string }; quantity: number } | null;
        currentCargo: { resource: { name: string }; quantity: number } | null;
        buildingTarget: {
            construction: { maximumConstructionServiceConsumption: number } | null;
        } | null;
    };
};

/**
 * Converts a full Ship to the slim ConsumptionShipInfo needed for consumption
 * computation. Uses proper discriminated union narrowing on ship state type.
 */
export function toConsumptionShipInfo(ship: Ship): ConsumptionShipInfo {
    const base: ConsumptionShipInfo['state'] = {
        type: ship.state.type,
        planetId: 'planetId' in ship.state ? ship.state.planetId : '',
        cargoGoal: null,
        currentCargo: null,
        buildingTarget: null,
    };

    const state = ship.state;

    // Transport ship states that carry cargo
    if (state.type === 'loading' || state.type === 'unloading' || state.type === 'transporting') {
        const ts = state as TransportShip['state'];
        if ('cargoGoal' in ts) {
            base.cargoGoal = ts.cargoGoal;
        }
        if ('currentCargo' in ts) {
            base.currentCargo = ts.currentCargo;
        }
    }

    // Construction ship states that carry a building target
    if (state.type === 'pre-fabrication' || state.type === 'reconstruction') {
        const cs = state as ConstructionShip['state'];
        if ('buildingTarget' in cs) {
            base.buildingTarget = cs.buildingTarget as ConsumptionShipInfo['state']['buildingTarget'];
        }
    }

    return { id: ship.id, type: { type: ship.type.type }, state: base };
}

// ── Types ──────────────────────────────────────────────────────────────────

export type ConsumptionBreakdownItem = {
    sourceType:
        | 'production'
        | 'management'
        | 'ship_construction'
        | 'construction_service'
        | 'construction_ship'
        | 'transport_ship';
    sourceName: string;
    ratePerTick: number;
};

export type ConsumptionInfo = {
    totalPerTick: number;
    breakdown: ConsumptionBreakdownItem[];
};

export function computeConsumptionBreakdown(
    productionFacilities: ProductionFacility[],
    managementFacilities: ManagementFacility[],
    shipConstructionFacilities: ShipConstructionFacility[],
    ships: ConsumptionShipInfo[],
    planetId: string,
    resourceName: string,
): ConsumptionInfo {
    const breakdown: ConsumptionBreakdownItem[] = [];
    const isConstructionService = resourceName === constructionServiceResourceType.name;

    // ── Production facilities ──────────────────────────────────────────────
    for (const f of productionFacilities) {
        const need = f.needs.find((n) => n.resource.name === resourceName);
        if (need) {
            const rate = need.quantity * f.scale;
            if (rate > 0) {
                breakdown.push({ sourceType: 'production', sourceName: f.name, ratePerTick: rate });
            }
        }
    }

    // ── Management facilities ──────────────────────────────────────────────
    for (const f of managementFacilities) {
        const need = f.needs.find((n) => n.resource.name === resourceName);
        if (need) {
            const rate = need.quantity * f.scale;
            if (rate > 0) {
                breakdown.push({ sourceType: 'management', sourceName: f.name, ratePerTick: rate });
            }
        }
    }

    // ── Ship construction facilities ───────────────────────────────────────
    for (const f of shipConstructionFacilities) {
        if (f.construction !== null) {
            // Yard is under construction itself — skip building-cost inputs
            continue;
        }
        if (!f.produces) {
            continue;
        }
        const ratePerTick = Math.min(1, Math.sqrt(f.scale) / f.produces.buildingTime);
        for (const cost of f.produces.buildingCost) {
            if (cost.resource.name === resourceName) {
                const rate = cost.quantity * ratePerTick;
                if (rate > 0) {
                    breakdown.push({ sourceType: 'ship_construction', sourceName: f.name, ratePerTick: rate });
                }
            }
        }
    }

    // ── Construction services (any facility with active construction) ──────
    if (isConstructionService) {
        const allFacilities: (ProductionFacility | ManagementFacility | ShipConstructionFacility)[] = [
            ...productionFacilities,
            ...managementFacilities,
            ...shipConstructionFacilities,
        ];
        for (const f of allFacilities) {
            if (f.construction !== null) {
                const rate = f.construction.maximumConstructionServiceConsumption;
                if (rate > 0) {
                    breakdown.push({
                        sourceType: 'construction_service',
                        sourceName: f.name,
                        ratePerTick: rate,
                    });
                }
            }
        }
    }

    // ── Construction ships doing pre-fabrication ───────────────────────────
    for (const ship of ships) {
        if (ship.type.type !== 'construction') {
            continue;
        }
        if (ship.state.type !== 'pre-fabrication') {
            continue;
        }
        if (ship.state.planetId !== planetId) {
            continue;
        }
        if (!isConstructionService) {
            continue; // construction ships only demand Construction services
        }
        const bld = ship.state.buildingTarget;
        if (bld?.construction) {
            const rate = bld.construction.maximumConstructionServiceConsumption;
            if (rate > 0) {
                breakdown.push({
                    sourceType: 'construction_ship',
                    sourceName: `Pre-fab: ${ship.id}`,
                    ratePerTick: rate,
                });
            }
        }
    }

    // ── Transport ships loading cargo ──────────────────────────────────────
    for (const ship of ships) {
        if (ship.type.type !== 'transport') {
            continue;
        }
        if (ship.state.type !== 'loading') {
            continue;
        }
        if (ship.state.planetId !== planetId) {
            continue;
        }
        const goal = ship.state.cargoGoal;
        if (!goal) {
            continue;
        }
        // This ship is loading a resource — it creates consumption pressure
        // The "rate" is the remaining cargo to load per tick
        // (We report the full remaining quantity as a one-shot target,
        //  same as automaticPricing.ts does per-tick shortfall.)
        const alreadyLoaded = ship.state.currentCargo?.quantity ?? 0;
        const remaining = goal.quantity - alreadyLoaded;
        if (remaining > 0 && goal.resource.name === resourceName) {
            breakdown.push({
                sourceType: 'transport_ship',
                sourceName: `Loading: ${ship.id}`,
                ratePerTick: remaining, // remaining cargo needed
            });
        }
    }

    const totalPerTick = breakdown.reduce((sum, item) => sum + item.ratePerTick, 0);
    return { totalPerTick, breakdown };
}

/**
 * Convenience: computes per-tick consumption rates for ALL resources in one pass.
 * Returns a Map<resourceName, totalRate>.  Much faster than calling
 * computeConsumptionBreakdown per resource when you need everything.
 */
export function computeAllConsumptionRates(
    productionFacilities: ProductionFacility[],
    managementFacilities: ManagementFacility[],
    shipConstructionFacilities: ShipConstructionFacility[],
    ships: ConsumptionShipInfo[],
    planetId: string,
): Map<string, number> {
    const rates = new Map<string, number>();

    const add = (resourceName: string, rate: number) => {
        rates.set(resourceName, (rates.get(resourceName) ?? 0) + rate);
    };

    // ── Production facilities ──────────────────────────────────────────────
    for (const f of productionFacilities) {
        for (const need of f.needs) {
            if (need.resource.form === 'landBoundResource') {
                continue;
            }
            add(need.resource.name, need.quantity * f.scale);
        }
    }

    // ── Management facilities ──────────────────────────────────────────────
    for (const f of managementFacilities) {
        for (const need of f.needs) {
            if (need.resource.form === 'landBoundResource') {
                continue;
            }
            add(need.resource.name, need.quantity * f.scale);
        }
    }

    // ── Ship construction facilities ───────────────────────────────────────
    for (const f of shipConstructionFacilities) {
        if (f.construction !== null) {
            continue;
        }
        if (!f.produces) {
            continue;
        }
        const ratePerTick = Math.min(1, Math.sqrt(f.scale) / f.produces.buildingTime);
        for (const cost of f.produces.buildingCost) {
            add(cost.resource.name, cost.quantity * ratePerTick);
        }
    }

    // ── Construction services (any facility with active construction) ──────
    const allFacilities: (ProductionFacility | ManagementFacility | ShipConstructionFacility)[] = [
        ...productionFacilities,
        ...managementFacilities,
        ...shipConstructionFacilities,
    ];
    for (const f of allFacilities) {
        if (f.construction !== null) {
            add(constructionServiceResourceType.name, f.construction.maximumConstructionServiceConsumption);
        }
    }

    // ── Construction ships doing pre-fabrication ───────────────────────────
    for (const ship of ships) {
        if (ship.type.type !== 'construction') {
            continue;
        }
        if (ship.state.type !== 'pre-fabrication') {
            continue;
        }
        if (ship.state.planetId !== planetId) {
            continue;
        }
        const bld = ship.state.buildingTarget;
        if (bld?.construction) {
            add(constructionServiceResourceType.name, bld.construction.maximumConstructionServiceConsumption);
        }
    }

    // ── Transport ships loading cargo ──────────────────────────────────────
    for (const ship of ships) {
        if (ship.type.type !== 'transport') {
            continue;
        }
        if (ship.state.type !== 'loading') {
            continue;
        }
        if (ship.state.planetId !== planetId) {
            continue;
        }
        const goal = ship.state.cargoGoal;
        if (!goal) {
            continue;
        }
        const alreadyLoaded = ship.state.currentCargo?.quantity ?? 0;
        const remaining = goal.quantity - alreadyLoaded;
        if (remaining > 0) {
            add(goal.resource.name, remaining);
        }
    }

    return rates;
}
