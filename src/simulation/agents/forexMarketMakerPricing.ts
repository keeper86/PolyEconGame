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

            // Fair mid: bounded linear inventory-shading model.
            // When long local (relative to target), mid rises  → foreign more expensive → encourages selling foreign.
            // When long foreign,                  mid falls  → foreign cheaper       → encourages buying  foreign.
            const localBalance = tradingAssets.deposits;
            const foreignBalance = foreignAssets.deposits;
            const alpha = 0.1;
            const beta  = 0.1;
            const shading =
                1 +
                alpha * (localBalance / FOREX_MM_TARGET_DEPOSIT - 1) -
                beta  * (foreignBalance / FOREX_MM_TARGET_DEPOSIT - 1);
            let fairMid = DEFAULT_EXCHANGE_RATE * shading;
            fairMid = Math.max(FOREX_PRICE_FLOOR, Math.min(PRICE_CEIL, fairMid));

            const askPrice = Math.max(FOREX_PRICE_FLOOR, Math.min(PRICE_CEIL, fairMid * (1 + FOREX_MM_BASE_SPREAD)));
            // Ensure bid is strictly below ask
            const rawBid = fairMid * (1 - FOREX_MM_BASE_SPREAD);
            const bidPrice = Math.max(FOREX_PRICE_FLOOR, Math.min(askPrice * 0.999, rawBid));

            // --- Ask: sell F-currency on this trading planet ---
            if (!tradingAssets.market.sell[curName]) {
                tradingAssets.market.sell[curName] = { resource: curResource };
            }
            const offer = tradingAssets.market.sell[curName];
            offer.resource = curResource;
            offer.offerPrice = askPrice;
            offer.offerRetainment = 0;

            // --- Bid: buy F-currency on this trading planet (split across all N-1 trading planets) ---
            const deficit = Math.max(0, FOREX_MM_TARGET_DEPOSIT - foreignBalance);
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
