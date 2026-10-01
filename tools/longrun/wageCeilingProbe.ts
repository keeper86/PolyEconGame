import fs from 'node:fs';
import path from 'node:path';
import type { GameState } from '../../src/simulation/planet/planet';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';

const outDir = process.argv[2];
if (!outDir) {
    throw new Error('usage: wageCeilingProbe.ts <results-dir>');
}

const state = deserializeSnapshot(fs.readFileSync(path.join(outDir, 'checkpoint.bin'))) as GameState;
console.log(`tick=${state.tick} (y=${(state.tick / 360).toFixed(1)})`);

state.planets.forEach((planet) => {
    const floors = planet.lastProductionCostFloors;
    state.agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets) {
            return;
        }
        const last = assets.lastMonthAcc;
        let costValue = 0;
        let marketValue = 0;
        const detail: string[] = [];
        for (const [name, produced] of Object.entries(last.producedResources)) {
            const floor = floors[name] ?? 0;
            const price = planet.marketPrices[name] ?? 0;
            costValue += produced.quantity * floor;
            marketValue += produced.quantity * price;
            if (produced.quantity > 0) {
                detail.push(`${name}:q=${produced.quantity.toFixed(1)},floor=${floor.toFixed(3)},price=${price.toFixed(3)}`);
            }
        }
        const workers = Object.values(assets.wagePerEdu ?? {}).length;
        console.log(
            `\n${agent.name} (${agent.id}) workers=${workers}\n` +
                `  costValue(floors)=${costValue.toFixed(1)} marketValue=${marketValue.toFixed(1)} ratio=${(costValue / (marketValue || 1)).toFixed(3)}\n` +
                `  consumptionValue=${last.consumptionValue.toFixed(1)} purchases=${last.purchases.toFixed(1)} claims=${last.claimPayments.toFixed(1)} revenue=${last.revenue.toFixed(1)} wages=${last.wages.toFixed(1)} workerTicks=${last.totalWorkersTicks.toFixed(0)}\n` +
                `  wagePerEdu=${JSON.stringify(assets.wagePerEdu)} ceilingHistory=[]\n` +
                `  ${detail.slice(0, 6).join(' | ')}`,
        );
    });
});
