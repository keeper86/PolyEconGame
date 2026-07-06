import { RECYCLER_BASE_RECOVERY_EFFICIENCY } from '../constants';
import type { Facility } from '../planet/facility';
import { calculateCostsForConstruction, getFacilityType } from '../planet/facility';
import type { Agent, AgentPlanetAssets } from '../planet/planet';
import type { ShipCapitalMarket } from '../ships/ships';

export function computeFacilitiesValue(assets: AgentPlanetAssets, csPrice: number): number {
    if (csPrice <= 0) {
        return 0;
    }

    const allFacilities: Facility[] = [
        ...assets.productionFacilities,
        ...assets.managementFacilities,
        ...assets.shipConstructionFacilities,
    ];

    let total = 0;
    for (const facility of allFacilities) {
        const type = getFacilityType(facility);
        const recoveredCS =
            calculateCostsForConstruction(type, 0, facility.maxScale) * RECYCLER_BASE_RECOVERY_EFFICIENCY;
        total += recoveredCS * csPrice;
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
