/**
 * simulation/debug/runInvariants.ts
 *
 * Runs a small deterministic simulation with SIM_DEBUG=1 to verify
 * consistency invariants (population↔workforce, balance-sheet, etc.).
 *
 * Invariant checks are now inline assertions at their respective tick
 * lifecycle points (e.g. preProductionLaborMarketTick, populationTick, financialTick).
 * When SIM_DEBUG=1, violations throw immediately — so any error here
 * pinpoints the exact lifecycle step that broke the invariant.
 *
 * Run with: SIM_DEBUG=1 npx tsx src/simulation/debug/runInvariants.ts
 */

// Force SIM_DEBUG so inline assertions are active
process.env.SIM_DEBUG = '1';

import { advanceTick, seedRng } from '../engine';
import { makeWorld } from '../utils/testHelper';

seedRng(42);

const TICKS = 30; // simulate one month

const { gameState } = makeWorld({
    populationByEdu: { none: 500, primary: 300, secondary: 150, tertiary: 50 },
    companyIds: ['company-1'],
});

console.log(`Running ${TICKS} ticks with inline invariant assertions (SIM_DEBUG=1)...`);

try {
    for (let t = 1; t <= TICKS; t++) {
        gameState.tick = t;
        advanceTick(gameState);
    }
    console.log(`✓ All ${TICKS} ticks passed invariant checks.`);
    process.exit(0);
} catch (err) {
    console.error(`✗ Invariant failure:`, err instanceof Error ? err.message : err);
    process.exit(1);
}
