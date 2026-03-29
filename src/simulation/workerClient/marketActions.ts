import type { GameState } from '../planet/planet';
import type { OutboundMessage, PendingAction } from './messages';
import { FOOD_PRICE_FLOOR as PRICE_FLOOR } from '../constants';
import { ALL_RESOURCES } from '../planet/resourceCatalog';

/**
 * Handle 'setSellOffers' action
 */
export function handleSetSellOffers(
    state: GameState,
    action: Extract<PendingAction, { type: 'setSellOffers' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, offers } = action;
    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'sellOffersFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'sellOffersFailed',
            requestId,
            reason: `Agent has no assets on planet '${planetId}'`,
        });
        return;
    }
    if (!assets.market) {
        assets.market = { sell: {}, buy: {} };
    }
    for (const [resourceName, update] of Object.entries(offers)) {
        if (!assets.market.sell[resourceName]) {
            let resource = null;
            outerLoop: for (const facility of assets.productionFacilities) {
                for (const p of facility.produces) {
                    if (p.resource.name === resourceName) {
                        resource = p.resource;
                        break outerLoop;
                    }
                }
            }
            if (!resource) {
                resource = assets.storageFacility.currentInStorage[resourceName]?.resource ?? null;
            }
            if (!resource) {
                continue;
            }
            assets.market.sell[resourceName] = { resource };
        }
        const offer = assets.market.sell[resourceName];
        if (update.offerPrice !== undefined && update.offerPrice > 0) {
            offer.offerPrice = Math.max(PRICE_FLOOR, update.offerPrice);
        }
        if (update.offerQuantity !== undefined && update.offerQuantity >= 0) {
            offer.offerQuantity = update.offerQuantity;
        }
        if (update.offerRetainment !== undefined && update.offerRetainment >= 0) {
            offer.offerRetainment = update.offerRetainment;
        }
        if (update.automated !== undefined) {
            offer.automated = update.automated;
        }
    }
    console.log(`[worker] Sell offers updated for agent '${agentId}' on '${planetId}'`);
    safePostMessage({ type: 'sellOffersSet', requestId, agentId });
}

/**
 * Handle 'cancelSellOffer' action
 */
export function handleCancelSellOffer(
    state: GameState,
    action: Extract<PendingAction, { type: 'cancelSellOffer' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, resourceName } = action;
    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'sellOfferCancelFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'sellOfferCancelFailed',
            requestId,
            reason: `Agent has no assets on planet '${planetId}'`,
        });
        return;
    }
    if (assets.market?.sell) {
        delete assets.market.sell[resourceName];
    }
    console.log(`[worker] Sell offer cancelled for agent '${agentId}' on '${planetId}' resource '${resourceName}'`);
    safePostMessage({ type: 'sellOfferCancelled', requestId, agentId });
}

/**
 * Handle 'cancelBuyBid' action
 */
export function handleCancelBuyBid(
    state: GameState,
    action: Extract<PendingAction, { type: 'cancelBuyBid' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, resourceName } = action;
    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'buyBidCancelFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'buyBidCancelFailed',
            requestId,
            reason: `Agent has no assets on planet '${planetId}'`,
        });
        return;
    }
    const bid = assets.market?.buy[resourceName];
    if (bid) {
        delete bid.bidPrice;
        delete bid.bidStorageTarget;
        delete bid.automated;
        bid.lastBought = 0;
        bid.lastSpent = 0;
        bid.lastEffectiveQty = 0;
    }
    console.log(`[worker] Buy bid cancelled for agent '${agentId}' on '${planetId}' resource '${resourceName}'`);
    safePostMessage({ type: 'buyBidCancelled', requestId, agentId });
}

/**
 * Handle 'setBuyBids' action
 */
export function handleSetBuyBids(
    state: GameState,
    action: Extract<PendingAction, { type: 'setBuyBids' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, bids } = action;
    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'buyBidsFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'buyBidsFailed',
            requestId,
            reason: `Agent has no assets on planet '${planetId}'`,
        });
        return;
    }
    if (!assets.market) {
        assets.market = { sell: {}, buy: {} };
    }
    for (const [resourceName, update] of Object.entries(bids)) {
        if (!assets.market.buy[resourceName]) {
            let resource = null;
            outerBidLoop: for (const facility of assets.productionFacilities) {
                for (const n of facility.needs) {
                    if (n.resource.name === resourceName) {
                        resource = n.resource;
                        break outerBidLoop;
                    }
                }
            }
            if (!resource) {
                // Fall back to the global resource catalog for free-trading bids
                resource = ALL_RESOURCES.find((r) => r.name === resourceName) ?? null;
            }
            if (!resource) {
                continue;
            }
            assets.market.buy[resourceName] = { resource };
        }
        const bid = assets.market.buy[resourceName];
        if (update.bidPrice !== undefined && update.bidPrice > 0) {
            bid.bidPrice = update.bidPrice;
        }
        if (update.bidStorageTarget !== undefined && update.bidStorageTarget >= 0) {
            bid.bidStorageTarget = update.bidStorageTarget;
        }
        if (update.automated !== undefined) {
            bid.automated = update.automated;
        }
    }
    console.log(`[worker] Buy bids updated for agent '${agentId}' on '${planetId}'`);
    safePostMessage({ type: 'buyBidsSet', requestId, agentId });
}

/**
 * Dispatch market-related actions to the appropriate handler
 */
export function handleMarketAction(
    state: GameState,
    action: PendingAction,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    switch (action.type) {
        case 'setSellOffers':
            handleSetSellOffers(state, action, safePostMessage);
            break;
        case 'cancelSellOffer':
            handleCancelSellOffer(state, action, safePostMessage);
            break;
        case 'cancelBuyBid':
            handleCancelBuyBid(state, action, safePostMessage);
            break;
        case 'setBuyBids':
            handleSetBuyBids(state, action, safePostMessage);
            break;
        default:
            // This function only handles market actions
            break;
    }
}
