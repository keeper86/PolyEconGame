import { FOREX_MM_BASE_SPREAD, FOREX_MM_TARGET_DEPOSIT, PRICE_CEIL } from '../constants';
import type { Agent, GameState, Planet } from '../planet/planet';
import {
    DEFAULT_EXCHANGE_RATE,
    FOREX_PRICE_FLOOR,
    getCurrencyResource,
    getCurrencyResourceName,
} from '../market/currencyResources';

export function forexMarketMakerPricing(gameState: GameState): void {
    const planets = Array.from(gameState.planets.values());
    const numTradingPlanets = Math.max(1, planets.length - 1);

    for (const mm of gameState.forexMarketMakers.values()) {
        priceMM(mm, planets, numTradingPlanets);
    }
}
function priceMM(mm: Agent, planets: Planet[], numTradingPlanets: number): void {
    const TARGET = FOREX_MM_TARGET_DEPOSIT; // 10_000_000
    const SPREAD = FOREX_MM_BASE_SPREAD; // 0.03
    const MIN_FOREIGN = 1e-6; // prevents division by zero

    for (const tradingPlanet of planets) {
        const tradingAssets = mm.assets[tradingPlanet.id];
        if (!tradingAssets) {
            continue;
        }
        if (!tradingAssets.market) {
            tradingAssets.market = { sell: {}, buy: {} };
        }

        for (const issuingPlanet of planets) {
            if (issuingPlanet.id === tradingPlanet.id) {
                continue;
            }
            const foreignAssets = mm.assets[issuingPlanet.id];
            if (!foreignAssets) {
                continue;
            }

            const curName = getCurrencyResourceName(issuingPlanet.id);
            const curResource = getCurrencyResource(issuingPlanet.id);

            const localBalance = tradingAssets.deposits;
            const foreignBalance = foreignAssets.deposits;

            // ---- constant-product mid-price ----
            // price = DEFAULT * (localBalance / foreignBalance)
            // With identical targets, anchoring is automatic.
            let fairMid: number;
            if (foreignBalance <= 0) {
                // No foreign currency left – price “infinite” (set to ceiling)
                fairMid = PRICE_CEIL;
            } else {
                fairMid = DEFAULT_EXCHANGE_RATE * (localBalance / Math.max(foreignBalance, MIN_FOREIGN));
                fairMid = Math.max(FOREX_PRICE_FLOOR, Math.min(PRICE_CEIL, fairMid));
            }

            // Ask price: sell foreign
            const askPrice = Math.min(PRICE_CEIL, fairMid * (1 + SPREAD));

            // Bid price: buy foreign (must be < askPrice)
            const rawBid = fairMid * (1 - SPREAD);
            const bidPrice = Math.max(FOREX_PRICE_FLOOR, Math.min(askPrice * 0.999, rawBid));

            // ---- Ask order ----
            // Only offer if we actually possess foreign currency
            if (foreignBalance > 0) {
                if (!tradingAssets.market.sell[curName]) {
                    tradingAssets.market.sell[curName] = { resource: curResource };
                }
                const offer = tradingAssets.market.sell[curName];
                offer.resource = curResource;
                offer.offerPrice = askPrice;
                offer.offerRetainment = 0;
            } else {
                // Remove any stale ask
                delete tradingAssets.market.sell[curName];
            }

            // ---- Bid order ----
            // Split desired purchase amount across trading planets (unchanged logic)
            const deficit = Math.max(0, TARGET - foreignBalance);
            const splitTarget = foreignBalance + deficit / numTradingPlanets;

            if (!tradingAssets.market.buy[curName]) {
                tradingAssets.market.buy[curName] = { resource: curResource };
            }
            const bid = tradingAssets.market.buy[curName];
            bid.resource = curResource;
            bid.bidPrice = bidPrice;
            bid.bidStorageTarget = splitTarget;
        }
    }
}
