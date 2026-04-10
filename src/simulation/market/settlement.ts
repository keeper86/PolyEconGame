import { putIntoStorageFacility, releaseFromEscrow, transferFromEscrow } from '../planet/facility';
import type { Planet } from '../planet/planet';
import { debitConsumptionPurchase } from '../financial/wealthOps';
import type { AgentBidOrder, AskOrder, BidOrder, TradeRecord } from './marketTypes';
import { SERVICE_DEFINITION_BY_RESOURCE_NAME } from './populationDemand';

export function settleHouseholds(
    planet: Planet,
    resourceName: string,
    bidOrders: BidOrder[],
    bidFilled: number[],
    bidCosts: number[],
): void {
    // Derive serviceKey and rate from the single source of truth.
    // Returns early for non-service resources (no entry in the map).
    const def = SERVICE_DEFINITION_BY_RESOURCE_NAME.get(resourceName);
    if (!def) {
        return;
    }
    const serviceName = def.serviceKey;
    const rate = def.consumptionRatePerPersonPerTick;

    const demography = planet.population.demography;

    for (let i = 0; i < bidOrders.length; i++) {
        const filled = bidFilled[i];
        if (filled <= 0) {
            continue;
        }

        const record = bidOrders[i];
        const category = demography[record.age][record.occ][record.edu][record.skill];
        const perPersonCost = record.population > 0 ? bidCosts[i] / record.population : 0;

        // Convert filled units to buffer ticks using the per-service consumption rate.
        // bufferTicks = filled / (rate × population)
        const bufferTicks = filled / (rate * category.total);
        category.services[serviceName].buffer += bufferTicks;

        debitConsumptionPurchase(planet.bank, category, perPersonCost);
    }
}

export function settleAgentSellers(planet: Planet, askOrders: AskOrder[]): void {
    for (let i = 0; i < askOrders.length; i++) {
        const ask = askOrders[i];
        const assets = ask.agent.assets[planet.id];
        if (!assets) {
            continue;
        }

        if (!assets.market) {
            assets.market = { sell: {}, buy: {} };
        }

        const filled = ask.filled;
        const revenue = ask.revenue;
        const unfilled = ask.quantity - filled;

        // Transfer sold goods out of escrow (removes them from storage too).
        if (filled > 0) {
            transferFromEscrow(assets.storageFacility, ask.resource.name, filled);
            assets.deposits += revenue;
            assets.monthAcc.revenue += revenue;

            const offer = assets.market.sell[ask.resource.name];
            if (offer) {
                offer.lastSold = (offer.lastSold ?? 0) + filled;
                offer.lastRevenue = (offer.lastRevenue ?? 0) + revenue;
            }
        }

        // Release unsold goods from escrow back to free stock.
        if (unfilled > 0) {
            releaseFromEscrow(assets.storageFacility, ask.resource.name, unfilled);
        }
    }
}

export function settleAgentBuyers(planet: Planet, agentBids: AgentBidOrder[]): void {
    for (const bid of agentBids) {
        const assets = bid.agent.assets[planet.id];
        if (!assets) {
            continue;
        }

        const holdConsumed = bid.cost;
        const holdUnused = bid.quantity * bid.bidPrice - holdConsumed;

        // Return the unused portion of the hold to free deposits.
        if (holdUnused > 0) {
            assets.depositHold -= holdUnused;
            assets.deposits += holdUnused;
        }

        if (bid.filled <= 0) {
            continue;
        }

        // Consume the hold for the filled amount.
        assets.depositHold -= holdConsumed;

        const actuallyStored = putIntoStorageFacility(assets.storageFacility, bid.resource, bid.filled);
        const storageFull = actuallyStored < bid.filled;

        const costForStored = bid.filled > 0 ? bid.cost * (actuallyStored / bid.filled) : 0;
        const costRefunded = bid.cost - costForStored;

        assets.monthAcc.purchases += costForStored;

        if (costRefunded > 0) {
            if (process.env.SIM_DEBUG === '1') {
                throw new Error(
                    `Monetary conservation violation: costRefunded=${costRefunded} > 0. ` +
                        `bid.cost=${bid.cost}, costForStored=${costForStored}, ` +
                        `bid.filled=${bid.filled}, actuallyStored=${actuallyStored}, ` +
                        `agent=${bid.agent.id}, resource=${bid.resource.name}`,
                );
            }
            assets.deposits += costRefunded;
        }

        const buyState = assets.market?.buy[bid.resource.name];
        if (buyState) {
            buyState.lastBought = (buyState.lastBought ?? 0) + actuallyStored;
            buyState.lastSpent = (buyState.lastSpent ?? 0) + costForStored;

            if (storageFull) {
                if (process.env.SIM_DEBUG === '1') {
                    console.warn(
                        `[settlement] storageFull reached for agent=${bid.agent.id} resource=${bid.resource.name}. ` +
                            `This should have been prevented by order validation. ` +
                            `actuallyStored=${actuallyStored}, bid.filled=${bid.filled}`,
                    );
                }
                buyState.storageFullWarning = true;
            }
        }
    }
}

export function computeMarketSummary(
    trades: TradeRecord[],
    referencePrice: number,
): { clearingPrice: number; totalVolume: number; totalRevenue: number } {
    const totalVolume = trades.reduce((s, t) => s + t.quantity, 0);
    const totalRevenue = trades.reduce((s, t) => s + t.price * t.quantity, 0);
    const clearingPrice = totalVolume > 0 ? totalRevenue / totalVolume : referencePrice;
    return { clearingPrice, totalVolume, totalRevenue };
}
