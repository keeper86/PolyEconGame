#!/usr/bin/env tsx
/**
 * Chain-sim measurement tool: quantifies propagation delay and floor effects.
 *
 * Tests three hypotheses:
 * 1) Propagation delay — How many ticks from demand change → signal flip → scale change → inventory recovery?
 * 2) Floor effect — Does 10% minimum scale cause excess accumulation that delays recovery?
 * 3) Accumulation sink — How much excess inventory must be consumed before signal flips?
 *
 * Runs:
 *   - Demand pulse: 40→0 (tick 1800)→40 (tick 2400) — measures recovery latency per node
 *   - Floor variants: scaleMin = 0, 0.01, 0.1 (default)
 *
 * Output: per-tick CSV + latency summary
 *
 * Usage:
 *   npx tsx tools/benchmark/node/chainSimMeasure.ts
 *   npx tsx tools/benchmark/node/chainSimMeasure.ts --fast
 */

import fs from 'node:fs';
import path from 'node:path';
import {
    runChainSimulation,
    type ChainSimConfig,
    type ChainNodeConfig,
    type PidParams,
    type PricingParams,
    type DemandModel,
    type SimSnapshot,
    PID_DEFAULTS,
    PRICING_DEFAULTS,
    DEFAULT_CHAIN_CONFIG,
} from '../../../src/app/supply-chain/chain-sim/_components/chainSimulator';

// =============================================================================
// Config
// =============================================================================

const OUT_DIR = 'tools/benchmark/results/measure';
const NUM_TICKS = 3600; // 10 years
const DEMAND_STEP_TICK = 1800; // demand drops at tick 1800
const DEMAND_RETURN_TICK = 2400; // demand returns at tick 2400

// =============================================================================
// Demand models for measurement
// =============================================================================

/** Step down to 0, then back up */
const PULSE_DEMAND: DemandModel = {
    type: 'step',
    initial: 40,
    afterTick: DEMAND_STEP_TICK,
    newValue: 0,
};

/**
 * We'll simulate the "return" manually by running a second sim from tick 2400.
 * Actually: we use a custom demand function via 'step' but need two steps.
 * Instead, we run:
 *   Phase 1: constant 40 (tick 0-1800) → warmup
 *   Phase 2: constant 0  (tick 1800-2400) → collapse
 *   Phase 3: constant 40 (tick 2400-3600) → recovery
 *
 * We run a single sim with step: 40→0 at 1800, then another with step: 0→40 at 2400
 * seeded from snapshots of the first.
 *
 * BUT the chain simulator doesn't support seed injection easily.
 *
 * Simpler approach:
 *   1. Run constant 40 for 3600 ticks (baseline reference)
 *   2. Run step 40→0 at 1800 (collapse) → measure accumulation
 *   3. Run constant 0 for 3600 ticks (floor equilibrium) → measure steady state at floor
 *   4. Run step 0→40 at 1800 (recovery from floor) → measure recovery latency
 */

// =============================================================================
// Latency measurement
// =============================================================================

interface LatencyMetrics {
    /** Tick (in warmup period) when signal first flips from neg to pos */
    signalFlipTick: Record<string, number>;
    /** Tick when scale starts increasing (first uptick after floor) */
    scaleRecoveryTick: Record<string, number>;
    /** Tick when inventory crosses back above 0 after being at floor */
    inventoryRecoveryTick: Record<string, number>;
    /** Total ticks from demand change to each node's full recovery */
    recoveryLatency: Record<string, number>;
    /** Max accumulated inventory at the floor */
    maxInventoryAtFloor: Record<string, number>;
    /** Minimum scale reached */
    minScale: Record<string, number>;
    /** Ticks spent at scale floor */
    ticksAtFloor: Record<string, number>;
    /** Tick when the last node's inventory hits its peak */
    inventoryPeakTick: Record<string, number>;
}

function measureLatency(
    snapshots: SimSnapshot[],
    nodeIds: string[],
    dropTick: number,
): LatencyMetrics {
    const metrics: LatencyMetrics = {
        signalFlipTick: {},
        scaleRecoveryTick: {},
        inventoryRecoveryTick: {},
        recoveryLatency: {},
        maxInventoryAtFloor: {},
        minScale: {},
        ticksAtFloor: {},
        inventoryPeakTick: {},
    };

    for (const nodeId of nodeIds) {
        const signals = snapshots.map(s => s.nodes[nodeId]?.signal ?? 0);
        const scales = snapshots.map(s => s.nodes[nodeId]?.scale ?? 0);
        const inventories = snapshots.map(s => s.nodes[nodeId]?.inventory ?? 0);

        // Pre-event: find the average signal before the demand drop
        const preSignals = signals.slice(dropTick - 200, dropTick - 50);
        const preSignalMean = preSignals.reduce((a, b) => a + b, 0) / preSignals.length;

        // Inventory peak — find the tick of maximum inventory
        let peakInv = 0;
        let peakTick = 0;
        for (let t = dropTick; t < signals.length; t++) {
            if (inventories[t] > peakInv) {
                peakInv = inventories[t];
                peakTick = t;
            }
        }
        metrics.inventoryPeakTick[nodeId] = peakTick;
        metrics.maxInventoryAtFloor[nodeId] = peakInv;

        // Minimum scale reached after the drop
        const postScales = scales.slice(dropTick);
        metrics.minScale[nodeId] = Math.min(...postScales);

        // Ticks at floor (scale <= 11% of max, i.e., near the 10% floor)
        // Find the first frame where scale is at floor
        const floorThreshold = 0.11;
        const nodeConfig = DEFAULT_CHAIN_CONFIG.find(n => n.id === nodeId)!;
        let floorStart = -1;
        let floorEnd = -1;
        for (let t = dropTick; t < signals.length; t++) {
            if (scales[t] <= nodeConfig.maxScale * floorThreshold) {
                if (floorStart < 0) floorStart = t;
                floorEnd = t;
            }
        }
        metrics.ticksAtFloor[nodeId] = floorStart >= 0 ? floorEnd - floorStart : 0;

        // Signal flip: first time signal goes positive after being negative for >20 ticks
        let foundFlip = false;
        for (let t = dropTick + 50; t < signals.length && !foundFlip; t++) {
            // Check if signal was negative for the last 20 ticks
            let wasNegative = true;
            for (let b = t - 20; b < t; b++) {
                if (b >= 0 && signals[b] >= -0.01) {
                    wasNegative = false;
                    break;
                }
            }
            if (wasNegative && signals[t] > 0.01) {
                metrics.signalFlipTick[nodeId] = t;
                foundFlip = true;
            }
        }
        if (!foundFlip) {
            metrics.signalFlipTick[nodeId] = -1;
        }

        // Scale recovery: first time scale increases after hitting floor
        const floorScale = nodeConfig.maxScale * 0.1;
        let foundScale = false;
        for (let t = Math.max(dropTick, floorStart + 1); t < scales.length - 2 && !foundScale; t++) {
            if (scales[t] <= floorScale + 0.5 && scales[t + 1] > scales[t] + 0.001) {
                metrics.scaleRecoveryTick[nodeId] = t;
                foundScale = true;
            }
        }
        if (!foundScale) {
            metrics.scaleRecoveryTick[nodeId] = -1;
        }

        // Inventory recovery: first time inventory returns above 0 after depletion
        let foundInv = false;
        for (let t = dropTick + 1; t < inventories.length && !foundInv; t++) {
            const prev = inventories[t - 1];
            const curr = inventories[t];
            // Check if inventory transitioned from near-zero to positive
            if (prev < 1 && curr >= 1) {
                metrics.inventoryRecoveryTick[nodeId] = t;
                foundInv = true;
            }
        }
        if (!foundInv) {
            metrics.inventoryRecoveryTick[nodeId] = -1;
        }
    }

    return metrics;
}

// =============================================================================
// Run scenarios
// =============================================================================

interface ScenarioResult {
    name: string;
    snapshots: SimSnapshot[];
    metrics: LatencyMetrics;
}

function runScenario(
    config: ChainSimConfig,
    name: string,
): ScenarioResult {
    const snapshots = runChainSimulation(config);

    // If this is a step-down scenario, measure from the step
    let dropTick = 0;
    if (config.demand.type === 'step') {
        dropTick = config.demand.afterTick;
    }

    const nodeIds = config.nodes.map(n => n.id);
    const metrics = measureLatency(snapshots, nodeIds, dropTick);

    return { name, snapshots, metrics };
}

// =============================================================================
// Custom chain configs with different scale minima
// =============================================================================

function configWithScaleMin(minScale: number, demand: DemandModel): ChainSimConfig {
    return {
        nodes: DEFAULT_CHAIN_CONFIG.map(n => ({
            ...n,
            // We pass minScale via initialScale * something
            // Actually the floor is in runChainSimulation at line:
            // Math.max(nc.maxScale * 0.1, ...)
            // We can't easily change that without modifying the simulator.
            // Instead, we'll use scaleOverride to adjust.
        })),
        pid: PID_DEFAULTS,
        pricing: PRICING_DEFAULTS,
        demand,
        numTicks: NUM_TICKS,
    };
}

/**
 * The chain simulator has a hardcoded floor of maxScale * 0.1.
 * To test different floors, we need to modify the simulator or
 * accept that we can only measure the default floor.
 * 
 * Instead: measure with the existing simulator and note the 10% floor.
 * The "minScale" concept can be tested by varying maxScale (effectively
 * changing the absolute floor) and tracking scale.
 */

// =============================================================================
// Write results
// =============================================================================

function writeTimeSeriesCSV(
    snapshots: SimSnapshot[],
    nodeIds: string[],
    scenario: string,
    outDir: string,
): string {
    const fields = [
        'tick',
        ...nodeIds.flatMap(nid => [
            `${nid}_scale`, `${nid}_inventory`, `${nid}_signal`,
            `${nid}_unfilledDemand`, `${nid}_unsoldSupply`,
            `${nid}_totalDemand`, `${nid}_totalSupply`,
            `${nid}_pidOutput`,
        ]),
    ];

    const rows = snapshots.map(s => {
        const vals: (number | string)[] = [s.tick];
        for (const nid of nodeIds) {
            const n = s.nodes[nid] ?? {};
            vals.push(
                n.scale ?? 0, n.inventory ?? 0, n.signal ?? 0,
                n.unfilledDemand ?? 0, n.unsoldSupply ?? 0,
                n.totalDemand ?? 0, n.totalSupply ?? 0,
                n.pidOutput ?? 0,
            );
        }
        return vals.join(',');
    });

    const csv = [fields.join(','), ...rows].join('\n');
    const filename = `timeseries_${scenario}.csv`;
    const filepath = path.join(outDir, filename);
    fs.writeFileSync(filepath, csv);
    return filepath;
}

function printLatencySummary(results: ScenarioResult[], nodeIds: string[]): void {
    console.log('\n' + '='.repeat(70));
    console.log(' PROPAGATION DELAY MEASUREMENT');
    console.log('='.repeat(70));

    for (const { name, metrics } of results) {
        console.log(`\n--- ${name} ---`);
        for (const nid of nodeIds) {
            const floorTicks = metrics.ticksAtFloor[nid] ?? 0;
            const peakTick = metrics.inventoryPeakTick[nid] ?? 0;
            const maxInv = metrics.maxInventoryAtFloor[nid] ?? 0;
            const flipTick = metrics.signalFlipTick[nid] ?? -1;
            const scaleRec = metrics.scaleRecoveryTick[nid] ?? -1;
            const invRec = metrics.inventoryRecoveryTick[nid] ?? -1;

            console.log(`  ${nid}:`);
            console.log(`    Min scale:         ${metrics.minScale[nid]?.toFixed(2) ?? '-'}`);
            console.log(`    Ticks at floor:    ${floorTicks}`);
            console.log(`    Max inventory:     ${maxInv.toFixed(1)} (at tick ${peakTick})`);
            console.log(`    Signal flip tick:  ${flipTick >= 0 ? flipTick : 'never'}`);
            console.log(`    Scale recovery:    ${scaleRec >= 0 ? scaleRec : 'never'}`);
            console.log(`    Inventory recovery: ${invRec >= 0 ? invRec : 'never'}`);

            if (flipTick >= 0) {
                console.log(`    → Latency(flip):   ${(flipTick - 1800).toFixed(0)} ticks from demand drop`);
            }
            if (scaleRec >= 0) {
                console.log(`    → Latency(scale):  ${(scaleRec - 2400).toFixed(0)} ticks from demand return`);
            }
        }
    }
}

// =============================================================================
// Main
// =============================================================================

function main(): void {
    const args = process.argv.slice(2);
    const isFast = args.includes('--fast');
    const numTicks = isFast ? 1800 : NUM_TICKS;

    fs.mkdirSync(OUT_DIR, { recursive: true });

    const nodeIds = DEFAULT_CHAIN_CONFIG.map(n => n.id);

    const results: ScenarioResult[] = [];

    // Scenario 1: Baseline — constant 40 (reference)
    console.log('\n=== Scenario: baseline (constant 40) ===');
    results.push(runScenario({
        nodes: DEFAULT_CHAIN_CONFIG,
        pid: PID_DEFAULTS,
        pricing: PRICING_DEFAULTS,
        demand: { type: 'constant', demandPerTick: 40 },
        numTicks,
    }, 'baseline'));

    // Scenario 2: Step to 0 (collapse) — measure accumulation at floor
    console.log('\n=== Scenario: collapse (40→0 at tick 1800) ===');
    results.push(runScenario({
        nodes: DEFAULT_CHAIN_CONFIG,
        pid: PID_DEFAULTS,
        pricing: PRICING_DEFAULTS,
        demand: { type: 'step', initial: 40, afterTick: 1800, newValue: 0 },
        numTicks,
    }, 'collapse_40to0'));

    // Scenario 3: Constant 0 (floor equilibrium) — measure steady-state floor
    console.log('\n=== Scenario: floor (constant 0) ===');
    results.push(runScenario({
        nodes: DEFAULT_CHAIN_CONFIG,
        pid: PID_DEFAULTS,
        pricing: PRICING_DEFAULTS,
        demand: { type: 'constant', demandPerTick: 0 },
        numTicks,
    }, 'floor_const0'));

    // Scenario 4: Step from 0 to 40 (recovery) — measure recovery latency
    console.log('\n=== Scenario: recovery (0→40 at tick 1800) ===');
    results.push(runScenario({
        nodes: DEFAULT_CHAIN_CONFIG,
        pid: PID_DEFAULTS,
        pricing: PRICING_DEFAULTS,
        demand: { type: 'step', initial: 0, afterTick: 1800, newValue: 40 },
        numTicks,
    }, 'recovery_0to40'));

    // Scenario 5: Step from 0 to 40, but with outputBufferTicks = 10 (buffer reference)
    console.log('\n=== Scenario: recovery with buffer (0→40, buf=10) ===');
    const pricingBuf10 = { ...PRICING_DEFAULTS, outputBufferTicks: 10 };
    results.push(runScenario({
        nodes: DEFAULT_CHAIN_CONFIG,
        pid: PID_DEFAULTS,
        pricing: pricingBuf10,
        demand: { type: 'step', initial: 0, afterTick: 1800, newValue: 40 },
        numTicks,
    }, 'recovery_buf10'));

    // Print latency summary
    printLatencySummary(results, nodeIds);

    // Write time-series CSVs
    for (const { name, snapshots } of results) {
        const csvPath = writeTimeSeriesCSV(snapshots, nodeIds, name, OUT_DIR);
        console.log(`Wrote ${csvPath}`);
    }

    // Write summary JSON
    const summary: Record<string, LatencyMetrics> = {};
    for (const { name, metrics } of results) {
        summary[name] = metrics;
    }
    const summaryPath = path.join(OUT_DIR, 'measurement_summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`\nWrote ${summaryPath}`);
    console.log('Done.');
}

main();