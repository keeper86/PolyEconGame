import { isConstructionActive, isFacilityOperating } from '../planet/facility';
import type { AgentPlanetAssets } from '../planet/planet';
import { getAllFacilities } from '../planet/planet';
import {
    facilityMaintenanceConsumptionPerTick,
    facilityRestorationCapacityPerTick,
} from '../planet/facilityMaintenance';
import { constructionServiceResourceType, maintenanceServiceResourceType } from '../planet/services';
import type { ConsumptionShipInfo } from './consumptionShipInfo';
import type { Resource, ResourceQuantity } from '../planet/claims';

// ── Types ──────────────────────────────────────────────────────────────────

type ConsumptionBreakdownItem = {
    sourceType:
        | 'production'
        | 'management'
        | 'ship_construction'
        | 'construction_service'
        | 'construction_ship'
        | 'transport_ship'
        | 'restoration'
        | 'maintenance';
    sourceName: string;
    ratePerTick: number;
};

export type ConsumptionInfo = {
    totalPerTick: number;
    breakdown: ConsumptionBreakdownItem[];
};

export function computeConsumptionBreakdown(
    assets: AgentPlanetAssets,
    ships: ConsumptionShipInfo[],
    planetId: string,
    resourceName: string,
): ConsumptionInfo {
    const breakdown: ConsumptionBreakdownItem[] = [];
    const isConstructionService = resourceName === constructionServiceResourceType.name;
    const isMaintenanceService = resourceName === maintenanceServiceResourceType.name;

    const allFacilities = getAllFacilities(assets, true);

    // ── Production facilities ──────────────────────────────────────────────
    for (const f of allFacilities) {
        if (f.type !== 'production') {
            continue;
        }
        const need = f.needs.find((n) => n.resource.name === resourceName);
        if (need) {
            const rate = need.quantity * f.scale;
            if (rate > 0) {
                breakdown.push({ sourceType: 'production', sourceName: f.name, ratePerTick: rate });
            }
        }
    }

    // ── Management facilities (their needs) ───────────────────────────────
    for (const f of allFacilities) {
        if (f.type !== 'management') {
            continue;
        }
        const need = f.needs.find((n) => n.resource.name === resourceName);
        if (need) {
            const rate = need.quantity * f.scale;
            if (rate > 0) {
                breakdown.push({ sourceType: 'management', sourceName: f.name, ratePerTick: rate });
            }
        }
    }

    // ── Ship construction facilities ───────────────────────────────────────
    for (const f of allFacilities) {
        if (f.type !== 'ship_construction') {
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
        for (const f of allFacilities) {
            if (isConstructionActive(f)) {
                const rate = f.construction!.maximumConstructionServiceConsumption;
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

    // ── Maintenance services (any operational facility) ────────────────────
    if (isMaintenanceService) {
        for (const f of allFacilities) {
            if (!isFacilityOperating(f)) {
                continue;
            }
            const rate = facilityMaintenanceConsumptionPerTick(f);
            if (rate > 0) {
                breakdown.push({ sourceType: 'maintenance', sourceName: f.name, ratePerTick: rate });
            }
        }
    }

    if (isConstructionService) {
        for (const f of allFacilities) {
            if (!isFacilityOperating(f) || f.maxMaintenance >= 1) {
                continue;
            }
            const rate = facilityRestorationCapacityPerTick(f);
            if (rate > 0) {
                breakdown.push({ sourceType: 'restoration', sourceName: f.name, ratePerTick: rate });
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
    assets: AgentPlanetAssets,
    ships: ConsumptionShipInfo[],
    planetId: string,
): Map<string, ResourceQuantity> {
    const rates = new Map<string, ResourceQuantity>();

    const add = (resource: Resource, rate: number) => {
        const existing = rates.get(resource.name);
        if (existing) {
            existing.quantity += rate;
        } else {
            rates.set(resource.name, { resource, quantity: rate });
        }
    };

    const allFacilities = getAllFacilities(assets);

    // ── Production + management facility needs ─────────────────────────────
    for (const f of allFacilities) {
        if (f.type === 'ship_construction') {
            continue;
        }
        for (const need of f.needs) {
            if (need.resource.form === 'landBoundResource') {
                continue;
            }
            add(need.resource, need.quantity * f.scale);
        }
    }

    // ── Ship construction facilities ───────────────────────────────────────
    for (const f of allFacilities) {
        if (f.type !== 'ship_construction') {
            continue;
        }
        if (f.construction !== null) {
            continue;
        }
        if (!f.produces) {
            continue;
        }
        const ratePerTick = Math.min(1, Math.sqrt(f.scale) / f.produces.buildingTime);
        for (const cost of f.produces.buildingCost) {
            add(cost.resource, cost.quantity * ratePerTick);
        }
    }

    // ── Construction services (any facility with active construction) ──────
    for (const f of allFacilities) {
        if (isConstructionActive(f)) {
            add(constructionServiceResourceType, f.construction!.maximumConstructionServiceConsumption);
        }
    }

    // ── Maintenance services (any operational facility) ────────────────────
    for (const f of allFacilities) {
        if (isFacilityOperating(f)) {
            add(maintenanceServiceResourceType, facilityMaintenanceConsumptionPerTick(f));
        }
    }

    for (const f of allFacilities) {
        if (isFacilityOperating(f) && f.maxMaintenance < 1) {
            add(constructionServiceResourceType, facilityRestorationCapacityPerTick(f));
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
            add(constructionServiceResourceType, bld.construction.maximumConstructionServiceConsumption);
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
            add(goal.resource, remaining);
        }
    }

    return rates;
}
