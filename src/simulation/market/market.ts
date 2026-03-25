import { INITIAL_FOOD_PRICE } from '../constants';
import type { Agent, Planet } from '../planet/planet';
import { agriculturalProductResourceType } from '../planet/resources';
import { clearUnifiedBids } from './orderBook';
import { collectAgentBids, collectAgentOffers, resetAgentBuyCounters, resetAgentSellCounters } from './orderCollection';
import { binHouseholdBids, buildPopulationDemandForResource, householdDemandPriority } from './populationDemand';
import { computeMarketSummary, settleAgentBuyers, settleAgentSellers, settleHouseholds } from './settlement';

export type { BidOrder } from './marketTypes';

export function marketTick(agents: Map<string, Agent>, planet: Planet): void {
    const askBooks = collectAgentOffers(agents, planet);
    resetAgentSellCounters(askBooks, planet);
    resetAgentBuyCounters(agents, planet);

    const agentBidBooks = collectAgentBids(agents, planet);

    const resourceOrder = buildResourceOrder(askBooks, agentBidBooks);

    for (const resourceName of resourceOrder) {
        clearResourceMarket(resourceName, askBooks, agentBidBooks, planet);
    }
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
    planet: Planet,
): void {
    const askOrders = askBooks.get(resourceName) ?? [];
    const agentBids = agentBidBooks.get(resourceName) ?? [];

    // Household bids are built after higher-priority goods are settled so
    // each cohort's remaining wealth is already up to date.
    const householdBids = buildPopulationDemandForResource(planet, resourceName).sort(
        (a, b) => b.bidPrice - a.bidPrice,
    );

    const totalSupply = askOrders.reduce((s, a) => s + a.quantity, 0);
    const householdDemand = householdBids.reduce((s, b) => s + b.quantity, 0);
    const agentDemand = agentBids.reduce((s, b) => s + b.quantity, 0);
    const totalDemand = householdDemand + agentDemand;

    const referencePrice = referencePriceFor(planet, resourceName);

    if (askOrders.length === 0 || (householdBids.length === 0 && agentBids.length === 0)) {
        planet.lastMarketResult[resourceName] = {
            resourceName,
            clearingPrice: referencePrice,
            totalVolume: 0,
            totalDemand,
            totalSupply,
            unfilledDemand: totalDemand,
            unsoldSupply: totalSupply,
            populationBids: binHouseholdBids(householdBids, [], []),
        };
        return;
    }

    askOrders.sort((a, b) => a.askPrice - b.askPrice);

    const askFilledBaseline = askOrders.map((a) => a.filled);
    const askRevenueBaseline = askOrders.map((a) => a.revenue);

    const { householdBidFilled, householdTrades, agentTrades, householdBidCosts } = clearUnifiedBids(
        householdBids,
        agentBids,
        askOrders,
    );

    settleHouseholds(planet, resourceName, householdBids, householdBidFilled, householdBidCosts);
    settleAgentBuyers(planet, agentBids);
    settleAgentSellers(planet, askOrders, askFilledBaseline, askRevenueBaseline);

    const allTrades = [...householdTrades, ...agentTrades];
    const { clearingPrice, totalVolume } = computeMarketSummary(allTrades, referencePrice);

    if (totalVolume > 0) {
        planet.marketPrices[resourceName] = clearingPrice;
    }

    const unsoldSupply = askOrders.reduce((s, a) => s + (a.quantity - a.filled), 0);

    planet.lastMarketResult[resourceName] = {
        resourceName,
        clearingPrice,
        totalVolume,
        totalDemand,
        totalSupply,
        unfilledDemand: Math.max(0, totalDemand - totalVolume),
        unsoldSupply,
        populationBids: binHouseholdBids(householdBids, householdBidFilled, householdBidCosts),
    };
}

function referencePriceFor(planet: Planet, resourceName: string): number {
    return (
        planet.marketPrices[resourceName] ??
        (resourceName === agriculturalProductResourceType.name ? INITIAL_FOOD_PRICE : 1)
    );
}
