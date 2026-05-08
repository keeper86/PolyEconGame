import {
    ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD,
    ARBITRAGE_LOAD_UNLOAD_OVERHEAD_TICKS,
    ARBITRAGE_MIN_CAPITAL_RESERVE,
    ARBITRAGE_MIN_PROFIT_MARGIN,
    ARBITRAGE_SHIP_ESTIMATED_LIFETIME_TICKS,
    isFirstTickInMonth,
} from '../constants';
import type { Agent, GameState, PendingArbitrageRoute } from '../planet/planet';
import { ALL_RESOURCES, RESOURCES_BY_NAME } from '../planet/resourceCatalog';
import { travelTime } from '../ships/shipHandlers';
import { effectiveShipValue, executeShipPurchase, findCheapestShipListing, updateShipEma } from '../ships/shipMarket';
import type { ShipListing, TransportShip } from '../ships/ships';
import { canCarryResource, shiptypes } from '../ships/ships';
import { getCurrencyResourceName } from '../market/currencyResources';

const EXPAND_FLEET_SHIP_TYPE = shiptypes.solid.bulkCarrier1;

// ---------------------------------------------------------------------------
// Phase tracking (runs every tick)
// ---------------------------------------------------------------------------

function advanceRoutePhases(agent: Agent, gameState: GameState): void {
    if (!agent.pendingArbitrageRoutes) {
        return;
    }

    for (const [shipId, route] of agent.pendingArbitrageRoutes) {
        const ship = agent.ships.find((s) => s.id === shipId) as TransportShip | undefined;
        if (!ship) {
            // Ship no longer exists — clean up
            agent.pendingArbitrageRoutes.delete(shipId);
            continue;
        }

        const originAssets = agent.assets[route.originPlanetId];
        const destAssets = agent.assets[route.destPlanetId];

        if (route.phase === 'buying') {
            // Refresh the buy bid each tick
            if (originAssets?.market) {
                const resource = RESOURCES_BY_NAME.get(route.resourceName);
                if (resource) {
                    originAssets.market.buy[route.resourceName] = {
                        resource,
                        bidPrice: route.bidPricePerUnit,
                        bidStorageTarget: route.quantity,
                    };
                }
            }

            // Check if enough goods are in storage and ship is idle at origin
            const storage = originAssets?.storageFacility;
            const available = storage?.currentInStorage[route.resourceName]?.quantity ?? 0;

            if (
                available >= route.quantity &&
                ship.state.type === 'idle' &&
                ship.state.planetId === route.originPlanetId
            ) {
                const resource = RESOURCES_BY_NAME.get(route.resourceName);
                if (resource) {
                    // Clear the buy bid — goods are in storage, ready to load
                    if (originAssets?.market) {
                        delete originAssets.market.buy[route.resourceName];
                    }
                    // Initiate loading: the shipHandlers will pull from agent's own storage
                    (ship as TransportShip).state = {
                        type: 'loading',
                        planetId: route.originPlanetId,
                        to: route.destPlanetId,
                        cargoGoal: { resource, quantity: route.quantity },
                        currentCargo: { resource, quantity: 0 },
                        // No deadlineTick — loading will keep retrying without a timeout
                    };
                    route.phase = 'loading';
                }
            }
            continue;
        }

        if (route.phase === 'loading') {
            if (ship.state.type === 'transporting') {
                route.phase = 'in_transit';
            } else if (ship.state.type === 'idle') {
                // Loading aborted (e.g. empty storage)
                agent.pendingArbitrageRoutes.delete(shipId);
            }
            continue;
        }

        if (route.phase === 'in_transit') {
            if (
                ship.state.type === 'unloading' ||
                (ship.state.type === 'idle' && 'planetId' in ship.state && ship.state.planetId === route.destPlanetId)
            ) {
                route.phase = 'unloading';
            }
            continue;
        }

        if (route.phase === 'unloading') {
            if (ship.state.type === 'idle' && 'planetId' in ship.state && ship.state.planetId === route.destPlanetId) {
                // Post sell offer at destination
                const resource = RESOURCES_BY_NAME.get(route.resourceName);
                const destPlanet = gameState.planets.get(route.destPlanetId);
                if (resource && destAssets?.market && destPlanet) {
                    const sellPrice = (destPlanet.marketPrices[route.resourceName] ?? route.bidPricePerUnit) * 1.05;
                    destAssets.market.sell[route.resourceName] = {
                        resource,
                        offerPrice: sellPrice,
                        offerRetainment: 0,
                    };
                }
                agent.pendingArbitrageRoutes.delete(shipId);
            }
            continue;
        }
    }
}

// ---------------------------------------------------------------------------
// Route scanner (runs monthly for idle ships)
// ---------------------------------------------------------------------------

type RouteCandidate = {
    originPlanetId: string;
    destPlanetId: string;
    resourceName: string;
    quantity: number;
    bidPricePerUnit: number;
    netMargin: number;
};

function scanBestRoute(ship: TransportShip, agent: Agent, gameState: GameState): RouteCandidate | null {
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

        for (const origin of planets) {
            const pBuy = origin.marketPrices[resource.name];
            if (!pBuy || pBuy <= 0) {
                continue;
            }

            // Check buyer has deposits to fund the purchase
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
                        bidPricePerUnit: pBuy * 1.02, // bid slightly above market
                        netMargin: net,
                    };
                }
            }
        }
    }

    return best;
}

function assignRoutesToIdleShips(agent: Agent, gameState: GameState): void {
    if (!agent.pendingArbitrageRoutes) {
        return;
    }
    const routedShipIds = new Set(agent.pendingArbitrageRoutes.keys());

    for (const ship of agent.ships) {
        if (ship.type.type !== 'transport') {
            continue;
        }
        if (ship.state.type !== 'idle') {
            continue;
        }
        if (routedShipIds.has(ship.id)) {
            continue;
        }

        const candidate = scanBestRoute(ship as TransportShip, agent, gameState);
        if (!candidate) {
            continue;
        }

        const route: PendingArbitrageRoute = {
            shipId: ship.id,
            originPlanetId: candidate.originPlanetId,
            destPlanetId: candidate.destPlanetId,
            resourceName: candidate.resourceName,
            quantity: candidate.quantity,
            bidPricePerUnit: candidate.bidPricePerUnit,
            phase: 'buying',
        };
        agent.pendingArbitrageRoutes.set(ship.id, route);

        // Post initial buy bid
        const originAssets = agent.assets[candidate.originPlanetId];
        const resource = RESOURCES_BY_NAME.get(candidate.resourceName);
        if (originAssets?.market && resource) {
            originAssets.market.buy[candidate.resourceName] = {
                resource,
                bidPrice: candidate.bidPricePerUnit,
                bidStorageTarget: candidate.quantity,
            };
        }
    }
}

// ---------------------------------------------------------------------------
// Fleet management (runs monthly)
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
    if (!agent.pendingArbitrageRoutes) {
        return;
    }
    const routedShipIds = new Set(agent.pendingArbitrageRoutes.keys());

    for (const ship of agent.ships) {
        if (ship.state.type !== 'idle') {
            continue;
        }
        if (routedShipIds.has(ship.id)) {
            continue;
        }
        if (ship.type.type !== 'transport') {
            continue;
        }

        const idleSince = gameState.tick - ship.builtAtTick;
        if (idleSince < ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD) {
            continue;
        }

        const currentValue = effectiveShipValue(ship, gameState);
        if (emaPrice <= currentValue) {
            continue;
        }

        // Already listed?
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
        assets.shipListings.push(listing);
        updateShipEma(gameState.shipCapitalMarket, ship.type.name, listing.askPrice);
    }
}

// ---------------------------------------------------------------------------
// Main tick
// ---------------------------------------------------------------------------

export function arbitrageTraderTick(gameState: GameState): void {
    const monthly = isFirstTickInMonth(gameState.tick);

    for (const agent of gameState.arbitrageTraders.values()) {
        // Every tick: advance route phases
        advanceRoutePhases(agent, gameState);

        if (monthly) {
            // Assign routes to newly idle ships
            assignRoutesToIdleShips(agent, gameState);
            // Manage fleet size
            manageFleet(agent, gameState);
        }
    }
}
