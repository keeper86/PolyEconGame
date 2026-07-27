#!/usr/bin/env tsx
/**
 * Chain-sim parameter sweep: runs the chain simulation across a grid of
 * pricing + PID parameter combinations and classifies stability.
 *
 * Usage:
 *   npx tsx tools/benchmark/node/chainSimSweep.ts
 *   npx tsx tools/benchmark/node/chainSimSweep.ts --out=my-results.json
 *   npx tsx tools/benchmark/node/chainSimSweep.ts --fast   # reduced grid (~1 min)
 *
 * Output: JSON report to stdout and/or file.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
    runChainSimulation,
    getOscillationAmplitude,
    getNodeSeries,
    type ChainSimConfig,
    type ChainNodeConfig,
    type PidParams,
    type PricingParams,
    type DemandModel,
    type SimSnapshot,
} from '../../../src/app/supply-chain/chain-sim/_components/chainSimulator';

// =============================================================================
// Types
// =============================================================================

interface SweepRun {
    runId: number;
    params: {
        kp: number;
        ki: number;
        outMax: number;
        priceAdjustMaxUp: number;
        priceAdjustMaxDown: number;
        costSpringStrength: number;
        targetSellThrough: number;
        inputBufferTargetTicks: number;
        outputBufferTicks: number;
    };
    metrics: {
        finalScale: Record<string, number>;
        finalInventory: Record<string, number>;
        meanInventory: Record<string, number>;
        scaleOscillation: Record<string, number>;
        priceOscillation: Record<string, number>;
        /** ticks where any node had zero output inventory */
        supplyChainBreakTicks: number;
        /** ticks until all nodes' scale oscillation drops below 5% (or -1) */
        settlingTick: number;
        /** max price / costFloor ratio across nodes (inflation indicator) */
        maxPriceToCostRatio: number;
        /** final signal for each node */
        finalSignal: Record<string, number>;
    };
    classification: 'stable' | 'oscillating' | 'breaking' | 'stagnating';
}

interface SweepReport {
    timestamp: string;
    numTicks: number;
    demandModel: DemandModel;
    nodeConfigs: ChainNodeConfig[];
    totalRuns: number;
    summary: {
        stable: number;
        oscillating: number;
        breaking: number;
        stagnating: number;
    };
    runs: SweepRun[];
    bestParams: {
        stable: SweepRun['params'] | null;
        fastSettling: SweepRun['params'] | null;
        lowOscillation: SweepRun['params'] | null;
    };
}

// =============================================================================
// Default chain (same as chainSimulator.ts)
// =============================================================================

const DEFAULT_NODES: ChainNodeConfig[] = [
    {
        name: 'Mine',
        id: 'mine',
        costFloor: 10,
        maxScale: 200,
        initialScale: 100,
        outputPerScalePerTick: 1,
        inputPerScalePerTick: 0,
        inputResource: null,
        outputResource: 'ore',
    },
    {
        name: 'Smelter',
        id: 'smelter',
        costFloor: 25,
        maxScale: 120,
        initialScale: 60,
        outputPerScalePerTick: 1,
        inputPerScalePerTick: 2,
        inputResource: 'ore',
        outputResource: 'ingot',
    },
    {
        name: 'Factory',
        id: 'factory',
        costFloor: 50,
        maxScale: 80,
        initialScale: 40,
        outputPerScalePerTick: 1,
        inputPerScalePerTick: 2,
        inputResource: 'ingot',
        outputResource: 'widget',
        hasPopulationDemand: true,
    },
];

// =============================================================================
// Demand scenarios
// =============================================================================

const DEMAND_SCENARIOS: Record<string, DemandModel> = {
    baseline: { type: 'constant', demandPerTick: 40 },
    stepDown70: { type: 'step', initial: 40, afterTick: 1800, newValue: 12 },
    stepDown50: { type: 'step', initial: 40, afterTick: 1800, newValue: 20 },
    stepUp: { type: 'step', initial: 20, afterTick: 1800, newValue: 60 },
    sineMed: { type: 'sine', mean: 40, amplitude: 20, periodTicks: 720 },
    sineLarge: { type: 'sine', mean: 40, amplitude: 30, periodTicks: 720 },
};

// =============================================================================
// Parameter grids
// =============================================================================

interface ParamGrid {
    kp: number[];
    ki: number[];
    outMax: number[];
    priceAdjustMaxUp: number[];
    priceAdjustMaxDown: number[];
    costSpringStrength: number[];
    targetSellThrough: number[];
    inputBufferTargetTicks: number[];
    outputBufferTicks: number[];
}

function fullGrid(): ParamGrid {
    return {
        kp: [0.01, 0.033, 0.05, 0.08],
        ki: [0.0001, 0.001, 0.005],
        outMax: [0.01, 0.033, 0.05],
        priceAdjustMaxUp: [1.01, 1.03, 1.05, 1.10],
        priceAdjustMaxDown: [0.90, 0.95, 0.97, 0.99],
        costSpringStrength: [0, 0.05, 0.10, 0.30],
        targetSellThrough: [0.80, 0.90, 0.95],
        inputBufferTargetTicks: [10, 30, 60],
        outputBufferTicks: [0, 5, 10, 20],
    };
}

function fastGrid(): ParamGrid {
    return {
        kp: [0.01, 0.033, 0.08],
        ki: [0.0001, 0.001, 0.005],
        outMax: [0.033],
        priceAdjustMaxUp: [1.01, 1.05, 1.10],
        priceAdjustMaxDown: [0.90, 0.95, 0.99],
        costSpringStrength: [0, 0.10, 0.30],
        targetSellThrough: [0.80, 0.90, 0.95],
        inputBufferTargetTicks: [30],
        outputBufferTicks: [0, 10],
    };
}

// =============================================================================
// Sweep runner
// =============================================================================

const SETTLE_OSCILLATION_THRESHOLD = 0.05; // 5% amplitude = settled
const SETTLE_MIN_WINDOW = 120; // ticks of stability to declare settled

const NUM_TICKS = 3600; // 10 years
const WARMUP_TICKS = 600; // skip first 600 ticks for metrics

function classifyRun(metrics: SweepRun['metrics']): SweepRun['classification'] {
    // 1) Supply chain breakage
    if (metrics.supplyChainBreakTicks > 60) {
        return 'breaking';
    }

    // 2) Stagnating: signal stuck near zero, inventory unchanged, no oscillation
    const maxOsc = Math.max(...Object.values(metrics.scaleOscillation));
    const meanInv = Object.values(metrics.meanInventory).reduce((a, b) => a + b, 0) / Object.values(metrics.meanInventory).length;
    const finalInv = Object.values(metrics.finalInventory).reduce((a, b) => a + b, 0);

    if (maxOsc < 0.01 && meanInv < 10 && finalInv < 10) {
        return 'stagnating';
    }

    // 3) Oscillation
    if (maxOsc > SETTLE_OSCILLATION_THRESHOLD) {
        return 'oscillating';
    }

    return 'stable';
}

function computeMetrics(
    snapshots: SimSnapshot[],
    nodes: ChainNodeConfig[],
): SweepRun['metrics'] {
    const warmSnaps = snapshots.slice(WARMUP_TICKS);
    if (warmSnaps.length === 0) {
        return {
            finalScale: {},
            finalInventory: {},
            meanInventory: {},
            scaleOscillation: {},
            priceOscillation: {},
            supplyChainBreakTicks: snapshots.length,
            settlingTick: -1,
            maxPriceToCostRatio: 0,
            finalSignal: {},
        };
    }

    const final = warmSnaps[warmSnaps.length - 1];

    let supplyChainBreakTicks = 0;
    for (const snap of warmSnaps) {
        let anyZero = false;
        for (const nc of nodes) {
            if ((snap.nodes[nc.id]?.inventory ?? 0) < 0.01) {
                anyZero = true;
                break;
            }
        }
        if (anyZero) {
            supplyChainBreakTicks++;
        }
    }

    // Settling tick: find first point after which oscillation stays below threshold
    let settlingTick = -1;
    if (warmSnaps.length > SETTLE_MIN_WINDOW) {
        for (let i = 0; i <= warmSnaps.length - SETTLE_MIN_WINDOW; i++) {
            const window = warmSnaps.slice(i, i + SETTLE_MIN_WINDOW);
            const allSettled = nodes.every((nc) => {
                const series = window.map((s) => s.nodes[nc.id]?.scale ?? 0);
                const mean = series.reduce((a, b) => a + b, 0) / series.length;
                const maxDev = Math.max(...series.map((v) => Math.abs(v - mean)));
                return mean > 0 ? maxDev / mean < SETTLE_OSCILLATION_THRESHOLD : true;
            });
            if (allSettled) {
                settlingTick = warmSnaps[i].tick;
                break;
            }
        }
    }

    // Oscillation amplitudes (use last 1000 ticks for stability measurement)
    const recentSnaps = warmSnaps.slice(-1000);
    const scaleOscillation: Record<string, number> = {};
    const priceOscillation: Record<string, number> = {};
    for (const nc of nodes) {
        const scales = recentSnaps.map((s) => s.nodes[nc.id]?.scale ?? 0);
        const prices = recentSnaps.map((s) => s.nodes[nc.id]?.price ?? 0);
        scaleOscillation[nc.id] = getOscillationAmplitude(scales);
        priceOscillation[nc.id] = getOscillationAmplitude(prices);
    }

    // Mean inventory (normalized by initial)
    const meanInventory: Record<string, number> = {};
    for (const nc of nodes) {
        const invs = warmSnaps.map((s) => s.nodes[nc.id]?.inventory ?? 0);
        meanInventory[nc.id] = invs.reduce((a, b) => a + b, 0) / invs.length;
    }

    // Max price / cost floor ratio
    let maxPriceToCostRatio = 0;
    for (const nc of nodes) {
        const lastState = final.nodes[nc.id];
        if (lastState && nc.costFloor > 0) {
            const ratio = lastState.price / nc.costFloor;
            if (ratio > maxPriceToCostRatio) {
                maxPriceToCostRatio = ratio;
            }
        }
    }

    const finalScale: Record<string, number> = {};
    const finalInventory: Record<string, number> = {};
    const finalSignal: Record<string, number> = {};
    for (const nc of nodes) {
        finalScale[nc.id] = final.nodes[nc.id]?.scale ?? 0;
        finalInventory[nc.id] = final.nodes[nc.id]?.inventory ?? 0;
        finalSignal[nc.id] = final.nodes[nc.id]?.signal ?? 0;
    }

    return {
        finalScale,
        finalInventory,
        meanInventory,
        scaleOscillation,
        priceOscillation,
        supplyChainBreakTicks,
        settlingTick,
        maxPriceToCostRatio,
        finalSignal,
    };
}

function runSweep(
    nodes: ChainNodeConfig[],
    demand: DemandModel,
    grid: ParamGrid,
    numTicks: number,
): SweepRun[] {
    const runs: SweepRun[] = [];
    let runId = 0;

    for (const kp of grid.kp) {
        for (const ki of grid.ki) {
            for (const outMax of grid.outMax) {
                for (const priceAdjustMaxUp of grid.priceAdjustMaxUp) {
                    for (const priceAdjustMaxDown of grid.priceAdjustMaxDown) {
                        for (const costSpringStrength of grid.costSpringStrength) {
                            for (const targetSellThrough of grid.targetSellThrough) {
                                for (const inputBufferTargetTicks of grid.inputBufferTargetTicks) {
                                    for (const outputBufferTicks of grid.outputBufferTicks) {
                                        const pid: PidParams = {
                                            kp,
                                            ki,
                                            kd: 0.01,
                                            iMax: 0.025,
                                            outMax,
                                            dAlpha: 0.3,
                                        };
                                        const pricing: PricingParams = {
                                            priceAdjustMaxUp,
                                            priceAdjustMaxDown,
                                            costSpringStrength,
                                            targetSellThrough,
                                            automatedCostFloorBuffer: 1.5,
                                            bidOfferMaxCostMultiplier: 6,
                                            outputBufferTicks,
                                            inputBufferTargetTicks,
                                        };

                                        const config: ChainSimConfig = {
                                            nodes,
                                            pid,
                                            pricing,
                                            demand,
                                            numTicks,
                                        };

                                        const snapshots = runChainSimulation(config);
                                        const metrics = computeMetrics(snapshots, nodes);
                                        const classification = classifyRun(metrics);

                                        runs.push({
                                            runId: runId++,
                                            params: {
                                                kp,
                                                ki,
                                                outMax,
                                                priceAdjustMaxUp,
                                                priceAdjustMaxDown,
                                                costSpringStrength,
                                                targetSellThrough,
                                                inputBufferTargetTicks,
                                                outputBufferTicks,
                                            },
                                            metrics,
                                            classification,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    return runs;
}

// =============================================================================
// Report generation
// =============================================================================

function generateReport(
    nodes: ChainNodeConfig[],
    demand: DemandModel,
    runs: SweepRun[],
    numTicks: number,
): SweepReport {
    const summary = { stable: 0, oscillating: 0, breaking: 0, stagnating: 0 };
    for (const r of runs) {
        summary[r.classification]++;
    }

    // Best params
    const stableRuns = runs.filter((r) => r.classification === 'stable');
    const stable = stableRuns.length > 0
        ? stableRuns.reduce((best, r) =>
            Math.max(...Object.values(r.metrics.scaleOscillation)) <
            Math.max(...Object.values(best.metrics.scaleOscillation))
                ? r : best
        ).params
        : null;

    const settledRuns = runs.filter((r) => r.metrics.settlingTick >= 0);
    const fastSettling = settledRuns.length > 0
        ? settledRuns.reduce((best, r) => r.metrics.settlingTick < best.metrics.settlingTick ? r : best).params
        : null;

    const lowOscillation = runs.length > 0
        ? runs.reduce((best, r) =>
            Math.max(...Object.values(r.metrics.scaleOscillation)) <
            Math.max(...Object.values(best.metrics.scaleOscillation))
                ? r : best
        ).params
        : null;

    return {
        timestamp: new Date().toISOString(),
        numTicks,
        demandModel: demand,
        nodeConfigs: nodes,
        totalRuns: runs.length,
        summary,
        runs,
        bestParams: { stable, fastSettling, lowOscillation },
    };
}

// =============================================================================
// Output
// =============================================================================

function printSummary(report: SweepReport): void {
    const { summary, totalRuns } = report;
    console.log('');
    console.log('='.repeat(60));
    console.log(` Parameter Sweep Report`);
    console.log(` ${new Date(report.timestamp).toLocaleString()}`);
    console.log(` Demand: ${JSON.stringify(report.demandModel)}`);
    console.log(` Ticks: ${report.numTicks} (${(report.numTicks / 30 / 12).toFixed(1)} years)`);
    console.log(` Total runs: ${totalRuns}`);
    console.log('='.repeat(60));
    console.log('');
    console.log(' Classification  Count   %');
    console.log(' ' + '-'.repeat(30));
    for (const cls of ['stable', 'oscillating', 'breaking', 'stagnating'] as const) {
        const count = summary[cls];
        const pct = ((count / totalRuns) * 100).toFixed(1);
        console.log(` ${cls.padEnd(14)} ${String(count).padStart(5)}  ${pct.padStart(5)}%`);
    }
    console.log('');

    if (report.bestParams.stable) {
        console.log('-- Best Stable (lowest scale oscillation) --');
        printParams(report.bestParams.stable);
    }
    if (report.bestParams.fastSettling) {
        console.log('-- Fastest Settling --');
        printParams(report.bestParams.fastSettling);
    }
    if (report.bestParams.lowOscillation) {
        console.log('-- Lowest Overall Oscillation --');
        printParams(report.bestParams.lowOscillation);
    }
}

function printParams(p: SweepRun['params']): void {
    console.log(`  kp=${p.kp}  ki=${p.ki}  outMax=${p.outMax}`);
    console.log(`  priceAdjustMaxUp=${p.priceAdjustMaxUp}  priceAdjustMaxDown=${p.priceAdjustMaxDown}`);
    console.log(`  costSpringStrength=${p.costSpringStrength}  targetSellThrough=${p.targetSellThrough}`);
    console.log(`  inputBufferTargetTicks=${p.inputBufferTargetTicks}  outputBufferTicks=${p.outputBufferTicks}`);
    console.log('');
}

function runsToCSV(runs: SweepRun[]): string {
    const header = [
        'runId',
        'kp', 'ki', 'outMax',
        'priceAdjustMaxUp', 'priceAdjustMaxDown', 'costSpringStrength',
        'targetSellThrough', 'inputBufferTargetTicks', 'outputBufferTicks',
        'classification',
        'settlingTick',
        'supplyChainBreakTicks',
        'maxPriceToCostRatio',
        'scaleOsc_mine', 'scaleOsc_smelter', 'scaleOsc_factory',
        'priceOsc_mine', 'priceOsc_smelter', 'priceOsc_factory',
        'finalScale_mine', 'finalScale_smelter', 'finalScale_factory',
        'finalInv_mine', 'finalInv_smelter', 'finalInv_factory',
    ];

    const rows = runs.map((r) => [
        r.runId,
        r.params.kp,
        r.params.ki,
        r.params.outMax,
        r.params.priceAdjustMaxUp,
        r.params.priceAdjustMaxDown,
        r.params.costSpringStrength,
        r.params.targetSellThrough,
        r.params.inputBufferTargetTicks,
        r.params.outputBufferTicks,
        r.classification,
        r.metrics.settlingTick,
        r.metrics.supplyChainBreakTicks,
        r.metrics.maxPriceToCostRatio.toFixed(4),
        r.metrics.scaleOscillation['mine']?.toFixed(6) ?? '-',
        r.metrics.scaleOscillation['smelter']?.toFixed(6) ?? '-',
        r.metrics.scaleOscillation['factory']?.toFixed(6) ?? '-',
        r.metrics.priceOscillation['mine']?.toFixed(6) ?? '-',
        r.metrics.priceOscillation['smelter']?.toFixed(6) ?? '-',
        r.metrics.priceOscillation['factory']?.toFixed(6) ?? '-',
        r.metrics.finalScale['mine']?.toFixed(2) ?? '-',
        r.metrics.finalScale['smelter']?.toFixed(2) ?? '-',
        r.metrics.finalScale['factory']?.toFixed(2) ?? '-',
        r.metrics.finalInventory['mine']?.toFixed(2) ?? '-',
        r.metrics.finalInventory['smelter']?.toFixed(2) ?? '-',
        r.metrics.finalInventory['factory']?.toFixed(2) ?? '-',
    ]);

    return [
        header.join(','),
        ...rows.map((row) => row.join(',')),
    ].join('\n');
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const outFile = args.find((a) => a.startsWith('--out='))?.split('=')[1] || '';
    const isFast = args.includes('--fast');

    const grid = isFast ? fastGrid() : fullGrid();

    // Sweep each demand scenario
    for (const [scenarioName, demand] of Object.entries(DEMAND_SCENARIOS)) {
        console.log(`\n--- Sweep: ${scenarioName} ---`);

        const start = performance.now();
        const runs = runSweep(DEFAULT_NODES, demand, grid, NUM_TICKS);
        const elapsed = ((performance.now() - start) / 1000).toFixed(1);

        const report = generateReport(DEFAULT_NODES, demand, runs, NUM_TICKS);
        printSummary(report);

        console.log(`Completed in ${elapsed}s (${(runs.length / Number(elapsed)).toFixed(0)} runs/s)`);

        // Write output
        if (outFile) {
            const base = outFile.replace(/\.json$/, '');
            const jsonPath = `${base}-${scenarioName}.json`;
            const csvPath = `${base}-${scenarioName}.csv`;

            fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
            console.log(`Wrote ${jsonPath}`);

            fs.writeFileSync(csvPath, runsToCSV(report.runs));
            console.log(`Wrote ${csvPath}`);
        }
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});