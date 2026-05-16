import {
    ARBITRAGE_FOREX_THIN_BOOK_HAIRCUT,
    ARBITRAGE_LOAD_UNLOAD_OVERHEAD_TICKS,
    ARBITRAGE_MIN_PROFIT_PER_TICK,
    ARBITRAGE_SHIP_ESTIMATED_LIFETIME_TICKS,
    isFirstTickInMonth,
    MAX_DISPATCH_TIMEOUT_TICKS,
} from '../constants';
import { getCurrencyResourceName } from '../market/currencyResources';
import type { Agent, GameState } from '../planet/planet';
import { ALL_RESOURCES, RESOURCES_BY_NAME } from '../planet/resourceCatalog';
import { travelTime } from '../ships/shipHandlers';
import { effectiveShipValue } from '../ships/shipMarket';
import type { TransportShip } from '../ships/ships';
import { canCarryResource } from '../ships/ships';

type RouteCandidate = {
    originPlanetId: string;
    destPlanetId: string;
    resourceName: string;
    quantity: number;
    /** Net profit per tick in currency units (includes repositioning leg if any). */
    profitPerTick: number;
};

export type PriceAggregate = {
    quantity: number;
    price: number;
};
export const emptyPriceAggregate = (): PriceAggregate => ({ quantity: 0, price: 0 });

export const orderBookReducer = (maxQty: number) => (sum: PriceAggregate, level: PriceAggregate) =>
    sum.quantity >= maxQty
        ? sum
        : {
              quantity: sum.quantity + Math.min(level.quantity, maxQty - sum.quantity),
              price: sum.price + level.price * Math.min(level.quantity, maxQty - sum.quantity),
          };

function scanBestRoute(
    ship: TransportShip,
    agent: Agent,
    gameState: GameState,
    shipPlanetId: string,
): RouteCandidate | null {
    const planets = Array.from(gameState.planets.values());
    let best: RouteCandidate | null = null;
    const candidatesFromOrigin: RouteCandidate[] = [];

    let bestProfitPerTick = ARBITRAGE_MIN_PROFIT_PER_TICK;
    const debug = process.env.SIM_DEBUG === '1';
    const monthly = isFirstTickInMonth(gameState.tick);

    const oneWayTicks = travelTime(ship);
    const roundTripTicks = oneWayTicks * 2 + ARBITRAGE_LOAD_UNLOAD_OVERHEAD_TICKS;
    const shipValue = effectiveShipValue(ship, gameState);
    const depreciationRatePerTick = shipValue / ARBITRAGE_SHIP_ESTIMATED_LIFETIME_TICKS;

    for (const resource of ALL_RESOURCES) {
        if (!canCarryResource(ship, resource)) {
            continue;
        }

        const { cargoSpecification } = ship.type;
        const maxByVolume = cargoSpecification.volume / resource.volumePerQuantity;
        const maxByMass = cargoSpecification.mass / resource.massPerQuantity;
        const maxQty = Math.floor(Math.min(maxByVolume, maxByMass));

        for (const origin of planets) {
            const bids = (origin.orderBooks?.[resource.name]?.asks ?? []).reduce(
                orderBookReducer(maxQty),
                emptyPriceAggregate(),
            );
            if (bids.quantity <= 0) {
                if (debug && monthly) {
                    console.log(`[arb] ${agent.id} '${resource.name}' on ${origin.id}: no ask depth`);
                }
                continue;
            }

            if (bids.price <= 0) {
                if (debug && monthly) {
                    console.log(
                        `[arb] ${agent.id} '${resource.name}' on ${origin.id}: insufficient ask depth for effectiveQty=${bids.quantity} (available=${bids})`,
                    );
                }
                continue;
            }

            // Repositioning leg: ticks to travel from current planet to origin (0 if already there)
            const fromOrigin = origin.id === shipPlanetId;
            const repositionTicks = fromOrigin ? 0 : oneWayTicks;
            const totalTicks = repositionTicks + roundTripTicks;
            const depreciation = depreciationRatePerTick * totalTicks;

            for (const dest of planets) {
                if (dest.id === origin.id) {
                    continue;
                }

                const offers = (dest.orderBooks?.[resource.name]?.bids ?? []).reduce(
                    orderBookReducer(bids.quantity),
                    emptyPriceAggregate(),
                );

                if (offers.quantity <= 0) {
                    if (debug && monthly) {
                        console.log(
                            `[arb] ${agent.id} '${resource.name}' ${origin.id}→${dest.id}: no bid depth at destination`,
                        );
                    }
                    continue;
                }

                const effectiveQty = Math.min(maxQty, offers.quantity * 3);
                const currencyName = getCurrencyResourceName(dest.id);
                const buyingCosts = offers.price / effectiveQty;
                const midForexRate = origin.marketPrices[currencyName] ?? 1.0;
                const forexRate = midForexRate * ARBITRAGE_FOREX_THIN_BOOK_HAIRCUT;
                const pSellOrigin = buyingCosts * forexRate;

                const grossProfit = (pSellOrigin - bids.price / bids.quantity) * effectiveQty;
                if (grossProfit > 0 && fromOrigin) {
                    candidatesFromOrigin.push({
                        originPlanetId: origin.id,
                        destPlanetId: dest.id,
                        resourceName: resource.name,
                        quantity: effectiveQty,
                        profitPerTick: grossProfit / totalTicks,
                    });
                }
                const profitPerTick = (grossProfit - depreciation) / totalTicks;
                if (debug && monthly) {
                    const fxSource = `mid×${ARBITRAGE_FOREX_THIN_BOOK_HAIRCUT}`;
                    console.log(
                        `[arb] ${agent.id} '${resource.name}' ${shipPlanetId}→${origin.id}→${dest.id}: buy=${offers.price.toFixed(2)} sellDest=${buyingCosts.toFixed(2)} fxRate=${forexRate.toFixed(4)}(${fxSource}) sellAdj=${pSellOrigin.toFixed(2)} effectiveQty=${effectiveQty} gross=${grossProfit.toFixed(0)} depr=${depreciation.toFixed(0)} profitPerTick=${profitPerTick.toFixed(2)} (need>${ARBITRAGE_MIN_PROFIT_PER_TICK})`,
                    );
                }
                if (profitPerTick > bestProfitPerTick) {
                    bestProfitPerTick = profitPerTick;
                    best = {
                        originPlanetId: origin.id,
                        destPlanetId: dest.id,
                        resourceName: resource.name,
                        quantity: effectiveQty,
                        profitPerTick,
                    };
                }
            }
        }
    }
    if (best === null) {
        return null;
    }

    if (best.originPlanetId !== shipPlanetId) {
        const [opportunityRoute] = candidatesFromOrigin
            .filter((c) => c.destPlanetId === best.originPlanetId)
            .sort((a, b) => b.profitPerTick - a.profitPerTick);
        if (opportunityRoute) {
            return opportunityRoute;
        }
    }

    return best;
}

// ---------------------------------------------------------------------------
// Assign routes to idle ships (every tick)
// ---------------------------------------------------------------------------

function assignRoutesToIdleShips(agent: Agent, gameState: GameState): void {
    const debug = process.env.SIM_DEBUG === '1';
    const monthly = isFirstTickInMonth(gameState.tick);

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
            if (debug && monthly) {
                console.log(
                    `[arb] ${agent.id} ship '${ship.name}': no viable route found (profitPerTick threshold=${ARBITRAGE_MIN_PROFIT_PER_TICK})`,
                );
            }
            continue;
        }

        if (candidate.originPlanetId !== shipPlanetId) {
            // Ship needs to reposition to the origin planet first — send it empty
            if (debug) {
                console.log(
                    `[arb] ${agent.id} ship '${ship.name}': REPOSITIONING ${shipPlanetId}→${candidate.originPlanetId} for ${candidate.resourceName} route (profitPerTick=${candidate.profitPerTick.toFixed(2)})`,
                );
            }
            (ship as TransportShip).state = {
                type: 'loading',
                planetId: shipPlanetId,
                to: candidate.originPlanetId,
                cargoGoal: null,
                currentCargo: null,
                deadlineTick: gameState.tick + MAX_DISPATCH_TIMEOUT_TICKS,
            };
            continue;
        }

        if (debug) {
            console.log(
                `[arb] ${agent.id} ship '${ship.name}': ASSIGNED ${candidate.resourceName} ${candidate.originPlanetId}→${candidate.destPlanetId} qty=${candidate.quantity} profitPerTick=${candidate.profitPerTick.toFixed(2)}`,
            );
        }

        const resource = RESOURCES_BY_NAME.get(candidate.resourceName);
        if (!resource) {
            continue;
        }

        (ship as TransportShip).state = {
            type: 'loading',
            planetId: candidate.originPlanetId,
            to: candidate.destPlanetId,
            cargoGoal: { resource, quantity: candidate.quantity },
            currentCargo: { resource, quantity: 0 },
            deadlineTick: gameState.tick + MAX_DISPATCH_TIMEOUT_TICKS,
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
        const s = ship.state;
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
                if (process.env.SIM_DEBUG === '1') {
                    console.log(
                        `[arb] ${agent.id} on ${planet.name}: posting new sell offer for ${entry.quantity} ${resourceName} at ${offerPrice.toFixed(2)} (market price ${marketPrice.toFixed(2)})`,
                    );
                }
                assets.market.sell[resourceName] = {
                    resource: entry.resource,
                    offerPrice,
                    offerRetainment: 0,
                    automated: true,
                };
            }
        }
    }
}

export function arbitrageTraderTick(gameState: GameState): void {
    for (const agent of gameState.arbitrageTraders.values()) {
        assignRoutesToIdleShips(agent, gameState);
        postSellOffers(agent, gameState);
    }
}
