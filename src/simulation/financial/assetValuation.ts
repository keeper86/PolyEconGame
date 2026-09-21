import { CONSTRUCTION_VALUATION_PRICE_CAP, RECYCLER_BASE_RECOVERY_EFFICIENCY } from '../constants';
import type { Facility } from '../planet/facility';
import { calculateCostsForConstruction, getFacilityType, getWholeStorage } from '../planet/facility';
import type { Agent, AgentPlanetAssets, Planet } from '../planet/planet';
import { getAllFacilities } from '../planet/planet';
import { constructionServiceResourceType } from '../planet/services';
import type { ShipCapitalMarket } from '../ships/ships';

function facilityConditionFactor(facility: Facility): number {
    const maintenance = Math.max(0, Math.min(1, facility.maintenanceStatus));
    const restoration = Math.max(0, Math.min(1, facility.maxMaintenance));
    return maintenance * restoration;
}

export function computeFacilitiesValue(assets: AgentPlanetAssets, csPrice: number): number {
    if (csPrice <= 0) {
        return 0;
    }

    const allFacilities: Facility[] = getAllFacilities(assets);

    let total = 0;
    for (const facility of allFacilities) {
        const type = getFacilityType(facility);
        const conditionFactor = facilityConditionFactor(facility);

        // Value completed portion at maxScale
        const completedCS =
            calculateCostsForConstruction(type, 0, facility.maxScale).cost * RECYCLER_BASE_RECOVERY_EFFICIENCY;
        total += completedCS * csPrice * conditionFactor;

        // Add prorated value of in-construction portion
        if (facility.construction !== null) {
            const { constructionTargetMaxScale, totalConstructionServiceRequired, progress } = facility.construction;
            const incrCost = calculateCostsForConstruction(type, facility.maxScale, constructionTargetMaxScale).cost;
            const progressFraction =
                totalConstructionServiceRequired > 0 ? Math.min(progress / totalConstructionServiceRequired, 1) : 0;
            const partialCS = incrCost * 0.5 * progressFraction * progressFraction;
            total += partialCS * csPrice;
        }
    }

    return total;
}

export function computeShipsValue(
    agent: Agent,
    shipCapitalMarket: ShipCapitalMarket,
    marketPrices: Record<string, number>,
): number {
    let total = 0;

    for (const ship of agent.ships) {
        if (ship.state.type === 'derelict' || ship.state.type === 'lost') {
            continue;
        }

        const emaPrice = shipCapitalMarket.emaPrice[ship.type.name];
        if (emaPrice !== undefined && emaPrice > 0) {
            total += emaPrice;
        } else {
            // Fall back to construction cost
            const buildCost = ship.type.buildingCost.reduce((sum, rq) => {
                const price = marketPrices[rq.resource.name] ?? 0;
                return sum + price * rq.quantity;
            }, 0);
            total += buildCost;
        }
    }

    return total;
}

export function constructionValuationPrice(planet: Planet): number {
    const csMarketPrice = planet.marketPrices[constructionServiceResourceType.name] ?? 0;
    const costFloor = planet.lastProductionCostFloors[constructionServiceResourceType.name];
    if (costFloor === undefined || costFloor <= 0) {
        return csMarketPrice;
    }
    return Math.min(csMarketPrice, CONSTRUCTION_VALUATION_PRICE_CAP * costFloor);
}

export type AssetValueBreakdown = {
    facilitiesValue: number;
    shipsValue: number;
    storageValue: number;
    total: number;
};

export function computeAssetValueBreakdown(
    agent: Agent,
    assets: AgentPlanetAssets,
    planet: Planet | undefined,
    shipCapitalMarket: ShipCapitalMarket,
): AssetValueBreakdown {
    let storageValue = 0;
    for (const [, entry] of getWholeStorage(assets.storage)) {
        if (entry?.quantity) {
            const price = planet?.marketPrices[entry.resource.name] ?? 0;
            storageValue += entry.quantity * price;
        }
    }

    const facilitiesValue = computeFacilitiesValue(
        assets,
        planet?.marketPrices[constructionServiceResourceType.name] ?? 0,
    );
    const shipsValue = computeShipsValue(agent, shipCapitalMarket, planet?.marketPrices ?? {});

    return {
        facilitiesValue,
        shipsValue,
        storageValue,
        total: facilitiesValue + shipsValue + storageValue,
    };
}
