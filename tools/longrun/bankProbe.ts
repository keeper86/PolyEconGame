import fs from 'node:fs';
import path from 'node:path';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { bankEquity, type GameState } from '../../src/simulation/planet/planet';

const outDir = process.argv[2];
if (!outDir) {
    throw new Error('usage: bankProbe.ts <results-dir>');
}

const state = deserializeSnapshot(fs.readFileSync(path.join(outDir, 'checkpoint.bin'))) as GameState;
console.log(`tick=${state.tick} (y=${(state.tick / 360).toFixed(1)})`);
state.planets.forEach((planet) => {
    const bank = planet.bank;
    const equity = bankEquity(bank);
    const ratio = bank.loans > 0 ? equity / bank.loans : 0;
    console.log(
        `${planet.name}: loans=${bank.loans.toExponential(3)} deposits=${bank.deposits.toExponential(3)} ` +
            `equity=${equity.toExponential(3)} ratio=${ratio.toFixed(3)} ` +
            `policyEquityEma=${bank.policyEquityEma.toFixed(4)} rate=${bank.loanRatePerYear.toFixed(4)}`,
    );
});
