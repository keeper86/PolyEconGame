import fs from 'node:fs';
import path from 'node:path';

import { TICKS_PER_MONTH, WAGE_SHARE } from '../../src/simulation/constants';
import { advanceTick } from '../../src/simulation/engine';
import type { GameState } from '../../src/simulation/planet/planet';
import { educationLevelKeys } from '../../src/simulation/population/education';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { setRngState } from '../../src/simulation/utils/stochasticRound';
import { betterOfferStats, computeLaborMarket, outsideIncome } from '../../src/simulation/workforce/laborMarket';
import { totalActiveForEdu } from '../../src/simulation/workforce/workforceAggregates';

const outDir = process.argv[2];
if (!outDir) {
    throw new Error('usage: laborQuitProbe.ts <results-dir>');
}
const OUT = path.join(outDir, 'laborQuitProbe.tsv');
const TICKS = Number(process.env.QUIT_TICKS ?? 30);
const clampUnit = (v: number): number => Math.max(-1, Math.min(1, v));

function main(): void {
    const meta = JSON.parse(fs.readFileSync(path.join(outDir, 'checkpoint.json'), 'utf8')) as {
        tick: number;
        rng: [number, number];
    };
    const gs: GameState = deserializeSnapshot(fs.readFileSync(path.join(outDir, 'checkpoint.bin')));
    setRngState(meta.rng);
    const planetId = gs.planets.keys().next().value as string;
    const planet = gs.planets.get(planetId)!;
    const rows: string[] = [];

    for (let k = 0; k < TICKS; k++) {
        gs.tick = meta.tick + 1 + k;
        advanceTick(gs);
        const lm = computeLaborMarket(gs.agents, planet);
        for (const agent of gs.agents.values()) {
            const a = agent.assets[planetId];
            if (!a?.workforceDemography) {
                continue;
            }
            const fairWageBase = WAGE_SHARE * (a._smoothedWageCeiling ?? 0);
            for (const edu of educationLevelKeys) {
                const active = totalActiveForEdu(a.workforceDemography, edu);
                if (active <= 0) {
                    continue;
                }
                const wage = a.wagePerEdu[edu] ?? 0;
                const better = betterOfferStats(lm.reachableVacancySteps[edu], wage);
                const tightness = lm.reachableTightness[edu] * better.share;
                const outside = outsideIncome(tightness, better.medianWage);
                const exitGap = wage > 0 ? clampUnit((outside - wage) / wage) : 0;
                const fairnessGap = fairWageBase > 0 ? clampUnit((fairWageBase - wage) / fairWageBase) : 0;
                const quitRate = Math.max(
                    0,
                    Math.min(0.05 * exitGap + 0.005 * fairnessGap, 0.002),
                );
                rows.push(
                    [
                        gs.tick,
                        gs.tick % TICKS_PER_MONTH,
                        agent.id,
                        edu,
                        wage.toFixed(4),
                        fairWageBase.toFixed(4),
                        lm.reachableTightness[edu].toFixed(6),
                        better.share.toFixed(6),
                        tightness.toFixed(6),
                        better.medianWage.toFixed(4),
                        outside.toFixed(4),
                        exitGap.toFixed(4),
                        fairnessGap.toFixed(4),
                        quitRate.toFixed(6),
                        active.toFixed(0),
                        (active * quitRate).toFixed(2),
                    ].join('\t'),
                );
            }
        }
    }

    fs.writeFileSync(
        OUT,
        [
            'tick',
            'dayOfMonth',
            'agent',
            'edu',
            'wage',
            'fairWage',
            'reachTightness',
            'betterShare',
            'tightness',
            'betterMedianWage',
            'outside',
            'exitGap',
            'fairnessGap',
            'quitRate',
            'active',
            'expectedQuits',
        ].join('\t') +
            '\n' +
            rows.join('\n') +
            '\n',
    );
    console.log(`done ${rows.length} rows -> ${OUT}`);
}

main();
