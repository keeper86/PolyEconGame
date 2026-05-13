import {
    ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD,
    ARBITRAGE_LOAD_UNLOAD_OVERHEAD_TICKS,
    ARBITRAGE_MIN_CAPITAL_RESERVE,
    ARBITRAGE_MIN_PROFIT_PER_TICK,
    ARBITRAGE_SEED_DEPOSIT,
    ARBITRAGE_SHIP_ESTIMATED_LIFETIME_TICKS,
    isFirstTickInMonth,
    MAX_DISPATCH_TIMEOUT_TICKS,
} from '../constants';
import { repayLoansOldestFirst, totalOutstandingLoans } from '../financial/loanTypes';
import type { Agent, GameState } from '../planet/planet';
import { ALL_RESOURCES, RESOURCES_BY_NAME } from '../planet/resourceCatalog';
import { travelTime } from '../ships/shipHandlers';
import {
    createShipListing,
    effectiveShipValue,
    executeShipPurchase,
    findCheapestShipListing,
    updateShipEma,
} from '../ships/shipMarket';
import type { ShipListing, TransportShip } from '../ships/ships';
import { canCarryResource, shiptypes } from '../ships/ships';
import { getCurrencyResourceName } from '../market/currencyResources';
import { getEffectiveBuyPrice, getEffectiveSellPrice } from '../market/orderBookSnapshot';

const EXPAND_FLEET_SHIP_TYPE = shiptypes.solid.bulkCarrier1;

// ---------------------------------------------------------------------------
// Route scanner
// ---------------------------------------------------------------------------

type RouteCandidate = {
    originPlanetId: string;
    destPlanetId: string;
    resourceName: string;
    quantity: number;
    /** Net profit per tick in currency units (includes repositioning leg if any). */
    profitPerTick: number;
};

function scanBestRoute(
    ship: TransportShip,
    agent: Agent,
    gameState: GameState,
    shipPlanetId: string,
): RouteCandidate | null {
    const planets = Array.from(gameState.planets.values());
    let best: RouteCandidate | null = null;
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
        if (maxQty < 1) {
            continue;
        }

        for (const origin of planets) {
            // Use spot price only for affordability estimate (order book may be absent on first tick)
            const pBuySpot = origin.marketPrices[resource.name];
            if (!pBuySpot || pBuySpot <= 0) {
                if (debug && monthly) {
                    console.log(`[arb] ${agent.id} '${resource.name}' on ${origin.id}: no buy price`);
                }
                continue;
            }

            // Check agent has deposits to fund the purchase; scale down quantity if needed
            const agentOriginDeposits = agent.assets[origin.id]?.deposits ?? 0;
            const affordableQty = Math.floor(agentOriginDeposits / pBuySpot);
            const qty = Math.min(maxQty, affordableQty);
            if (qty < 1) {
                if (debug && monthly) {
                    console.log(
                        `[arb] ${agent.id} '${resource.name}' on ${origin.id}: insufficient capital for even 1 unit (have ${agentOriginDeposits.toFixed(0)}, need ${pBuySpot.toFixed(0)}/unit)`,
                    );
                }
                continue;
            }

            // Depth-aware buy price: walks the ask ladder for the actual fill quantity
            const pBuy = getEffectiveBuyPrice(origin, resource.name, qty);
            if (!pBuy) {
                if (debug && monthly) {
                    console.log(
                        `[arb] ${agent.id} '${resource.name}' on ${origin.id}: insufficient ask depth for qty=${qty}`,
                    );
                }
                continue;
            }

            // Repositioning leg: ticks to travel from current planet to origin (0 if already there)
            const repositionTicks = origin.id === shipPlanetId ? 0 : oneWayTicks;
            const totalTicks = repositionTicks + roundTripTicks;
            const depreciation = depreciationRatePerTick * totalTicks;

            for (const dest of planets) {
                if (dest.id === origin.id) {
                    continue;
                }

                // Depth-aware sell price: walks the bid ladder at destination
                const pSellDest = getEffectiveSellPrice(dest, resource.name, qty);
                if (!pSellDest) {
                    if (debug && monthly) {
                        console.log(
                            `[arb] ${agent.id} '${resource.name}' ${origin.id}→${dest.id}: insufficient bid depth for qty=${qty}`,
                        );
                    }
                    continue;
                }

                // Convert destination price to origin currency
                const currencyName = getCurrencyResourceName(dest.id);
                const forexRate = origin.marketPrices[currencyName] ?? 1.0;
                const pSellOrigin = pSellDest * forexRate;

                const grossProfit = (pSellOrigin - pBuy) * qty;
                const profitPerTick = (grossProfit - depreciation) / totalTicks;
                if (debug && monthly) {
                    console.log(
                        `[arb] ${agent.id} '${resource.name}' ${shipPlanetId}→${origin.id}→${dest.id}: buy=${pBuy.toFixed(2)} sellAdj=${pSellOrigin.toFixed(2)} qty=${qty} gross=${grossProfit.toFixed(0)} depr=${depreciation.toFixed(0)} profitPerTick=${profitPerTick.toFixed(2)} (need>${ARBITRAGE_MIN_PROFIT_PER_TICK})`,
                    );
                }
                if (profitPerTick > bestProfitPerTick) {
                    bestProfitPerTick = profitPerTick;
                    best = {
                        originPlanetId: origin.id,
                        destPlanetId: dest.id,
                        resourceName: resource.name,
                        quantity: qty,
                        profitPerTick,
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

        // Set ship directly to loading — automaticPricing will create the buy bid,
        // and the shipHandlers loading state will pull from storage once goods arrive.
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
// Loan repayment (called from engine instead of generic automaticLoanRepayment)
// ---------------------------------------------------------------------------

export function arbitrageTraderRepaymentTick(gameState: GameState): void {
    for (const agent of gameState.arbitrageTraders.values()) {
        for (const [planetId, assets] of Object.entries(agent.assets)) {
            const planet = gameState.planets.get(planetId);
            if (!planet) {
                continue;
            }
            const agentLoanTotal = totalOutstandingLoans(assets.activeLoans);
            if (agentLoanTotal <= 0) {
                continue;
            }
            // Retain the seed deposit as permanent working capital; only repay true excess.
            const excess = Math.max(0, assets.deposits - ARBITRAGE_SEED_DEPOSIT);
            const repayment = Math.min(agentLoanTotal, excess);
            if (repayment <= 0) {
                continue;
            }
            const actualRepayment = repayLoansOldestFirst(assets.activeLoans, repayment);
            assets.deposits -= actualRepayment;
            planet.bank.loans -= actualRepayment;
            planet.bank.deposits -= actualRepayment;
            planet.bank.equity = planet.bank.deposits - planet.bank.loans;
        }
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
