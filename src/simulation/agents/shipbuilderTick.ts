import {
    SHIPBUILDER_INPUT_BUFFER_TICKS,
    SHIPBUILDER_LISTING_MARKUP,
    SHIPBUILDER_PROFIT_THRESHOLD,
    SHIPBUILDER_SPECULATIVE_THRESHOLD,
    isFirstTickInMonth,
} from '../constants';
import type { Agent, GameState } from '../planet/planet';
import type { ShipConstructionFacility } from '../planet/facility';
import type { TransportShipType } from '../ships/ships';
import { shiptypes } from '../ships/ships';
import type { ShipListing } from '../ships/ships';
import { createShipListing, updateShipEma } from '../ships/shipMarket';

const ALL_TRANSPORT_TYPES: readonly TransportShipType[] = Object.values(shiptypes)
    .filter((cat) => cat !== shiptypes.passenger)
    .flatMap((cat) => Object.values(cat)) as TransportShipType[];

function estimateShipCost(shipType: TransportShipType, planet: { marketPrices: Record<string, number> }): number {
    let total = 0;
    for (const { resource, quantity } of shipType.buildingCost) {
        const price = planet.marketPrices[resource.name];
        if (!price) {
            return 0;
        }
        total += price * quantity;
    }
    return total;
}

function computeAskPrice(
    shipType: TransportShipType,
    planet: { marketPrices: Record<string, number> },
    shipCapitalMarket: { emaPrice: Record<string, number> },
): number {
    const ema = shipCapitalMarket.emaPrice[shipType.name];
    if (ema && ema > 0) {
        return Math.round(ema * (1 + SHIPBUILDER_LISTING_MARKUP));
    }
    const cost = estimateShipCost(shipType, planet);
    return cost > 0 ? Math.round(cost * (1 + SHIPBUILDER_LISTING_MARKUP)) : 100_000;
}

function autoListIdleShips(agent: Agent, gameState: GameState): void {
    for (const ship of agent.ships) {
        if (ship.state.type !== 'idle') {
            continue;
        }
        const { planetId } = ship.state;
        const assets = agent.assets[planetId];
        if (!assets) {
            continue;
        }
        if (assets.shipListings.some((l) => l.shipId === ship.id)) {
            continue;
        }
        if (ship.type.type !== 'transport') {
            continue;
        }

        const planet = gameState.planets.get(planetId);
        if (!planet) {
            continue;
        }

        const askPrice = computeAskPrice(ship.type, planet, gameState.shipCapitalMarket);
        const listing: ShipListing = {
            id: crypto.randomUUID(),
            sellerAgentId: agent.id,
            shipId: ship.id,
            shipName: ship.name,
            shipTypeName: ship.type.name,
            askPrice,
            planetId,
            postedAtTick: gameState.tick,
        };
        createShipListing(ship, assets, listing);

        updateShipEma(gameState.shipCapitalMarket, ship.type.name, askPrice);
    }
}

function updateInputBids(
    agent: Agent,
    facility: ShipConstructionFacility,
    planetId: string,
    gameState: GameState,
): void {
    if (!facility.produces) {
        return;
    }
    const planet = gameState.planets.get(planetId);
    if (!planet) {
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets?.market) {
        return;
    }

    const buildTime = facility.produces.buildingTime;
    for (const { resource, quantity } of facility.produces.buildingCost) {
        if (resource.form === 'services') {
            continue;
        }
        const targetQty = Math.ceil(SHIPBUILDER_INPUT_BUFFER_TICKS * (quantity / buildTime));
        const bidPrice = (planet.marketPrices[resource.name] ?? 0) * 1.05;
        assets.market.buy[resource.name] = {
            resource,
            bidPrice,
            bidStorageTarget: targetQty,
        };
    }
}

function decideBuild(agent: Agent, facility: ShipConstructionFacility, planetId: string, gameState: GameState): void {
    if (facility.produces !== null) {
        return;
    }

    const planet = gameState.planets.get(planetId);
    if (!planet) {
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        return;
    }

    let bestOfferShipType: TransportShipType | null = null;
    let bestOfferPrice = 0;

    for (const otherAgent of gameState.agents.values()) {
        for (const otherAssets of Object.values(otherAgent.assets)) {
            for (const offer of otherAssets.shipBuyingOffers) {
                if (offer.status !== 'open') {
                    continue;
                }

                const resolved = resolveShipTypeByKey(offer.shipType);
                if (!resolved || resolved.type !== 'transport') {
                    continue;
                }
                const cost = estimateShipCost(resolved, planet);
                if (cost <= 0) {
                    continue;
                }
                if (offer.price > cost * SHIPBUILDER_PROFIT_THRESHOLD && offer.price > bestOfferPrice) {
                    bestOfferPrice = offer.price;
                    bestOfferShipType = resolved;
                }
            }
        }
    }

    if (bestOfferShipType) {
        startConstruction(facility, bestOfferShipType, planet.name);
        return;
    }

    let bestSpecType: TransportShipType | null = null;
    let bestSpecMargin = 0;

    for (const shipType of ALL_TRANSPORT_TYPES) {
        const ema = gameState.shipCapitalMarket.emaPrice[shipType.name];
        if (!ema) {
            continue;
        }
        const cost = estimateShipCost(shipType, planet);
        if (cost <= 0) {
            continue;
        }
        const margin = ema / cost;
        if (margin < SHIPBUILDER_SPECULATIVE_THRESHOLD) {
            continue;
        }

        const alreadyListed = assets.shipListings.some((l) => l.shipTypeName === shipType.name);
        if (alreadyListed) {
            continue;
        }

        if (margin > bestSpecMargin) {
            bestSpecMargin = margin;
            bestSpecType = shipType;
        }
    }

    if (bestSpecType) {
        startConstruction(facility, bestSpecType, planet.name);
    }
}

function startConstruction(facility: ShipConstructionFacility, shipType: TransportShipType, planetName: string): void {
    facility.produces = shipType;
    facility.shipName = `${shipType.name} (${planetName})`;
    facility.progress = 0;
}

function resolveShipTypeByKey(key: string): TransportShipType | null {
    for (const category of Object.values(shiptypes)) {
        for (const [k, v] of Object.entries(category)) {
            if (k === key && v.type === 'transport') {
                return v as TransportShipType;
            }
        }
    }
    return null;
}

export function shipbuilderTick(gameState: GameState): void {
    const monthly = isFirstTickInMonth(gameState.tick);

    for (const agent of gameState.shipbuilderAgents.values()) {
        const planetId = agent.associatedPlanetId;
        const assets = agent.assets[planetId];
        if (!assets) {
            continue;
        }

        const facility = assets.shipConstructionFacilities[0];
        if (!facility) {
            continue;
        }

        autoListIdleShips(agent, gameState);

        updateInputBids(agent, facility, planetId, gameState);

        if (monthly) {
            decideBuild(agent, facility, planetId, gameState);
        }
    }
}
