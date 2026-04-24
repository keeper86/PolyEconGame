import {
    SHIP_MARKET_EMA_ALPHA,
    SHIP_MARKET_MAX_TRADE_HISTORY,
    MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE,
} from '../constants';
import type { GameState } from '../planet/planet';
import { maintenanceServiceResourceType } from '../planet/services';
import type { Ship, ShipBuyingOffer } from './ships';
import { shiptypes, scaleMapping, type ShipCapitalMarket, type ShipListing, type ShipTradeRecord } from './ships';

/**
 * Computes a heuristic effective value for a ship.
 *
 * Incorporates:
 * - scale (cargo capacity proxy)
 * - current maintainanceStatus (operational quality)
 * - maxMaintenance (remaining life ceiling)
 * - speed (operational performance)
 * - future maintenance cost: estimated remaining repair cost to fill the ship's
 *   remaining life, discounted using the maintenance service price on the ship's
 *   current planet (if available via gameState).
 *
 * This value is informational only — it does not affect settlement logic.
 *
 * @param ship - The ship to evaluate.
 * @param gameState - Optional game state for market price lookup.
 * @returns A non-negative heuristic value.
 */
export function effectiveShipValue(ship: Ship, gameState?: GameState): number {
    const { scale, speed } = ship.type;
    const { maintainanceStatus, maxMaintenance } = ship;

    // Operational quality factor: how well the ship performs right now relative to its ceiling
    const qualityFactor = maxMaintenance > 0 ? maintainanceStatus / maxMaintenance : 0;

    // Base heuristic: scale × speed × quality × remaining life ceiling
    const baseValue = scaleMapping[scale] * speed * qualityFactor * maxMaintenance;

    // Maintenance cost discount: estimate cost to keep ship at maintainanceStatus for its
    // remaining life. Uses the maintenance service price on the planet where the ship sits.
    let maintenanceCostPenalty = 0;
    if (gameState) {
        const planetId =
            ship.state.type === 'idle' || ship.state.type === 'listed' || ship.state.type === 'derelict'
                ? ship.state.planetId
                : ship.state.type === 'unloading' || ship.state.type === 'loading'
                  ? ship.state.planetId
                  : null;

        if (planetId) {
            const maintenancePrice =
                gameState.planets.get(planetId)?.marketPrices[maintenanceServiceResourceType.name] ?? 0;
            if (maintenancePrice > 0) {
                // Remaining repair cycles ≈ maxMaintenance / MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE
                // Cost per cycle ≈ maintenancePrice * 1 (one full unit of maintenance per cycle)
                // We use a simple linear discount: penalty = cost × remaining life fraction
                const remainingRepairCycles = maxMaintenance / MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE; // inverse of degradation constant
                maintenanceCostPenalty = maintenancePrice * remainingRepairCycles * maxMaintenance * 0.5;
            }
        }
    }

    return Math.max(0, baseValue - maintenanceCostPenalty);
}

export type CompatibleTrade = {
    listing: ShipListing & { sellerAgentId: string };
    offer: ShipBuyingOffer & { buyerAgentId: string; _offerPlanetId: string; _buyerAssetsPlanetId: string };
    surplus: number;
    effectiveValue: number;
};

/**
 * Pure discovery function — finds all compatible (listing, buy-offer) pairs.
 *
 * Compatibility criteria:
 * - offer.shipType matches listing.shipTypeName
 * - offer.price >= listing.askPrice
 * - offer.status === 'open'
 *
 * Results are sorted by surplus (offer.price - listing.askPrice) descending.
 * No trades are executed.
 */
export function findCompatibleTrades(gameState: GameState): CompatibleTrade[] {
    const allListings: (ShipListing & { sellerAgentId: string })[] = [];
    const allOffers: (ShipBuyingOffer & {
        buyerAgentId: string;
        _offerPlanetId: string;
        _buyerAssetsPlanetId: string;
    })[] = [];

    for (const agent of gameState.agents.values()) {
        for (const [planetId, assets] of Object.entries(agent.assets)) {
            for (const listing of assets.shipListings) {
                allListings.push({ ...listing, sellerAgentId: agent.id });
            }
            for (const offer of assets.shipBuyingOffers) {
                if (offer.status === 'open') {
                    allOffers.push({
                        ...offer,
                        buyerAgentId: offer.buyerAgentId,
                        _offerPlanetId: planetId,
                        _buyerAssetsPlanetId: planetId,
                    });
                }
            }
        }
    }

    const results: CompatibleTrade[] = [];

    // Build a lookup from ShipTypeKey -> display name for offer.shipType comparison
    const shipTypeKeyToName = Object.fromEntries(
        Object.values(shiptypes).flatMap((cat) => Object.entries(cat).map(([k, v]) => [k, v.name])),
    ) as Record<string, string>;

    for (const listing of allListings) {
        const ship = findShip(gameState, listing.sellerAgentId, listing.shipName);
        const ev = ship ? effectiveShipValue(ship, gameState) : 0;

        for (const offer of allOffers) {
            if (shipTypeKeyToName[offer.shipType] !== listing.shipTypeName) {
                continue;
            }
            if (offer.price < listing.askPrice) {
                continue;
            }

            results.push({
                listing,
                offer,
                surplus: offer.price - listing.askPrice,
                effectiveValue: ev,
            });
        }
    }

    results.sort((a, b) => b.surplus - a.surplus);
    return results;
}

function findShip(gameState: GameState, agentId: string, shipName: string): Ship | undefined {
    return gameState.agents.get(agentId)?.ships.find((s) => s.name === shipName);
}

/**
 * Updates the EMA price for a ship type after a completed trade.
 * Initialises from the trade price on first trade.
 */
export function updateShipEma(market: ShipCapitalMarket, shipTypeName: string, tradePrice: number): void {
    const prev = market.emaPrice[shipTypeName];
    if (prev === undefined) {
        market.emaPrice[shipTypeName] = tradePrice;
    } else {
        market.emaPrice[shipTypeName] = SHIP_MARKET_EMA_ALPHA * tradePrice + (1 - SHIP_MARKET_EMA_ALPHA) * prev;
    }
}

/**
 * Appends a trade record to the global market history for a ship type.
 * Caps history at SHIP_MARKET_MAX_TRADE_HISTORY per type.
 */
export function appendTradeRecord(market: ShipCapitalMarket, record: ShipTradeRecord): void {
    market.tradeHistory.push(record);
    // Trim to cap: keep the most recent records
    if (market.tradeHistory.length > SHIP_MARKET_MAX_TRADE_HISTORY) {
        market.tradeHistory.splice(0, market.tradeHistory.length - SHIP_MARKET_MAX_TRADE_HISTORY);
    }
}
