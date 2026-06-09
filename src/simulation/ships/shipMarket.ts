import {
    SHIP_MARKET_EMA_ALPHA,
    SHIP_MARKET_MAX_TRADE_HISTORY,
    MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE,
} from '../constants';
import type { Agent, GameState } from '../planet/planet';
import { maintenanceServiceResourceType } from '../planet/services';
import type { Ship, ShipBuyingOffer } from './ships';
import { shiptypes, scaleMapping, type ShipCapitalMarket, type ShipListing, type ShipTradeRecord } from './ships';

export function effectiveShipValue(ship: Ship, gameState?: GameState): number {
    const { scale, speed } = ship.type;
    const { maintainanceStatus, maxMaintenance } = ship;

    const qualityFactor = maxMaintenance > 0 ? maintainanceStatus / maxMaintenance : 0;

    const baseValue = scaleMapping[scale] * speed * qualityFactor * maxMaintenance;

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
                const remainingRepairCycles = maxMaintenance / MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE;
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

    const shipTypeKeyToName = Object.fromEntries(
        Object.values(shiptypes).flatMap((cat) => Object.entries(cat).map(([k, v]) => [k, v.name])),
    ) as Record<string, string>;

    for (const listing of allListings) {
        const ship = findShipById(gameState, listing.sellerAgentId, listing.shipId);
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

function findShipById(gameState: GameState, agentId: string, shipId: string): Ship | undefined {
    return gameState.agents.get(agentId)?.ships.find((s) => s.id === shipId);
}

export function findCheapestShipListing(
    gameState: GameState,
    shipTypeName: string,
    maxPrice: number,
): { listing: ShipListing; sellerAgent: Agent } | null {
    let best: { listing: ShipListing; sellerAgent: Agent } | null = null;

    for (const agent of gameState.agents.values()) {
        for (const assets of Object.values(agent.assets)) {
            for (const listing of assets.shipListings) {
                if (listing.shipTypeName !== shipTypeName) {
                    continue;
                }
                if (listing.askPrice > maxPrice) {
                    continue;
                }
                if (!best || listing.askPrice < best.listing.askPrice) {
                    best = { listing, sellerAgent: agent };
                }
            }
        }
    }

    return best;
}

export function createShipListing(ship: Ship, assets: { shipListings: ShipListing[] }, listing: ShipListing): void {
    ship.state = { type: 'listed', planetId: listing.planetId };
    assets.shipListings.push(listing);
}

export function executeShipPurchase(
    gameState: GameState,
    listing: ShipListing,
    sellerAgent: Agent,
    buyerAgent: Agent,
    buyerPlanetId: string,
): boolean {
    const buyerAssets = buyerAgent.assets[buyerPlanetId];
    if (!buyerAssets || buyerAssets.deposits < listing.askPrice) {
        return false;
    }

    const sellerAssets = sellerAgent.assets[listing.planetId];
    if (!sellerAssets) {
        return false;
    }

    const shipIdx = sellerAgent.ships.findIndex((s) => s.id === listing.shipId);
    if (shipIdx === -1) {
        return false;
    }

    const idx = sellerAssets.shipListings.findIndex((l) => l.id === listing.id);
    if (idx === -1) {
        return false;
    }
    sellerAssets.shipListings.splice(idx, 1);
    const [ship] = sellerAgent.ships.splice(shipIdx, 1);

    ship.state = { type: 'idle', planetId: listing.planetId };
    ship.idleAtTick = gameState.tick;
    buyerAgent.ships.push(ship);

    buyerAssets.deposits -= listing.askPrice;
    sellerAssets.deposits += listing.askPrice;

    updateShipEma(gameState.shipCapitalMarket, listing.shipTypeName, listing.askPrice);
    appendTradeRecord(gameState.shipCapitalMarket, {
        shipTypeName: listing.shipTypeName,
        price: listing.askPrice,
        tick: gameState.tick,
        maintainanceStatus: ship.maintainanceStatus,
        maxMaintenance: ship.maxMaintenance,
        effectiveValue: effectiveShipValue(ship, gameState),
    });

    return true;
}

export function updateShipEma(market: ShipCapitalMarket, shipTypeName: string, tradePrice: number): void {
    const prev = market.emaPrice[shipTypeName];
    if (prev === undefined) {
        market.emaPrice[shipTypeName] = tradePrice;
    } else {
        market.emaPrice[shipTypeName] = SHIP_MARKET_EMA_ALPHA * tradePrice + (1 - SHIP_MARKET_EMA_ALPHA) * prev;
    }
}

export function appendTradeRecord(market: ShipCapitalMarket, record: ShipTradeRecord): void {
    market.tradeHistory.push(record);

    if (market.tradeHistory.length > SHIP_MARKET_MAX_TRADE_HISTORY) {
        market.tradeHistory.splice(0, market.tradeHistory.length - SHIP_MARKET_MAX_TRADE_HISTORY);
    }
}
