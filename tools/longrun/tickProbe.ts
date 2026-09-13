import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { AgentPlanetAssets, GameState } from '../../src/simulation/planet/planet';
import { getAllFacilities } from '../../src/simulation/planet/planet';
import { queryStorageFacility } from '../../src/simulation/planet/facility';
import type { ProductionFacility } from '../../src/simulation/planet/facility';
import { TICKS_PER_YEAR, TICKS_PER_MONTH } from '../../src/simulation/constants';
import { STORAGE_TARGET_MONTHS } from '../../src/simulation/planet/automaticProductionScale/constants';
import { computeFacilityStorageSignal } from '../../src/simulation/planet/automaticProductionScale/signalComputation';

const TICK_PROBE_ENV = 'TICK_PROBE';

const TARGETS = [
    'Fuel Refinery',
    'Chemical Refinery',
    'Maintenance Facility',
    'Iron Smelter',
    'Grocery Chain',
    'Agricultural Facility',
    'Water Facility',
    'Pesticide Plant',
    'Glass Factory',
    'Cement Plant',
    'Oil Well',
    'Construction Facility',
    'Logistics Hub',
    'Vehicle Factory',
] as const;

const COLUMNS = [
    'tick',
    'year',
    'facility',
    'scale',
    'maxScale',
    'scaleFrac',
    'smoothedSignal',
    'integral',
    'expansionIntegral',
    'contractionIntegral',
    'overallEfficiency',
    'worstResourceEfficiency',
    'out0Resource',
    'inv0',
    'target0',
    'err0',
    'out1Resource',
    'inv1',
    'target1',
    'err1',
    'out2Resource',
    'inv2',
    'target2',
    'err2',
    'maxError',
    'simStorageSignal',
    'inEff0',
    'inEff1',
    'inEff2',
    'workerEffWorst',
    'price0',
    'costFloor0',
    'springDev0',
    'baseFactor0',
    'netFactor0',
    'sellThrough0',
    'sold0',
    'effQty0',
    'retain0',
    'price1',
    'costFloor1',
    'springDev1',
    'baseFactor1',
    'netFactor1',
    'sellThrough1',
    'sold1',
    'effQty1',
    'retain1',
];

let started = false;

export function startTickProbe(outDir: string): void {
    started = false;
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, 'tickProbe.csv'), COLUMNS.join(',') + '\n');
    started = true;
}

function row(
    tick: number,
    facility: ProductionFacility,
    assets: AgentPlanetAssets,
): string {
    const outputs = facility.produces;
    const targetMonths = STORAGE_TARGET_MONTHS;
    const perOutput = (i: number): [string, number, number, number] => {
        const out = outputs[i];
        if (!out) {
            return ['', 0, 0, 0];
        }
        const inv = queryStorageFacility(assets.storage, out.resource.name, false);
        const tgt = targetMonths * TICKS_PER_MONTH * facility.maxScale * out.quantity;
        const err = tgt > 0 ? (tgt - inv) / Math.max(1e-9, tgt) : 0;
        return [out.resource.name.replace(/ /g, '_'), inv, tgt, Math.max(-1, Math.min(1, err))];
    };
    const [r0, i0, t0, e0] = perOutput(0);
    const [r1, i1, t1, e1] = perOutput(1);
    const [r2, i2, t2, e2] = perOutput(2);
    const pid = facility.pidState;
    return [
        String(tick),
        (tick / TICKS_PER_YEAR).toFixed(3),
        facility.name.replace(/ /g, '_'),
        facility.scale.toFixed(3),
        facility.maxScale.toFixed(3),
        facility.maxScale > 0 ? (facility.scale / facility.maxScale).toFixed(5) : '0',
        (pid?.smoothedSignal ?? 0).toFixed(5),
        (pid?.integral ?? 0).toFixed(6),
        (pid?.expansionIntegral ?? 0).toFixed(4),
        (pid?.contractionIntegral ?? 0).toFixed(4),
        (facility.lastTickResults?.overallEfficiency ?? 0).toFixed(5),
        Math.min(1, ...Object.values(facility.lastTickResults?.resourceEfficiency ?? { x: 1 })).toFixed(5),
        r0,
        i0.toFixed(2),
        t0.toFixed(2),
        e0.toFixed(5),
        r1,
        i1.toFixed(2),
        t1.toFixed(2),
        e1.toFixed(5),
        r2,
        i2.toFixed(2),
        t2.toFixed(2),
        e2.toFixed(5),
        Math.max(e0, e1, e2).toFixed(5),
        computeFacilityStorageSignal(facility, assets).maxError.toFixed(5),
        ...inputEfficiencies(facility),
        ...sellDiagnostics(assets, outputs[0]?.resource.name),
        ...sellDiagnostics(assets, outputs[1]?.resource.name),
    ].join(',');
}

function sellDiagnostics(
    assets: AgentPlanetAssets,
    resourceName: string | undefined,
): string[] {
    const blank = ['', '', '', '', '', '', '', '', ''];
    if (!resourceName) {
        return blank;
    }
    const offer = assets.market.sell[resourceName];
    const diagnostics = offer?.diagnostics;
    if (!diagnostics) {
        return blank;
    }
    const sold = offer?.lastSold;
    return [
        diagnostics.newPrice.toFixed(4),
        diagnostics.costFloor.toFixed(4),
        diagnostics.costSpringDeviation.toFixed(5),
        diagnostics.baseFactor.toFixed(5),
        diagnostics.netFactor.toFixed(5),
        diagnostics.smoothedSellThrough.toFixed(4),
        sold !== undefined ? sold.toFixed(2) : '',
        diagnostics.effectiveQuantity.toFixed(2),
        diagnostics.rawRetainment.toFixed(2),
    ];
}

function inputEfficiencies(facility: ProductionFacility): string[] {
    const effs = facility.needs.map((need) => facility.lastTickResults?.resourceEfficiency?.[need.resource.name] ?? 1);
    const worker = Object.values(facility.lastTickResults?.workerEfficiency ?? {});
    const worstWorker = worker.length > 0 ? Math.min(...worker.filter((v): v is number => typeof v === 'number')) : 1;
    return [
        (effs[0] ?? 1).toFixed(4),
        (effs[1] ?? 1).toFixed(4),
        (effs[2] ?? 1).toFixed(4),
        worstWorker.toFixed(4),
    ];
}

export function tickProbe(gameState: GameState, outDir: string): void {
    if (!started) {
        return;
    }
    const lines: string[] = [];
    for (const agent of gameState.agents.values()) {
        for (const assets of Object.values(agent.assets)) {
            if (!assets) {
                continue;
            }
            for (const fac of getAllFacilities(assets, false)) {
                if (fac.type !== 'production') {
                    continue;
                }
                const p = fac as ProductionFacility;
                if (!TARGETS.includes(p.name as (typeof TARGETS)[number])) {
                    continue;
                }
                lines.push(row(gameState.tick, p, assets));
            }
        }
    }
    appendFileSync(path.join(outDir, 'tickProbe.csv'), lines.join('\n') + (lines.length ? '\n' : ''));
}

export function tickProbeEnabled(): boolean {
    return process.env[TICK_PROBE_ENV] === '1';
}
