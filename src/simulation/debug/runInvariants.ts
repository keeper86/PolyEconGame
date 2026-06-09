process.env.SIM_DEBUG = '1';

import { advanceTick, seedRng } from '../engine';
import { makeWorld } from '../utils/testHelper';

seedRng(42);

const TICKS = 30;

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
