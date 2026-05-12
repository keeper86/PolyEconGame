import {
    ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD,
    ARBITRAGE_LOAD_UNLOAD_OVERHEAD_TICKS,
    ARBITRAGE_MIN_CAPITAL_RESERVE,
    ARBITRAGE_MIN_PROFIT_MARGIN,
    ARBITRAGE_SHIP_ESTIMATED_LIFETIME_TICKS,
    isFirstTickInMonth,
} from '../constants';
import type { Agent, GameState } from '../planet/planet';
import { ALL_RESOURCES, RESOURCES_BY_NAME } from '../planet/resourceCatalog';
import { travelTime } from '../ships/shipHandlers';
import { createShipListing, effectiveShipValue, executeShipPurchase, findCheapestShipListing, updateShipEma } from '../ships/shipMarket';
import type { ShipListing, TransportShip } from '../ships/ships';
import { canCarryResource, shiptypes } from '../ships/ships';
import { getCurrencyResourceName } from '../market/currencyResources';

const EXPAND_FLEET_SHIP_TYPE = shiptypes.solid.bulkCarrier1;

// ---------------------------------------------------------------------------
// Route scanner
// ---------------------------------------------------------------------------

type RouteCandidate = {
    originPlanetId: string;
    destPlanetId: string;
    resourceName: string;
    quantity: number;
    netMargin: number;
};

function scanBestRoute(
    ship: TransportShip,
    agent: Agent,
    gameState: GameState,
    shipPlanetId: string,
): RouteCandidate | null {
    const planets = Array.from(gameState.planets.values());
    let best: RouteCandidate | null = null;
    let bestNet = ARBITRAGE_MIN_PROFIT_MARGIN;

    const oneWayTicks = travelTime(ship);
    const roundTripTicks = oneWayTicks * 2 + ARBITRAGE_LOAD_UNLOAD_OVERHEAD_TICKS;
    const depreciationPerTrip =
        (effectiveShipValue(ship, gameState) / ARBITRAGE_SHIP_ESTIMATED_LIFETIME_TICKS) * roundTripTicks;

    for (const resource of ALL_RESOURCES) {
        if (!canCarryResource(ship, resource)) {
            continue;
        }

        const { cargoSpecification } = ship.type;
        const maxByVolume = cargoSpecification.volume / resource.volumePerQuantity;
        const maxByMass = cargoSpecification.mass / resource.massPerQuantity;
        const maxQty = Math.floor(Math.min(maxByVolume, maxByMass));
        if (maxQty < 1) {
            continue;
        }

        // Only consider routes that start from the ship's current planet
        for (const origin of planets.filter((p) => p.id === shipPlanetId)) {
            const pBuy = origin.marketPrices[resource.name];
            if (!pBuy || pBuy <= 0) {
                continue;
            }

            // Check agent has deposits to fund the purchase
            const agentOriginDeposits = agent.assets[origin.id]?.deposits ?? 0;
            const requiredCapital = pBuy * maxQty;
            if (agentOriginDeposits < requiredCapital) {
                continue;
            }

            const costPerUnit = depreciationPerTrip / maxQty;

            for (const dest of planets) {
                if (dest.id === origin.id) {
                    continue;
                }

                const pSellDest = dest.marketPrices[resource.name];
                if (!pSellDest || pSellDest <= 0) {
                    continue;
                }

                // Convert destination price to origin currency
                const currencyName = getCurrencyResourceName(dest.id);
                const forexRate = origin.marketPrices[currencyName] ?? 1.0;
                const pSellOrigin = pSellDest * forexRate;

                const net = (pSellOrigin - pBuy - costPerUnit) / pBuy;
                if (net > bestNet) {
                    bestNet = net;
                    best = {
                        originPlanetId: origin.id,
                        destPlanetId: dest.id,
                        resourceName: resource.name,
                        quantity: maxQty,
                        netMargin: net,
                    };
                }
            }
        }
    }

    return best;
}

// ---------------------------------------------------------------------------
// Assign routes to idle ships (every tick)
// ---------------------------------------------------------------------------

function assignRoutesToIdleShips(agent: Agent, gameState: GameState): void {
    for (const ship of agent.ships) {
        if (ship.type.type !== 'transport') {
            continue;
        }
        if (ship.state.type !== 'idle') {
            continue;
        }

        const shipPlanetId = (ship.state as { planetId: string }).planetId;
        const candidate = scanBestRoute(ship as TransportShip, agent, gameState, shipPlanetId);
        if (!candidate) {
            continue;
        }

        const resource = RESOURCES_BY_NAME.get(candidate.resourceName);
        if (!resource) {
            continue;
        }

        // Set ship directly to loading — automaticPricing will create the buy bid,
        // and the shipHandlers loading state will pull from storage once goods arrive.
        (ship as TransportShip).state = {
            type: 'loading',
            planetId: candidate.originPlanetId,
            to: candidate.destPlanetId,
            cargoGoal: { resource, quantity: candidate.quantity },
            currentCargo: { resource, quantity: 0 },
        };
    }
}

// ---------------------------------------------------------------------------
// Post sell offers for goods in storage (every tick)
// ---------------------------------------------------------------------------

function postSellOffers(agent: Agent, gameState: GameState): void {
    // Collect resources actively being loaded per planet — we don't want to sell those
    const loadingByPlanet = new Map<string, Set<string>>();
    for (const ship of agent.ships) {
        if (ship.type.type !== 'transport' || ship.state.type !== 'loading') {
            continue;
        }
        const s = ship.state as { planetId: string; cargoGoal: { resource: { name: string } } | null };
        if (!s.cargoGoal) {
            continue;
        }
        const set = loadingByPlanet.get(s.planetId) ?? new Set<string>();
        set.add(s.cargoGoal.resource.name);
        loadingByPlanet.set(s.planetId, set);
    }

    for (const [planetId, assets] of Object.entries(agent.assets)) {
        if (!assets.market) {
            continue;
        }
        const planet = gameState.planets.get(planetId);
        if (!planet) {
            continue;
        }

        const loadingResources = loadingByPlanet.get(planetId) ?? new Set<string>();

        for (const [resourceName, entry] of Object.entries(assets.storageFacility.currentInStorage)) {
            if (loadingResources.has(resourceName) || entry.quantity <= 0) {
                continue;
            }

            const marketPrice = planet.marketPrices[resourceName];
            if (!marketPrice || marketPrice <= 0) {
                continue;
            }

            const offerPrice = marketPrice * 1.05;
            const existing = assets.market.sell[resourceName];
            if (!existing) {
                assets.market.sell[resourceName] = {
                    resource: entry.resource,
                    offerPrice,
                    offerRetainment: 0,
                    automated: true,
                };
            } else if (existing.automated) {
                existing.offerPrice = offerPrice;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Fleet management (monthly)
// ---------------------------------------------------------------------------

function manageFleet(agent: Agent, gameState: GameState): void {
    const homeId = agent.associatedPlanetId;
    const homeAssets = agent.assets[homeId];
    if (!homeAssets) {
        return;
    }

    const emaPrice = gameState.shipCapitalMarket.emaPrice[EXPAND_FLEET_SHIP_TYPE.name] ?? 0;

    // Expand fleet if deposits allow
    if (emaPrice > 0 && homeAssets.deposits > ARBITRAGE_MIN_CAPITAL_RESERVE + emaPrice) {
        const maxBuyPrice = emaPrice * 1.1;
        const result = findCheapestShipListing(gameState, EXPAND_FLEET_SHIP_TYPE.name, maxBuyPrice);
        if (result) {
            executeShipPurchase(gameState, result.listing, result.sellerAgent, agent, homeId);
        }
    }

    // Trim persistently idle ships
    for (const ship of agent.ships) {
        if (ship.state.type !== 'idle') {
            continue;
        }
        if (ship.type.type !== 'transport') {
            continue;
        }

        const idleSince = gameState.tick - (ship.idleAtTick ?? ship.builtAtTick);
        if (idleSince < ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD) {
            continue;
        }

        const currentValue = effectiveShipValue(ship, gameState);
        if (emaPrice <= currentValue) {
            continue;
        }

        const planetId = ship.state.planetId;
        const assets = agent.assets[planetId];
        if (!assets) {
            continue;
        }
        if (assets.shipListings.some((l) => l.shipId === ship.id)) {
            continue;
        }

        const listing: ShipListing = {
            id: crypto.randomUUID(),
            sellerAgentId: agent.id,
            shipId: ship.id,
            shipName: ship.name,
            shipTypeName: ship.type.name,
            askPrice: Math.round(emaPrice),
            planetId,
            postedAtTick: gameState.tick,
        };
        createShipListing(ship, assets, listing);
        updateShipEma(gameState.shipCapitalMarket, ship.type.name, listing.askPrice);
    }
}

// ---------------------------------------------------------------------------
// Main tick
// ---------------------------------------------------------------------------

export function arbitrageTraderTick(gameState: GameState): void {
    const monthly = isFirstTickInMonth(gameState.tick);

    for (const agent of gameState.arbitrageTraders.values()) {
        assignRoutesToIdleShips(agent, gameState);
        postSellOffers(agent, gameState);

        if (monthly) {
            manageFleet(agent, gameState);
        }
    }
}
