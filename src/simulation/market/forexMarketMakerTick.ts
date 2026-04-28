import { FOREX_MM_RETAIN_RATIO, FOREX_MM_TARGET_DEPOSIT } from '../constants';
import type { GameState } from '../planet/planet';

/**
 * Repayment tick for forex market-maker loans.
 *
 * Runs after forexTick() each tick.  For each MM and each planet where it
 * holds a loan, any deposits above the retention threshold are used to repay
 * the loan symmetrically (both bank.loans and bank.deposits shrink together,
 * preserving the monetary-conservation invariant).
 */
export function forexMMRepaymentTick(gameState: GameState): void {
    for (const mm of gameState.forexMarketMakers.values()) {
        for (const [planetId, assets] of Object.entries(mm.assets)) {
            if (assets.loans <= 0) {
                continue;
            }
            const planet = gameState.planets.get(planetId);
            if (!planet) {
                continue;
            }
            const retainThreshold = FOREX_MM_TARGET_DEPOSIT * FOREX_MM_RETAIN_RATIO;
            const excess = Math.max(0, assets.deposits - retainThreshold);
            const repayment = Math.min(assets.loans, excess);
            if (repayment <= 0) {
                continue;
            }
            assets.deposits -= repayment;
            assets.loans -= repayment;
            planet.bank.loans -= repayment;
            planet.bank.deposits -= repayment;
        }
    }
}
