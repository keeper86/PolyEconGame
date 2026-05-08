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
import { updateShipEma } from '../ships/shipMarket';

const ALL_TRANSPORT_TYPES: readonly TransportShipType[] = Object.values(shiptypes)
    .filter((cat) => cat !== shiptypes.passenger)
    .flatMap((cat) => Object.values(cat)) as TransportShipType[];

/**
 * Estimates the raw material cost to build a given ship type on a planet.
 * Returns 0 if no prices are available.
 */
function estimateShipCost(shipType: TransportShipType, planet: { marketPrices: Record<string, number> }): number {
    let total = 0;
    for (const { resource, quantity } of shipType.buildingCost) {
        const price = planet.marketPrices[resource.name];
        if (!price) {
            return 0;
        } // insufficient price data
        total += price * quantity;
    }
    return total;
}

/**
 * Returns an asking price for a ship based on EMA market price or cost estimate.
 */
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

/** Lists a completed idle ship if it is not already listed. */
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
        assets.shipListings.push(listing);

        // Record price signal even before a trade occurs
        updateShipEma(gameState.shipCapitalMarket, ship.type.name, askPrice);
    }
}

/** Posts input buy bids when a construction facility is actively building. */
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
        } // services can't be pre-stocked
        const targetQty = Math.ceil(SHIPBUILDER_INPUT_BUFFER_TICKS * (quantity / buildTime));
        const bidPrice = (planet.marketPrices[resource.name] ?? 0) * 1.05; // bid slightly above market
        assets.market.buy[resource.name] = {
            resource,
            bidPrice,
            bidStorageTarget: targetQty,
        };
    }
}

/**
 * Monthly build decision for one facility.
 * Priority 1 — accept the highest open buy offer that exceeds cost threshold.
 * Priority 2 — speculative build if EMA price is strong and no idle ship is listed.
 */
function decideBuild(agent: Agent, facility: ShipConstructionFacility, planetId: string, gameState: GameState): void {
    if (facility.produces !== null) {
        return;
    } // already building

    const planet = gameState.planets.get(planetId);
    if (!planet) {
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        return;
    }

    // -- Priority 1: fill an existing buy offer ---------------------------------
    let bestOfferShipType: TransportShipType | null = null;
    let bestOfferPrice = 0;

    for (const otherAgent of gameState.agents.values()) {
        for (const otherAssets of Object.values(otherAgent.assets)) {
            for (const offer of otherAssets.shipBuyingOffers) {
                if (offer.status !== 'open') {
                    continue;
                }
                // resolve the key to a ship type
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

    // -- Priority 2: speculative build based on EMA price signal ----------------
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

        // Don't speculatively build if we already have an idle ship of this type listed
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

/** Resolves a ShipTypeKey string to its TransportShipType, or null. */
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

        // Every tick: auto-list any idle owned ships
        autoListIdleShips(agent, gameState);

        // Every tick: maintain input buy bids while building
        updateInputBids(agent, facility, planetId, gameState);

        // Monthly: decide whether to start a new build
        if (monthly) {
            decideBuild(agent, facility, planetId, gameState);
        }
    }
}
