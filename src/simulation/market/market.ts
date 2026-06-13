import {
    BID_OFFER_MAX_COST_MULTIPLIER,
    EPSILON,
    PRICE_CEIL,
    PRICE_FLOOR,
    PRICE_NO_TRADE_CONVERGENCE_RATE,
    TICKS_PER_MONTH,
} from '../constants';
import type { Agent, Planet } from '../planet/planet';
import { releaseFromEscrow } from '../planet/facility';
import type { BidOrder } from './marketTypes';
import { clearUnifiedBids } from './orderBook';
import { collectAgentBids, collectAgentOffers, resetAgentBuyCounters, resetAgentSellCounters } from './orderCollection';
import { binHouseholdBids, buildPopulationDemand, householdDemandPriority } from './populationDemand';
import { computeMarketSummary, settleAgentBuyers, settleAgentSellers, settleHouseholds } from './settlement';
import { buildPlanetOrderBook } from './orderBookSnapshot';

export type { BidOrder } from './marketTypes';

export function marketTick(agents: Map<string, Agent>, planet: Planet): void {
    planet.lastMarketResult = {};

    const askBooks = collectAgentOffers(agents, planet);
    resetAgentSellCounters(askBooks, planet);
    resetAgentBuyCounters(agents, planet);

    const agentBidBooks = collectAgentBids(agents, planet);

    const householdBidMap = buildPopulationDemand(planet);

    const resourceOrder = buildResourceOrder(askBooks, agentBidBooks);

    for (const resourceName of resourceOrder) {
        clearResourceMarket(resourceName, askBooks, agentBidBooks, householdBidMap, planet);
    }

    releaseRemainingHolds(agents, planet);
    buildPlanetOrderBook(planet, askBooks, agentBidBooks);
}

function releaseRemainingHolds(agents: Map<string, Agent>, planet: Planet): void {
    agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets) {
            return;
        }
        if (assets.depositHold > 0) {
            assets.deposits += assets.depositHold;
            assets.depositHold = 0;
        }
    });
}

function buildResourceOrder(askBooks: Map<string, unknown>, agentBidBooks: Map<string, unknown>): string[] {
    const agentOnlyResources = new Set<string>([...askBooks.keys(), ...agentBidBooks.keys()]);
    for (const name of householdDemandPriority) {
        agentOnlyResources.delete(name);
    }
    return [...householdDemandPriority, ...agentOnlyResources];
}

function clearResourceMarket(
    resourceName: string,
    askBooks: ReturnType<typeof collectAgentOffers>,
    agentBidBooks: ReturnType<typeof collectAgentBids>,
    householdBidMap: Map<string, BidOrder[]>,
    planet: Planet,
): void {
    const askOrders = (askBooks.get(resourceName) ?? []).sort((a, b) => a.askPrice - b.askPrice);
    const agentBids = agentBidBooks.get(resourceName) ?? [];

    const householdBids = (householdBidMap.get(resourceName) ?? []).slice().sort((a, b) => b.bidPrice - a.bidPrice);

    const totalSupply = askOrders.reduce((s, a) => s + a.quantity, 0);
    const householdDemand = householdBids.reduce((s, b) => s + b.quantity, 0);
    const agentDemand = agentBids.reduce((s, b) => s + b.quantity, 0);
    const totalDemand = householdDemand + agentDemand;

    const referencePrice = planet.marketPrices[resourceName];
    if (referencePrice === undefined) {
        throw new Error(`Market price for resource ${resourceName} is undefined. Check initialMarketPrices.`);
    }

    const costFloor = planet.lastProductionCostFloors[resourceName] ?? PRICE_FLOOR;
    const dynamicPriceCeil = costFloor * BID_OFFER_MAX_COST_MULTIPLIER;

    if (askOrders.length === 0 || (householdBids.length === 0 && agentBids.length === 0)) {
        for (const ask of askOrders) {
            const assets = ask.agent.assets[planet.id];
            if (assets) {
                if (process.env.SIM_DEBUG === '1') {
                    const escrowed = assets.storageFacility.escrow[ask.resource.name] ?? 0;
                    if (escrowed < ask.quantity - EPSILON) {
                        throw new Error(
                            `Escrow mismatch: trying to release ${ask.quantity} but only ${escrowed} escrowed. ` +
                                `agent=${ask.agent.id}, resource=${ask.resource.name}`,
                        );
                    }
                }
                releaseFromEscrow(assets.storageFacility, ask.resource.name, ask.quantity);
            }
        }

        let noTradePrice = referencePrice;
        if (askOrders.length > 0) {
            // Supply exists but zero demand → price decays toward cost floor
            const noTradeFloor = Math.min(costFloor, referencePrice);
            noTradePrice = referencePrice + (noTradeFloor - referencePrice) * PRICE_NO_TRADE_CONVERGENCE_RATE;
        } else if (agentBids.length > 0 || householdBids.length > 0) {
            // Demand exists but no supply → converge toward best bid
            let bestBid = -Infinity;
            for (const bid of agentBids) {
                bestBid = Math.max(bestBid, bid.bidPrice);
            }
            for (const bid of householdBids) {
                bestBid = Math.max(bestBid, bid.bidPrice);
            }
            bestBid = Math.min(bestBid, dynamicPriceCeil);
            noTradePrice = referencePrice + (bestBid - referencePrice) * PRICE_NO_TRADE_CONVERGENCE_RATE;
        }
        noTradePrice = Math.min(PRICE_CEIL, Math.max(PRICE_FLOOR, noTradePrice));
        planet.marketPrices[resourceName] = noTradePrice;

        planet.lastMarketResult[resourceName] = {
            resourceName,
            clearingPrice: noTradePrice,
            totalVolume: 0,
            totalDemand,
            totalSupply,
            unfilledDemand: totalDemand,
            unsoldSupply: totalSupply,
            populationBids: binHouseholdBids(householdBids, [], []),
        };
        updateAvgMarketResult(planet, resourceName);
        return;
    }

    const { householdBidFilled, householdTrades, agentTrades, householdBidCosts } = clearUnifiedBids(
        householdBids,
        agentBids,
        askOrders,
    );

    settleHouseholds(planet, resourceName, householdBids, householdBidFilled, householdBidCosts);
    settleAgentBuyers(planet, agentBids);
    settleAgentSellers(planet, askOrders);

    const allTrades = [...householdTrades, ...agentTrades];
    const { clearingPrice, totalVolume } = computeMarketSummary(allTrades, referencePrice);

    let price = clearingPrice;
    if (totalVolume > 0) {
        planet.marketPrices[resourceName] = clearingPrice;
    } else if (askOrders.length > 0) {
        let bestBid = -Infinity;
        for (const bid of agentBids) {
            bestBid = Math.max(bestBid, bid.bidPrice);
        }
        for (const bid of householdBids) {
            bestBid = Math.max(bestBid, bid.bidPrice);
        }

        bestBid = Math.min(bestBid, dynamicPriceCeil);
        price = referencePrice + (bestBid - referencePrice) * PRICE_NO_TRADE_CONVERGENCE_RATE;
        price = Math.min(PRICE_CEIL, Math.max(PRICE_FLOOR, price));
        planet.marketPrices[resourceName] = price;
    }

    const unsoldSupply = Math.max(0, totalSupply - totalVolume);

    planet.lastMarketResult[resourceName] = {
        resourceName,
        clearingPrice: price,
        totalVolume,
        totalDemand,
        totalSupply,
        unfilledDemand: Math.max(0, totalDemand - totalVolume),
        unsoldSupply,
        populationBids: binHouseholdBids(householdBids, householdBidFilled, householdBidCosts),
    };
    updateAvgMarketResult(planet, resourceName);
}

function updateAvgMarketResult(planet: Planet, resourceName: string): void {
    const latest = planet.lastMarketResult[resourceName];
    if (!latest) {
        return;
    }
    const prior = planet.avgMarketResult[resourceName];
    if (!prior) {
        planet.avgMarketResult[resourceName] = {
            resourceName: latest.resourceName,
            clearingPrice: latest.clearingPrice,
            totalVolume: latest.totalVolume,
            totalDemand: latest.totalDemand,
            totalSupply: latest.totalSupply,
            unfilledDemand: latest.unfilledDemand,
            unsoldSupply: latest.unsoldSupply,
        };
        return;
    }
    const alpha = 1 / TICKS_PER_MONTH;
    const ema = (cur: number, prev: number) => alpha * cur + (1 - alpha) * prev;
    planet.avgMarketResult[resourceName] = {
        resourceName: latest.resourceName,
        clearingPrice: ema(latest.clearingPrice, prior.clearingPrice),
        totalVolume: ema(latest.totalVolume, prior.totalVolume),
        totalDemand: ema(latest.totalDemand, prior.totalDemand),
        totalSupply: ema(latest.totalSupply, prior.totalSupply),
        unfilledDemand: ema(latest.unfilledDemand, prior.unfilledDemand),
        unsoldSupply: ema(latest.unsoldSupply, prior.unsoldSupply),
    };
}
