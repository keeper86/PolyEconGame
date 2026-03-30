import { EPSILON } from '../constants';
import { initialMarketPrices } from '../initialUniverse/initialMarketPrices';
import type { Agent, Planet } from '../planet/planet';
import { releaseFromEscrow } from '../planet/storage';
import { clearUnifiedBids } from './orderBook';
import { collectAgentBids, collectAgentOffers, resetAgentBuyCounters, resetAgentSellCounters } from './orderCollection';
import { binHouseholdBids, buildPopulationDemandForResource, householdDemandPriority } from './populationDemand';
import { computeMarketSummary, settleAgentBuyers, settleAgentSellers, settleHouseholds } from './settlement';

export type { BidOrder } from './marketTypes';

export function marketTick(agents: Map<string, Agent>, planet: Planet): void {
    planet.lastMarketResult = {};

    const askBooks = collectAgentOffers(agents, planet);
    resetAgentSellCounters(askBooks, planet);
    resetAgentBuyCounters(agents, planet);

    const agentBidBooks = collectAgentBids(agents, planet);

    const resourceOrder = buildResourceOrder(askBooks, agentBidBooks);

    for (const resourceName of resourceOrder) {
        clearResourceMarket(resourceName, askBooks, agentBidBooks, planet);
    }

    releaseRemainingHolds(agents, planet);
}

/**
 * After all resource markets are cleared, release any deposit hold that was
 * not consumed during settlement (bids that got zero fill).
 */
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

    const referencePrice = initialMarketPrices[resourceName] ?? 1;

    if (askOrders.length === 0 || (householdBids.length === 0 && agentBids.length === 0)) {
        // No trades possible: release any escrowed goods back to free stock
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

    if (totalVolume > 0) {
        planet.marketPrices[resourceName] = clearingPrice;
    }

    const unsoldSupply = totalSupply - totalVolume;

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
