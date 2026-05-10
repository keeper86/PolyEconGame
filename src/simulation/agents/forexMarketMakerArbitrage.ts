import { FOREX_MM_ARBITRAGE_THRESHOLD, FOREX_MM_MAX_ARBITRAGE_FRACTION, TICKS_PER_MONTH } from '../constants';
import type { GameState, Planet, AgentPlanetAssets } from '../planet/planet';
import { getCurrencyResourceName, DEFAULT_EXCHANGE_RATE } from '../market/currencyResources';
import { nextRandom } from '../utils/stochasticRound';

/**
 * Probabilistic triangular arbitrage sweep for global forex market-makers.
 *
 * Each MM independently decides whether to sweep this tick by drawing from the
 * shared seeded PRNG with probability 1/TICKS_PER_MONTH.  This gives an
 * expected rate of once per month but breaks collective synchronisation — all
 * 10 MMs will not sweep in the same tick, avoiding coordinated price shocks.
 *
 * Triangular arbitrage:
 *   Given three distinct planets T, A, B, the MM checks whether a round-trip
 *   currency conversion T→A→B→T yields a profit:
 *
 *     rate_TA = T.marketPrices[curA]   (T-currency per 1 A-currency)
 *     rate_AB = A.marketPrices[curB]   (A-currency per 1 B-currency)
 *     rate_BT = B.marketPrices[curT]   (B-currency per 1 T-currency)
 *
 *     roundTrip = 1 / (rate_TA × rate_AB × rate_BT)
 *
 *   If roundTrip > 1 + THRESHOLD: execute three legs in sequence.
 *
 *   Leg 1 (on T): spend vol T-currency → receive vol/rate_TA A-currency
 *   Leg 2 (on A): spend aReceived A-currency → receive aReceived/rate_AB B-currency
 *   Leg 3 (on B): spend bReceived B-currency → receive bReceived/rate_BT T-currency
 *
 *   These are direct deposit transfers — no order book is involved.
 *   Monetary conservation holds: no money is created or destroyed.
 *
 * Volume per execution is capped at FOREX_MM_MAX_ARBITRAGE_FRACTION of the
 * MM's available T-currency balance, limiting exposure per arbitrage event.
 *
 * All permutations of (T, A, B) are checked so both directions of each
 * triangle are covered.
 */
export function forexMMArbitrageSweep(gameState: GameState): void {
    const planets = Array.from(gameState.planets.values());
    if (planets.length < 3) {
        return;
    }

    for (const mm of gameState.forexMarketMakers.values()) {
        // Each MM independently rolls for activation: ~once per month on average.
        if (nextRandom() >= 1 / TICKS_PER_MONTH) {
            continue;
        }

        sweepTriangular(mm.assets, planets);
    }
}

export function sweepTriangular(assets: Record<string, AgentPlanetAssets>, planets: Planet[]): void {
    const n = planets.length;

    for (let ti = 0; ti < n; ti++) {
        const planetT = planets[ti];
        const assetsT = assets[planetT.id];
        if (!assetsT) {
            continue;
        }

        const availableT = Math.max(0, assetsT.deposits - (assetsT.depositHold ?? 0));
        if (availableT < 1) {
            continue;
        }

        const curT = getCurrencyResourceName(planetT.id);

        for (let ai = 0; ai < n; ai++) {
            if (ai === ti) {
                continue;
            }
            const planetA = planets[ai];
            const assetsA = assets[planetA.id];
            if (!assetsA) {
                continue;
            }

            const curA = getCurrencyResourceName(planetA.id);
            // rate_TA: T-currency per 1 A-currency (price of A traded on T)
            const rate_TA = planetT.marketPrices[curA] ?? DEFAULT_EXCHANGE_RATE;
            if (rate_TA <= 0) {
                continue;
            }

            for (let bi = 0; bi < n; bi++) {
                if (bi === ti || bi === ai) {
                    continue;
                }
                const planetB = planets[bi];
                const assetsB = assets[planetB.id];
                if (!assetsB) {
                    continue;
                }

                const curB = getCurrencyResourceName(planetB.id);
                // rate_AB: A-currency per 1 B-currency (price of B traded on A)
                const rate_AB = planetA.marketPrices[curB] ?? DEFAULT_EXCHANGE_RATE;
                // rate_BT: B-currency per 1 T-currency (price of T traded on B)
                const rate_BT = planetB.marketPrices[curT] ?? DEFAULT_EXCHANGE_RATE;

                if (rate_AB <= 0 || rate_BT <= 0) {
                    continue;
                }

                // Round-trip gain per 1 unit of T spent:
                //   1 T → 1/rate_TA A → 1/(rate_TA·rate_AB) B → 1/(rate_TA·rate_AB·rate_BT) T
                const product = rate_TA * rate_AB * rate_BT;
                const roundTrip = 1 / product;

                if (roundTrip <= 1 + FOREX_MM_ARBITRAGE_THRESHOLD) {
                    continue;
                }

                // Cap volume to MAX_FRACTION of available T-currency balance.
                const vol = availableT * FOREX_MM_MAX_ARBITRAGE_FRACTION;
                if (vol < 1) {
                    continue;
                }

                const aReceived = vol / rate_TA;
                const bReceived = aReceived / rate_AB;
                const tReceived = bReceived / rate_BT;

                // Leg 1: spend T on planet T, receive A-currency
                assetsT.deposits -= vol;
                assetsA.deposits += aReceived;

                // Leg 2: spend A on planet A, receive B-currency
                assetsA.deposits -= aReceived;
                assetsB.deposits += bReceived;

                // Leg 3: spend B on planet B, receive T-currency
                assetsB.deposits -= bReceived;
                assetsT.deposits += tReceived;

                // Only execute the best triangle for this T to avoid chaining;
                // break out of both inner loops after first profitable trade.
                break;
            }
        }
    }
}
