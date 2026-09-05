import fs from 'node:fs';
import path from 'node:path';

import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '../../src/simulation/constants';
import { advanceTick } from '../../src/simulation/engine';
import { queryStorageFacility } from '../../src/simulation/planet/facility';
import type { GameState } from '../../src/simulation/planet/planet';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { setRngState } from '../../src/simulation/utils/stochasticRound';
import { sampleMetrics } from './metrics';

const CKPT_DIR = path.join(__dirname, 'results', '_sf2-y250-ckpt');
const OUT_FILE = path.join(__dirname, 'results', 'plasticProbe.csv');

const RES = ['Plastic', 'Electronics', 'Steel', 'Fuel', 'Maintenance', 'Silicon Wafer'] as const;
const FAC = ['Maintenance Facility', 'Electronics Factory', 'Oil Refinery', 'Silicon Wafer Factory'] as const;

function arg(name: string): string | undefined {
    const prefix = `--${name}=`;
    const found = process.argv.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
}

type Entry = {
    id: string;
    name: string;
    assets: any;
    facilities: string[];
};

function collect(gameState: GameState, planetId: string): Record<string, Entry[]> {
    const byType: Record<string, Entry[]> = {};
    for (const name of FAC) {
        byType[name] = [];
    }
    for (const agent of gameState.agents.values()) {
        const assets = agent.assets[planetId];
        if (!assets) {
            continue;
        }
        const owned = assets.productionFacilities.map((f: { name: string }) => f.name);
        const hit = owned.filter((n: string) => (FAC as readonly string[]).includes(n));
        for (const f of new Set(hit)) {
            byType[f].push({ id: agent.id, name: agent.name, assets, facilities: owned });
        }
    }
    return byType;
}

function storageOf(assets: any, name: string): number {
    return queryStorageFacility(assets.storageFacility, name);
}

function market(assets: any): { sell: Record<string, any>; buy: Record<string, any> } {
    return assets.market ?? { sell: {}, buy: {} };
}

function main(): void {
    const meta = JSON.parse(
        fs.readFileSync(path.join(CKPT_DIR, 'checkpoint.json'), 'utf8'),
    ) as { tick: number; rng: [number, number] };
    const gameState: GameState = deserializeSnapshot(fs.readFileSync(path.join(CKPT_DIR, 'checkpoint.bin')));
    setRngState(meta.rng);
    const planetId = gameState.planets.keys().next().value as string;
    const planet = gameState.planets.get(planetId) as NonNullable<ReturnType<GameState['planets']['get']>>;

    const byType = collect(gameState, planetId);
    const inspect = process.argv.includes('--inspect');
    for (const name of FAC) {
        console.log(`${name}: ${byType[name].length} agents`);
        for (const g of byType[name]) {
            console.log(`   ${g.id} ${g.name} facilities=${g.facilities.join(', ')}`);
            if (inspect) {
                const mk = market(g.assets);
                const fac = g.assets.productionFacilities.find((f: { name: string }) => f.name === name);
                const ins =
                    name === 'Maintenance Facility'
                        ? ['Plastic', 'Electronics', 'Steel']
                        : name === 'Electronics Factory'
                          ? ['Plastic', 'Silicon Wafer', 'Copper']
                          : ['Crude Oil'];
                const insState = ins
                    .map((r) => `${r.toLowerCase()}:stor=${Math.round(storageOf(g.assets, r))},buyLast=${mk.buy[r]?.lastBought ?? 0},bid=${mk.buy[r]?.bidPrice ?? 0}`)
                    .join(' | ');
                console.log(
                    `      dep=${Math.round(g.assets.deposits)} scale=${fac?.scale ?? 0} max=${fac?.maxScale ?? 0} loans=${g.assets.activeLoans.length} ${insState}`,
                );
            }
        }
    }

    const years = inspect ? 0 : Number(arg('years') ?? 16);
    const startTick = meta.tick;
    const totalTicks = years * TICKS_PER_YEAR;
    const groupKey: Record<string, string> = { M: 'Maintenance Facility', E: 'Electronics Factory', R: 'Oil Refinery' };
    const outRes: Record<string, string> = { M: 'Maintenance', E: 'Electronics', R: 'Fuel' };
    const inRes: Record<string, readonly string[]> = { M: ['Plastic', 'Electronics', 'Steel'], E: ['Plastic', 'Silicon Wafer', 'Copper'], R: ['Crude Oil'] };

    if (years > 0) {
        const headers: string[] = [];
        for (const [label, facName] of Object.entries(groupKey)) {
            const list = byType[facName];
            for (let k = 0; k < list.length; k++) {
                headers.push(`${label}${k}_id`, `${label}${k}_dep`, `${label}${k}_scale`, `${label}${k}_out`, `${label}${k}_eff`);
                for (const r of inRes[label]) {
                    headers.push(`${label}${k}_stor_${r}`, `${label}${k}_buyLast_${r}`, `${label}${k}_buyPrice_${r}`);
                }
                headers.push(`${label}${k}_sellLast`, `${label}${k}_sellPrice`);
            }
        }
        const resCols = RES.flatMap((r) => [`${r}Vol`, `${r}Dem`, `${r}Sup`, `${r}Price`, `${r}Unfill`]);
        fs.writeFileSync(OUT_FILE, ['tick', 'year', 'pop', 'cond', ...resCols, ...headers].join(',') + '\n');
    }

    if (years === 0) {
        return;
    }

    const t0 = process.hrtime.bigint();
    for (let i = 1; i <= totalTicks; i++) {
        const t = startTick + i;
        gameState.tick = t;
        advanceTick(gameState);
        if (i % TICKS_PER_MONTH !== 0) {
            continue;
        }
        const metrics = sampleMetrics(gameState);
        const mr = planet.lastMarketResult;
        const cols: Array<string | number> = [t, t / TICKS_PER_YEAR, metrics.totalPopulation, metrics.avgFacilityCondition];
        for (const res of RES) {
            const m = mr[res];
            cols.push(m?.totalVolume ?? 0, m?.totalDemand ?? 0, m?.totalSupply ?? 0, m?.clearingPrice ?? 0, m?.unfilledDemand ?? 0);
        }
        const current = collect(gameState, planetId);
        for (const [label, facName] of Object.entries(groupKey)) {
            const list = current[facName];
            for (let k = 0; k < list.length; k++) {
                const { assets } = list[k];
                const mk = market(assets);
                const fac = assets.productionFacilities.find((f: { name: string }) => f.name === facName);
                cols.push(
                    list[k].id,
                    Math.round(assets.deposits),
                    fac?.scale ?? 0,
                    fac?.lastTickResults?.lastProduced?.[outRes[label]] ?? 0,
                    fac?.lastTickResults?.overallEfficiency ?? 0,
                );
                for (const r of inRes[label]) {
                    cols.push(Math.round(storageOf(assets, r)), mk.buy[r]?.lastBought ?? 0, mk.buy[r]?.bidPrice ?? 0);
                }
                const offer = mk.sell[outRes[label]];
                cols.push(offer?.lastSold ?? 0, offer?.offerPrice ?? offer?.lastOfferPrice ?? 0);
            }
        }
        fs.appendFileSync(
            OUT_FILE,
            cols.map((c) => (typeof c === 'number' && Math.abs(c) >= 1e5 ? Math.round(c).toString() : String(c))).join(',') + '\n',
        );
    }
    const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`probe done: ${years}y in ${(elapsedMs / 1000).toFixed(0)}s → ${OUT_FILE}`);
}

main();

