import {
    BUFFER_TRADER_PIVOT,
    BUFFER_TRADER_RATE,
    BUFFER_TRADER_RESPONSE,
    BUFFER_TRADER_RETAIN_DEPOSIT_FRACTION,
    BUFFER_TRADER_SEED_DEPOSIT,
    BUFFER_TRADER_TARGET_MONTHS,
    TICKS_PER_MONTH,
} from '../constants';
import { grantLoan, repayLoansOldestFirst, totalOutstandingLoans } from '../financial/loanTypes';
import { getStorageCapacityState, getWholeStorage, type ProductionFacility } from '../planet/facility';
import type { AgentPlanetAssets, GameState } from '../planet/planet';
import { TRADABLE_RESOURCES } from '../planet/resourceCatalog';

export function bufferCapacityQuantity(
    storage: AgentPlanetAssets['storage'],
    resource: ProductionFacility['produces'][number]['resource'],
): number {
    const capacity = getStorageCapacityState(storage, resource).capacity;
    const byVolume =
        resource.volumePerQuantity > 0 ? capacity.volume / resource.volumePerQuantity : Number.POSITIVE_INFINITY;
    const byMass = resource.massPerQuantity > 0 ? capacity.mass / resource.massPerQuantity : Number.POSITIVE_INFINITY;
    return Math.max(0, Math.min(byVolume, byMass));
}

export function bufferTraderTick(gameState: GameState): void {
    bufferTraderRepaymentTick(gameState);
    for (const agent of gameState.bufferTraders.values()) {
        for (const [planetId, assets] of Object.entries(agent.assets)) {
            const planet = gameState.planets.get(planetId);
            if (!planet || !assets.market) {
                continue;
            }

            const held = new Map<string, number>();
            for (const [name, entry] of getWholeStorage(assets.storage)) {
                held.set(name, entry.quantity);
            }

            for (const resource of TRADABLE_RESOURCES) {
                if (resource.form === 'services') {
                    continue;
                }
                const name = resource.name;
                const cost = planet.productionCosts[name] ?? 0;
                const price = planet.marketPrices[name] ?? 0;
                if (cost <= 0 || price <= 0) {
                    continue;
                }

                const volume = planet.avgMarketResult[name]?.totalVolume ?? 0;

                const space = bufferCapacityQuantity(assets.storage, resource);
                const stock = held.get(name) ?? 0;
                const target = Math.min(BUFFER_TRADER_TARGET_MONTHS * TICKS_PER_MONTH * volume, space);
                const imbalance = price / cost - BUFFER_TRADER_PIVOT;
                const intensity = Math.min(1, BUFFER_TRADER_RESPONSE * Math.abs(imbalance) ** 4);
                const quantum = intensity * BUFFER_TRADER_RATE * target;

                delete assets.market.buy[name];
                delete assets.market.sell[name];
                if (quantum <= 0) {
                    continue;
                }

                if (imbalance < 0) {
                    const qty = Math.min(quantum, target - stock, space - stock);
                    if (qty <= 0) {
                        continue;
                    }
                    const spend = qty * price;
                    if (spend > assets.deposits) {
                        grantLoan(assets, planet.bank, spend - assets.deposits, 'forexWorkingCapital', gameState.tick);
                    }
                    if (!assets.market.buy[name]) {
                        assets.market.buy[name] = { resource };
                    }
                    const bid = assets.market.buy[name];
                    bid.resource = resource;
                    bid.bidPrice = price;
                    bid.bidStorageTarget = stock + qty;
                } else {
                    const qty = Math.min(quantum, stock);
                    if (qty <= 0) {
                        continue;
                    }
                    if (!assets.market.sell[name]) {
                        assets.market.sell[name] = { resource };
                    }
                    const offer = assets.market.sell[name];
                    offer.resource = resource;
                    offer.automated = true;
                    offer.offerPrice = price;
                    offer.offerRetainment = stock - qty;
                }
            }
        }
    }
}

export function bufferTraderRepaymentTick(gameState: GameState): void {
    const retain = BUFFER_TRADER_SEED_DEPOSIT * BUFFER_TRADER_RETAIN_DEPOSIT_FRACTION;
    for (const agent of gameState.bufferTraders.values()) {
        for (const [planetId, assets] of Object.entries(agent.assets)) {
            const outstanding = totalOutstandingLoans(assets.activeLoans);
            if (outstanding <= 0) {
                continue;
            }
            const planet = gameState.planets.get(planetId);
            if (!planet) {
                continue;
            }
            const excess = Math.max(0, assets.deposits - retain);
            const repayment = Math.min(outstanding, excess);
            if (repayment <= 0) {
                continue;
            }
            const actual = repayLoansOldestFirst(assets.activeLoans, repayment);
            assets.deposits -= actual;
            planet.bank.loans -= actual;
            planet.bank.deposits -= actual;
        }
    }
}
