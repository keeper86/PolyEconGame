import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '../../src/simulation/constants';
import { advanceTick, seedRng } from '../../src/simulation/engine';
import { getAllFacilities } from '../../src/simulation/planet/planet';
import type { AgentPlanetAssets } from '../../src/simulation/planet/planet';
import { getFormStorageStarvation, getTransportStarvation, storageFormKeys, usageOfShell } from '../../src/simulation/planet/facility';
import {
    setStorageCapacityMonths,
    setStorageErrorZoomMonths,
    setStorageTargetMonths,
} from '../../src/simulation/planet/automaticProductionScale/runtimeConfig';
import { computeStorageSpaceFactor } from '../../src/simulation/planet/production';
import { buildBenchmarkWorld } from './world';

const arg = (name: string, fallback: number): number => {
    const found = process.argv.find((a) => a.startsWith(`--${name}=`));
    return found ? Number(found.split('=')[1]) : fallback;
};

interface Month {
    facilities: number;
    throttled: number;
    factorSum: number;
    factorMin: number;
    bids: number;
    notPlaced: number;
    dropped: number;
    solidUsed: number;
    solidCap: number;
    liquidUsed: number;
    liquidCap: number;
    piecesUsed: number;
    piecesCap: number;
    transportStarve: number;
    formStarve: number;
}

function sample(assets: AgentPlanetAssets): Month {
    const m: Month = {
        facilities: 0,
        throttled: 0,
        factorSum: 0,
        factorMin: 1,
        bids: 0,
        notPlaced: 0,
        dropped: 0,
        solidUsed: 0,
        solidCap: 0,
        liquidUsed: 0,
        liquidCap: 0,
        piecesUsed: 0,
        piecesCap: 0,
        transportStarve: getTransportStarvation(assets.storage),
        formStarve: 0,
    };
    for (const facility of getAllFacilities(assets)) {
        if (facility.type === 'ship_construction' || facility.produces?.length === 0 || facility.type === 'storage') {
            continue;
        }
        const factor = computeStorageSpaceFactor(facility, assets);
        m.facilities += 1;
        m.factorSum += factor;
        m.factorMin = Math.min(m.factorMin, factor);
        if (factor < 0.999) {
            m.throttled += 1;
        }
    }
    for (const bid of Object.values(assets.market.buy)) {
        m.bids += 1;
        if (bid.notPlaced) {
            m.notPlaced += 1;
        }
        if (bid.lastEffectiveQty === 0) {
            m.dropped += 1;
        }
    }
    for (const form of storageFormKeys()) {
        const shell = assets.storage.shells[form];
        const used = usageOfShell(shell);
        const cap = { volume: shell.capacity.volume * shell.maxScale, mass: shell.capacity.mass * shell.maxScale };
        if (form === 'solid') {
            m.solidUsed += used.volume;
            m.solidCap += cap.volume;
        } else if (form === 'liquid') {
            m.liquidUsed += used.volume;
            m.liquidCap += cap.volume;
        } else {
            m.piecesUsed += used.volume;
            m.piecesCap += cap.volume;
        }
        m.formStarve = Math.max(m.formStarve, getFormStorageStarvation(assets.storage, form));
    }
    return m;
}

function main(): void {
    const years = arg('years', 40);
    const target = arg('target', 6);
    setStorageTargetMonths(target);
    setStorageCapacityMonths(target + 1);
    setStorageErrorZoomMonths(1);
    seedRng(1001);
    const { gameState, planet } = buildBenchmarkWorld({
        population: 8_000_000_000,
        agentsPerProduct: 1,
        resourceMultiplier: 1_000_000,
        oilReservoirMultiplier: 1_000_000,
    });

    const acc: Month[] = [];
    const flush = (year: number): void => {
        if (acc.length === 0) {
            return;
        }
        const avg = (f: (m: Month) => number) => acc.reduce((s, m) => s + f(m), 0) / acc.length;
        console.log(
            `y${String(year).padStart(2)} | throttle ${avg((m) => m.throttled).toFixed(1)}/${avg((m) => m.facilities).toFixed(0)} fac ` +
                `meanF=${avg((m) => m.factorSum / Math.max(1, m.facilities)).toFixed(4)} minF=${Math.min(...acc.map((m) => m.factorMin)).toFixed(3)} | ` +
                `bids notPlaced ${avg((m) => m.notPlaced).toFixed(1)} dropped ${avg((m) => m.dropped).toFixed(1)}/${avg((m) => m.bids).toFixed(0)} | ` +
                `shell util solid ${(100 * avg((m) => m.solidUsed / Math.max(1, m.solidCap))).toFixed(1)}% ` +
                `liquid ${(100 * avg((m) => m.liquidUsed / Math.max(1, m.liquidCap))).toFixed(1)}% ` +
                `pieces ${(100 * avg((m) => m.piecesUsed / Math.max(1, m.piecesCap))).toFixed(1)}% | ` +
                `starve transport ${Math.max(...acc.map((m) => m.transportStarve)).toFixed(3)} form ${Math.max(...acc.map((m) => m.formStarve)).toFixed(3)}`,
        );
        acc.length = 0;
    };

    const totalTicks = years * TICKS_PER_YEAR;
    for (let t = 1; t <= totalTicks; t++) {
        gameState.tick = t;
        advanceTick(gameState);
        if (t % TICKS_PER_MONTH !== 0) {
            continue;
        }
        for (const agent of gameState.agents.values()) {
            const assets = agent.assets[planet.id];
            if (!assets || !assets.storage) {
                continue;
            }
            acc.push(sample(assets));
        }
        if (t % TICKS_PER_YEAR === 0) {
            flush(t / TICKS_PER_YEAR);
        }
    }
}

main();
