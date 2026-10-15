import fs from 'node:fs';
import path from 'node:path';

import type { GameState } from '../../src/simulation/planet/planet';
import { educationLevelKeys } from '../../src/simulation/population/education';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import {
    acceptProbability,
    computeLaborMarket,
    reservationWage,
    smoothedReachableVacancyWage,
} from '../../src/simulation/workforce/laborMarket';
import { maxHiresPerTick } from '../../src/simulation/workforce/hireWorkforce';

const dir = path.join(__dirname, 'results', process.argv[2] ?? 'player-base10');
const gs: GameState = deserializeSnapshot(fs.readFileSync(path.join(dir, 'checkpoint.bin')));
const planet = gs.planets.values().next().value!;
const market = computeLaborMarket(gs.agents, planet);

const hires = [...gs.agents.values()]
    .map((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets) {
            return { name: agent.name, hrScale: 0, perTick: 0, unocc: 0 };
        }
        return {
            name: agent.name,
            hrScale: assets.humanResourcesDepartment?.scale ?? 0,
            perTick: maxHiresPerTick(assets),
            unocc: 0,
        };
    })
    .sort((a, b) => b.perTick - a.perTick);
const totalPerTick = hires.reduce((sum, h) => sum + (Number.isFinite(h.perTick) ? h.perTick : 0), 0);
console.log(`agents=${gs.agents.size}  sum(maxHiresPerTick)=${totalPerTick.toFixed(0)} per tick`);
for (const h of hires.slice(0, 6)) {
    console.log(`  ${h.name.padEnd(28)} hrScale=${h.hrScale.toFixed(1)} maxHiresPerTick=${h.perTick.toFixed(0)}`);
}

console.log(`planet wage = ${JSON.stringify(planet.wagePerEdu)}`);
console.log(
    `smoothedVacancyWage = ${JSON.stringify(planet._smoothedReachableVacancyWage ?? {})}`,
);
for (const edu of educationLevelKeys) {
    const raw = market.reachableVacancyWage[edu];
    const smoothed = smoothedReachableVacancyWage(planet, edu, raw);
    const threshold = reservationWage(market.reachableTightness[edu], smoothed);
    const wage = planet.wagePerEdu[edu] ?? 0;
    const prob = acceptProbability(wage, threshold);
    let unocc = 0;
    let willing = 0;
    for (const cohort of planet.population.demography) {
        const avail = cohort.unoccupied[edu].total;
        unocc += avail;
        willing += avail * prob;
    }
    console.log(
        `${edu.padEnd(9)} tight=${market.reachableTightness[edu].toFixed(5)} ` +
            `vacWage=${raw.toFixed(3)} smoothed=${smoothed.toFixed(3)} threshold=${threshold.toFixed(3)} ` +
            `wage=${wage.toFixed(3)} acceptProb=${prob.toFixed(5)} unocc=${unocc.toFixed(0)} totalWilling=${willing.toFixed(2)}`,
    );
}
