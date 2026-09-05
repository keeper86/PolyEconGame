import fs from 'node:fs';
import path from 'node:path';

import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '../../src/simulation/constants';
import { advanceTick } from '../../src/simulation/engine';
import { queryStorageFacility } from '../../src/simulation/planet/facility';
import type { GameState } from '../../src/simulation/planet/planet';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { setRngState } from '../../src/simulation/utils/stochasticRound';

const CKPT = path.join(__dirname, 'results', '1agent-flare-6000-8b');
const OUT = path.join(__dirname, 'results', 'flareChemProbe.tsv');

function num(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function main(): void {
    const meta = JSON.parse(fs.readFileSync(path.join(CKPT, 'checkpoint.json'), 'utf8')) as { tick: number; rng: [number, number] };
    const gs: GameState = deserializeSnapshot(fs.readFileSync(path.join(CKPT, 'checkpoint.bin')));
    setRngState(meta.rng);
    const planetId = gs.planets.keys().next().value as string;
    const planet = gs.planets.get(planetId) as NonNullable<ReturnType<GameState['planets']['get']>>;
    for (const agent of gs.agents.values()) {
        const assets = agent.assets[planetId];
        for (const facility of assets?.productionFacilities ?? []) {
            if (facility.name === 'Oil Refinery') {
                facility.wasteSurplusTicks = 120;
            }
        }
    }
    const end = Math.round(104.0 * TICKS_PER_YEAR);
    const rows: string[] = [];

    for (let t = meta.tick + 1; t <= end; t++) {
        gs.tick = t;
        advanceTick(gs);
        if (t % TICKS_PER_MONTH !== 0) {
            continue;
        }
        const out: string[] = [String(t), (t / TICKS_PER_YEAR).toFixed(3)];
        for (const agent of gs.agents.values()) {
            const assets = agent.assets[planetId];
            if (!assets) {
                continue;
            }
            for (const fac of assets.productionFacilities) {
                if (fac.name === 'Oil Refinery') {
                    const mk = assets.market ?? { sell: {}, buy: {} };
                    const pid = fac.pidState;
                    const mix = fac.productionMix ?? {};
                    out.push(
                        'R',
                        `scale${num(fac.scale).toFixed(0)}`,
                        `mx${num(fac.maxScale).toFixed(0)}`,
                        `dep${num(assets.deposits).toFixed(0)}`,
                        `sig${num(pid?.smoothedSignal).toFixed(2)}`,
                        `eI${num(pid?.expansionIntegral).toFixed(0)}`,
                        `cI${num(pid?.contractionIntegral).toFixed(0)}`,
                        `oe${num(fac.lastTickResults?.overallEfficiency).toFixed(2)}`,
                        `crude${num(queryStorageFacility(assets.storageFacility, 'Crude Oil')).toFixed(0)}`,
                        `crudeBuy${num(mk.buy['Crude Oil']?.lastBought).toFixed(0)}`,
                        `crudeBid${num(mk.buy['Crude Oil']?.bidPrice).toFixed(2)}`,
                        `loans${assets.activeLoans.length}`,
                        `cons${assets.constructionContracts.length}`,
                        `mixC${num(mix['Chemical']).toFixed(2)}`,
                        `mixF${num(mix['Fuel']).toFixed(2)}`,
                    );
                    for (const res of ['Fuel', 'Plastic', 'Chemical']) {
                        out.push(`${res}Out${num(fac.lastTickResults?.lastProduced?.[res]).toFixed(0)}`, `${res}Ask${num(mk.sell[res]?.offerPrice ?? mk.sell[res]?.lastOfferPrice).toFixed(2)}`, `${res}Sold${num(mk.sell[res]?.lastSold).toFixed(0)}`);
                    }
                }
            }
            const chemFacs = assets.productionFacilities.filter((f) => f.needs.some((n) => n.resource.name === 'Chemical'));
            for (const fac of chemFacs) {
                const mk = assets.market ?? { sell: {}, buy: {} };
                const resEff = fac.lastTickResults?.resourceEfficiency?.['Chemical'];
                out.push(
                    'C',
                    fac.name.replaceAll(' ', ''),
                    `s${num(fac.scale).toFixed(0)}`,
                    `mx${num(fac.maxScale).toFixed(0)}`,
                    `stor${num(queryStorageFacility(assets.storageFacility, 'Chemical')).toFixed(0)}`,
                    `buyLast${num(mk.buy['Chemical']?.lastBought).toFixed(0)}`,
                    `bid${num(mk.buy['Chemical']?.bidPrice).toFixed(2)}`,
                    `re${num(resEff).toFixed(2)}`,
                    `out${num(fac.lastTickResults?.lastProduced?.[fac.produces[0]?.resource.name ?? '']).toFixed(0)}`,
                    `dep${num(assets.deposits).toFixed(0)}`,
                );
            }
        }
        const m = planet.lastMarketResult;
        out.push(`mkChemP${num(m['Chemical']?.clearingPrice).toFixed(2)}`, `mkChemU${num(m['Chemical']?.unfilledDemand).toFixed(0)}`);
        out.push(`foodP${num(planet.marketPrices['Food'] ?? 0).toFixed(2)}`);
        rows.push(out.join('\t'));
    }
    fs.writeFileSync(OUT, rows.join('\n') + '\n');
    console.log(`done ${rows.length} rows → ${OUT}`);
}

main();
