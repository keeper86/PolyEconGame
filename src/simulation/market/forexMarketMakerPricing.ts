import { FOREX_MM_BASE_SPREAD, FOREX_MM_MAX_SKEW, FOREX_MM_TARGET_DEPOSIT, PRICE_CEIL } from '../constants';
import type { Agent, GameState } from '../planet/planet';
import {
    DEFAULT_EXCHANGE_RATE,
    FOREX_PRICE_FLOOR,
    getCurrencyResource,
    getCurrencyResourceName,
} from './currencyResources';

/**
 * Update ask and bid prices for every market-maker on every planet they trade on.
 *
 * Algorithm (per MM, per foreign currency F):
 *
 *   inventoryRatio = clamp(currentDepositOnF / TARGET, 0, 2)
 *   skew           = (inventoryRatio − 1) × MAX_SKEW
 *                    > 0 when over-stocked (lean to sell → lower ask/bid)
 *                    < 0 when under-stocked (lean to buy → higher ask/bid)
 *
 *   askPrice = mid × (1 + BASE_SPREAD − skew)
 *   bidPrice = mid × (1 − BASE_SPREAD − skew)
 *
 *   Both are clamped, and a guard ensures ask > bid.
 */
export function forexMarketMakerPricing(gameState: GameState): void {
    for (const mm of gameState.forexMarketMakers.values()) {
        priceMM(mm, gameState);
    }
}

function priceMM(mm: Agent, gameState: GameState): void {
    const homeAssets = mm.assets[mm.associatedPlanetId];
    if (!homeAssets) {
        return;
    }

    if (!homeAssets.market) {
        homeAssets.market = { sell: {}, buy: {} };
    }

    const tradingPlanet = gameState.planets.get(mm.associatedPlanetId);
    if (!tradingPlanet) {
        return;
    }

    for (const [planetId] of gameState.planets) {
        if (planetId === mm.associatedPlanetId) {
            continue;
        }

        const foreignAssets = mm.assets[planetId];
        if (!foreignAssets) {
            continue;
        }

        const curName = getCurrencyResourceName(planetId);
        const curResource = getCurrencyResource(planetId);
        const mid = tradingPlanet.marketPrices[curName] ?? DEFAULT_EXCHANGE_RATE;

        const inventory = foreignAssets.deposits;
        const inventoryRatio = Math.max(0, Math.min(2, inventory / FOREX_MM_TARGET_DEPOSIT));
        // skew > 0 when over-stocked: widen asks downward, bids downward
        const skew = (inventoryRatio - 1) * FOREX_MM_MAX_SKEW;

        const askPrice = Math.max(FOREX_PRICE_FLOOR, Math.min(PRICE_CEIL, mid * (1 + FOREX_MM_BASE_SPREAD - skew)));
        // Ensure bid is strictly below ask
        const rawBid = mid * (1 - FOREX_MM_BASE_SPREAD - skew);
        const bidPrice = Math.max(FOREX_PRICE_FLOOR, Math.min(askPrice * 0.999, rawBid));

        // --- Ask: sell F-currency (inventory backed on F) ---
        if (!homeAssets.market.sell[curName]) {
            homeAssets.market.sell[curName] = { resource: curResource };
        }
        const offer = homeAssets.market.sell[curName];
        offer.resource = curResource;
        offer.offerPrice = askPrice;
        offer.offerRetainment = 0;

        // --- Bid: buy F-currency (paying from home deposits) ---
        if (!homeAssets.market.buy[curName]) {
            homeAssets.market.buy[curName] = { resource: curResource };
        }
        const bid = homeAssets.market.buy[curName];
        bid.resource = curResource;
        bid.bidPrice = bidPrice;
        bid.bidStorageTarget = FOREX_MM_TARGET_DEPOSIT;
    }
}
