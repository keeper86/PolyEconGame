import { putIntoStorageFacility, releaseFromEscrow, transferFromEscrow } from '../planet/storage';
import type { Planet } from '../planet/planet';
import { debitConsumptionPurchase } from '../financial/wealthOps';
import type { AgentBidOrder, AskOrder, BidOrder, TradeRecord } from './marketTypes';
import { SERVICE_PER_PERSON_PER_TICK } from '../constants';

export function settleHouseholds(
    planet: Planet,
    resourceName: string,
    bidOrders: BidOrder[],
    bidFilled: number[],
    bidCosts: number[],
): void {
    const demography = planet.population.demography;

    // Map resource name to service name
    let serviceName: 'grocery' | 'retail' | 'logistics' | 'healthcare' | 'construction' | 'administrative';
    switch (resourceName) {
        case 'Grocery Service':
            serviceName = 'grocery';
            break;
        case 'Healthcare Service':
            serviceName = 'healthcare';
            break;
        case 'Administrative Service':
            serviceName = 'administrative';
            break;
        case 'Logistics Service':
            serviceName = 'logistics';
            break;
        case 'Retail Service':
            serviceName = 'retail';
            break;
        case 'Construction Service':
            serviceName = 'construction';
            break;
        default:
            // Not a service resource
            return;
    }

    for (let i = 0; i < bidOrders.length; i++) {
        const filled = bidFilled[i];
        if (filled <= 0) {
            continue;
        }

        const record = bidOrders[i];
        const category = demography[record.age][record.occ][record.edu][record.skill];
        const perPersonCost = record.population > 0 ? bidCosts[i] / record.population : 0;

        // Convert filled units to buffer ticks
        // filled is in units, buffer is in ticks worth of service
        // buffer ticks = filled / (SERVICE_PER_PERSON_PER_TICK * category.total)
        const bufferTicks = filled / (SERVICE_PER_PERSON_PER_TICK * category.total);
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
