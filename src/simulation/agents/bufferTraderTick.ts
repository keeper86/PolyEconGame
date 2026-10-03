import {
    BUFFER_TRADER_BUY_FACTOR,
    BUFFER_TRADER_MAX_TRADE_FRACTION,
    BUFFER_TRADER_RESERVE_FRACTION,
    BUFFER_TRADER_SELL_FACTOR,
} from '../constants';
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
                const stock = held.get(name) ?? 0;
                const target = bufferCapacityQuantity(assets.storage, resource) * BUFFER_TRADER_RESERVE_FRACTION;
                if (cost <= 0 || target <= 0) {
                    continue;
                }

                const deficit = Math.max(0, target - stock);
                if (deficit > 0) {
                    if (!assets.market.buy[name]) {
                        assets.market.buy[name] = { resource };
                    }
                    const bid = assets.market.buy[name];
                    bid.resource = resource;
                    bid.bidPrice = cost * BUFFER_TRADER_BUY_FACTOR;
                    bid.bidStorageTarget = stock + deficit * BUFFER_TRADER_MAX_TRADE_FRACTION;
                } else {
                    delete assets.market.buy[name];
                }

                const offered = stock * BUFFER_TRADER_MAX_TRADE_FRACTION;
                if (offered > 0) {
                    if (!assets.market.sell[name]) {
                        assets.market.sell[name] = { resource };
                    }
                    const offer = assets.market.sell[name];
                    offer.resource = resource;
                    offer.automated = true;
                    offer.offerPrice = cost * BUFFER_TRADER_SELL_FACTOR;
                    offer.offerRetainment = stock - offered;
                } else {
                    delete assets.market.sell[name];
                }
            }
        }
    }
}
