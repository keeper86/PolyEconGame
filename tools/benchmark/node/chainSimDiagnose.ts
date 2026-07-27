#!/usr/bin/env tsx
/**
 * Chain-sim diagnostic tool: focused parameter exploration PLUS per-tick
 * time-series output and bang-bang/phase-lag detection metrics.
 *
 * Runs ~20 parameter combinations (not 82k), outputs rich CSV time series +
 * diagnostic summary to test the hypothesis that the PID is saturated/bang-bang.
 *
 * Usage:
 *   npx tsx tools/benchmark/node/chainSimDiagnose.ts
 *   npx tsx tools/benchmark/node/chainSimDiagnose.ts --out=path
 *   npx tsx tools/benchmark/node/chainSimDiagnose.ts --fast   # 720 ticks, not 3600
 */

import fs from 'node:fs';
import path from 'node:path';
import {
    runChainSimulation,
    getNodeSeries,
    type ChainSimConfig,
    type ChainNodeConfig,
    type PidParams,
    type PricingParams,
    type DemandModel,
    type SimSnapshot,
    type NodeStateSnapshot,
    PID_DEFAULTS,
    PRICING_DEFAULTS,
    DEFAULT_CHAIN_CONFIG,
} from '../../../src/app/supply-chain/chain-sim/_components/chainSimulator';

// =============================================================================
// Diagnostic metrics
// =============================================================================

interface DiagnosticMetrics {
    /** Number of times signal crosses zero (sign flip) — bang-bang indicator */
    signalFlipCount: Record<string, number>;
    /** Mean absolute signal — 0 = equilibrium, 1 = fully saturated */
    signalMeanAbs: Record<string, number>;
    /** Fraction of ticks where pidOutput is at ±outMax */
    pidSaturationFraction: Record<string, number>;
    /** Mean integral term value relative to outMax — windup indicator */
    integralRelative: Record<string, number>;
    /** Standard deviation of scale — oscillation magnitude */
    scaleStd: Record<string, number>;
    /** Final scale vs. theoretical equilibrium (demand / outputPerScalePerTick) */
    scaleEquilibriumDeviation: Record<string, number>;
    /** Cross-correlation lag between signal and scale change (ticks) */
    phaseLagTicks: Record<string, number>;
    /** Fraction of ticks where signal is in the "gray zone" (-0.5 to 0.5, not saturated) */
    grayZoneFraction: Record<string, number>;
    /** Mean absolute derivative of signal — how fast signal changes */
    signalJerk: Record<string, number>;
    /** Fraction of ticks where the signal is at extreme (|signal| > 0.9) */
    signalExtremeFraction: Record<string, number>;
}

function computeDiagnosticMetrics(
    snapshots: SimSnapshot[],
    nodeIds: string[],
    pidParams: PidParams,
    demand: DemandModel,
    nodeConfigs: ChainNodeConfig[],
): DiagnosticMetrics {
    const warmSnaps = snapshots.slice(600); // skip warmup
    if (warmSnaps.length < 10) {
        return {
            signalFlipCount: {},
            signalMeanAbs: {},
            pidSaturationFraction: {},
            integralRelative: {},
            scaleStd: {},
            scaleEquilibriumDeviation: {},
            phaseLagTicks: {},
            grayZoneFraction: {},
            signalJerk: {},
            signalExtremeFraction: {},
        };
    }

    const metrics: DiagnosticMetrics = {
        signalFlipCount: {},
        signalMeanAbs: {},
        pidSaturationFraction: {},
        integralRelative: {},
        scaleStd: {},
        scaleEquilibriumDeviation: {},
        phaseLagTicks: {},
        grayZoneFraction: {},
        signalJerk: {},
        signalExtremeFraction: {},
    };

    for (const nodeId of nodeIds) {
        const signals = warmSnaps.map(s => s.nodes[nodeId]?.signal ?? 0);
        const pidOutputs = warmSnaps.map(s => s.nodes[nodeId]?.pidOutput ?? 0);
        const pidIs = warmSnaps.map(s => s.nodes[nodeId]?.pidI ?? 0);
        const scales = warmSnaps.map(s => s.nodes[nodeId]?.scale ?? 0);

        // Signal flip count
        let flips = 0;
        for (let i = 1; i < signals.length; i++) {
            if ((signals[i - 1] > 0.01 && signals[i] < -0.01) ||
                (signals[i - 1] < -0.01 && signals[i] > 0.01)) {
                flips++;
            }
        }
        metrics.signalFlipCount[nodeId] = flips;

        // Mean absolute signal
        metrics.signalMeanAbs[nodeId] = signals.reduce((a, b) => a + Math.abs(b), 0) / signals.length;

        // PID saturation fraction
        const satCount = pidOutputs.filter(o => Math.abs(o) >= pidParams.outMax * 0.99).length;
        metrics.pidSaturationFraction[nodeId] = satCount / pidOutputs.length;

        // Integral relative to outMax
        metrics.integralRelative[nodeId] = pidIs.reduce((a, b) => a + Math.abs(b), 0) / pidIs.length / pidParams.outMax;

        // Scale std
        const scaleMean = scales.reduce((a, b) => a + b, 0) / scales.length;
        const scaleVar = scales.reduce((a, b) => a + (b - scaleMean) ** 2, 0) / scales.length;
        metrics.scaleStd[nodeId] = Math.sqrt(scaleVar);

        // Gray zone fraction: signal between -0.5 and 0.5
        const grayCount = signals.filter(s => Math.abs(s) < 0.5).length;
        metrics.grayZoneFraction[nodeId] = grayCount / signals.length;

        // Extreme fraction: |signal| > 0.9
        const extremeCount = signals.filter(s => Math.abs(s) > 0.9).length;
        metrics.signalExtremeFraction[nodeId] = extremeCount / signals.length;

        // Signal jerk (mean absolute derivative)
        let jerkSum = 0;
        for (let i = 1; i < signals.length; i++) {
            jerkSum += Math.abs(signals[i] - signals[i - 1]);
        }
        metrics.signalJerk[nodeId] = jerkSum / (signals.length - 1);

        // Scale equilibrium deviation
        const nodeConfig = nodeConfigs.find(n => n.id === nodeId);
        let eqScale = 0;
        if (nodeConfig) {
            if (demand.type === 'constant') {
                eqScale = demand.demandPerTick / nodeConfig.outputPerScalePerTick;
            } else if (demand.type === 'step') {
                eqScale = demand.newValue / nodeConfig.outputPerScalePerTick;
            } else if (demand.type === 'sine') {
                eqScale = demand.mean / nodeConfig.outputPerScalePerTick;
            }
            // Adjust for chain: upstream nodes produce for downstream demand
            // Mine produces ore for Smelter, Smelter produces ingot for Factory
            if (nodeId === 'mine') {
                const smelterConfig = nodeConfigs.find(n => n.id === 'smelter')!;
                const factoryConfig = nodeConfigs.find(n => n.id === 'factory')!;
                // Factory needs demand widgets. Smelter needs 2 ore per ingot.
                // So mine eq = demand * (factory input ratio) * (smelter input ratio)
                eqScale = eqScale * factoryConfig.inputPerScalePerTick * smelterConfig.inputPerScalePerTick;
            } else if (nodeId === 'smelter') {
                const factoryConfig = nodeConfigs.find(n => n.id === 'factory')!;
                eqScale = eqScale * factoryConfig.inputPerScalePerTick;
            }
            eqScale = Math.min(nodeConfig.maxScale, Math.max(nodeConfig.maxScale * 0.1, eqScale));
        }
        const finalScale = scales[scales.length - 1];
        metrics.scaleEquilibriumDeviation[nodeId] = eqScale > 0 ? Math.abs(finalScale - eqScale) / eqScale : 0;

        // Phase lag: cross-correlation between signal and scale change
        const scaleDeltas: number[] = [];
        for (let i = 1; i < scales.length; i++) {
            scaleDeltas.push(scales[i] - scales[i - 1]);
        }

        let bestLag = 0;
        let bestCorr = -1;
        const maxLag = Math.min(50, Math.floor(scaleDeltas.length / 3));
        for (let lag = -maxLag; lag <= maxLag; lag++) {
            let sumCorr = 0;
            let count = 0;
            for (let i = 0; i < scaleDeltas.length; i++) {
                const sigIdx = i + lag;
                if (sigIdx >= 0 && sigIdx < signals.length) {
                    sumCorr += signals[sigIdx] * scaleDeltas[i];
                    count++;
                }
            }
            const corr = count > 0 ? sumCorr / count : 0;
            if (corr > bestCorr) {
                bestCorr = corr;
                bestLag = lag;
            }
        }
        metrics.phaseLagTicks[nodeId] = bestLag;
    }

    return metrics;
}

// =============================================================================
// Time-series CSV
// =============================================================================

function writeTimeSeriesCSV(
    snapshots: SimSnapshot[],
    nodeIds: string[],
    params: { kp: number; ki: number; outMax: number; outputBufferTicks: number },
    demandName: string,
    outDir: string,
): string {
    const fields = [
        'tick',
        ...nodeIds.flatMap(nid => [
            `${nid}_scale`, `${nid}_inventory`, `${nid}_price`,
            `${nid}_sold`, `${nid}_signal`,
            `${nid}_pidP`, `${nid}_pidI`, `${nid}_pidD`, `${nid}_pidOutput`,
            `${nid}_unfilledDemand`, `${nid}_unsoldSupply`,
            `${nid}_totalDemand`, `${nid}_totalSupply`,
        ]),
    ];

    const rows = snapshots.map(s => {
        const vals: (number | string)[] = [s.tick];
        for (const nid of nodeIds) {
            const n = s.nodes[nid] ?? {} as NodeStateSnapshot;
            vals.push(
                n.scale ?? 0, n.inventory ?? 0, n.price ?? 0,
                n.sold ?? 0, n.signal ?? 0,
                n.pidP ?? 0, n.pidI ?? 0, n.pidD ?? 0, n.pidOutput ?? 0,
                n.unfilledDemand ?? 0, n.unsoldSupply ?? 0,
                n.totalDemand ?? 0, n.totalSupply ?? 0,
            );
        }
        return vals.join(',');
    });

    const csv = [fields.join(','), ...rows].join('\n');

    const paramTag = `kp${params.kp}_ki${params.ki}_outMax${params.outMax}_buf${params.outputBufferTicks}`;
    const filename = `${demandName}__${paramTag}.csv`;
    const filepath = path.join(outDir, filename);
    fs.writeFileSync(filepath, csv);
    return filepath;
}

// =============================================================================
// Parameter grid for diagnostic (very focused)
// =============================================================================

interface DiagnosticCase {
    name: string;
    pid: PidParams;
    pricing: PricingParams;
    description: string;
}

function buildDiagnosticCases(): DiagnosticCase[] {
    const defaults = {
        pid: { ...PID_DEFAULTS } as PidParams,
        pricing: { ...PRICING_DEFAULTS } as PricingParams,
    };

    return [
        {
            name: 'default_buf0',
            pid: { ...defaults.pid },
            pricing: { ...defaults.pricing, outputBufferTicks: 0 },
            description: 'Current defaults, no output buffer (baseline oscillating)',
        },
        {
            name: 'default_buf10',
            pid: { ...defaults.pid },
            pricing: { ...defaults.pricing, outputBufferTicks: 10 },
            description: 'Current defaults + output buffer 10 (stable reference)',
        },
        {
            name: 'lowKp_ki_buf0',
            pid: { ...defaults.pid, kp: 0.01, ki: 0.0001 },
            pricing: { ...defaults.pricing, outputBufferTicks: 0 },
            description: 'Low kp+ki, no buffer (100% stable in sweep)',
        },
        {
            name: 'lowKi_buf0',
            pid: { ...defaults.pid, ki: 0.0001 },
            pricing: { ...defaults.pricing, outputBufferTicks: 0 },
            description: 'Only ki lowered, no buffer',
        },
        {
            name: 'lowKp_buf0',
            pid: { ...defaults.pid, kp: 0.01 },
            pricing: { ...defaults.pricing, outputBufferTicks: 0 },
            description: 'Only kp lowered, no buffer',
        },
        {
            name: 'noIntegral_buf0',
            pid: { ...defaults.pid, ki: 0 },
            pricing: { ...defaults.pricing, outputBufferTicks: 0 },
            description: 'No integral term, no buffer (pure P+D)',
        },
        {
            name: 'noDerivative_buf0',
            pid: { ...defaults.pid, kd: 0 },
            pricing: { ...defaults.pricing, outputBufferTicks: 0 },
            description: 'No derivative term, no buffer (pure P+I)',
        },
        {
            name: 'smallOutMax_buf0',
            pid: { ...defaults.pid, outMax: 0.01 },
            pricing: { ...defaults.pricing, outputBufferTicks: 0 },
            description: 'Slow scale changes (outMax=0.01), no buffer',
        },
        {
            name: 'largeOutMax_buf0',
            pid: { ...defaults.pid, outMax: 0.1 },
            pricing: { ...defaults.pricing, outputBufferTicks: 0 },
            description: 'Fast scale changes (outMax=0.1), no buffer',
        },
        {
            name: 'default_buf0_lowSpring',
            pid: { ...defaults.pid },
            pricing: { ...defaults.pricing, outputBufferTicks: 0, costSpringStrength: 0 },
            description: 'No cost spring, no buffer',
        },
        {
            name: 'default_buf0_highSpring',
            pid: { ...defaults.pid },
            pricing: { ...defaults.pricing, outputBufferTicks: 0, costSpringStrength: 0.3 },
            description: 'High cost spring, no buffer',
        },
    ];
}

// =============================================================================
// Demand scenarios (fewer)
// =============================================================================

const DIAG_DEMAND_SCENARIOS: Record<string, DemandModel> = {
    baseline: { type: 'constant', demandPerTick: 40 },
    stepDown70: { type: 'step', initial: 40, afterTick: 1800, newValue: 12 },
    stepUp: { type: 'step', initial: 20, afterTick: 1800, newValue: 60 },
    sineMed: { type: 'sine', mean: 40, amplitude: 20, periodTicks: 720 },
};

// =============================================================================
// Summary output
// =============================================================================

function printDiagnosticSummary(
    caseName: string,
    demandName: string,
    metrics: DiagnosticMetrics,
    nodeIds: string[],
): void {
    console.log(`\n--- ${caseName} (${demandName}) ---`);
    for (const nid of nodeIds) {
        console.log(`  ${nid}:`);
        console.log(`    signalFlipCount:    ${metrics.signalFlipCount[nid]?.toFixed(0) ?? '-'}`);
        console.log(`    signalMeanAbs:      ${metrics.signalMeanAbs[nid]?.toFixed(4) ?? '-'}  (0=equil, 1=saturated)`);
        console.log(`    grayZoneFraction:   ${(metrics.grayZoneFraction[nid] ?? 0 * 100).toFixed(1)}%  (signal in [-0.5,0.5])`);
        console.log(`    extremeFraction:    ${(metrics.signalExtremeFraction[nid] ?? 0 * 100).toFixed(1)}%  (|signal|>0.9)`);
        console.log(`    pidSatFraction:     ${(metrics.pidSaturationFraction[nid] ?? 0 * 100).toFixed(1)}%  (at ±outMax)`);
        console.log(`    integralRel:        ${metrics.integralRelative[nid]?.toFixed(3) ?? '-'}  (|I|/outMax)`);
        console.log(`    scaleStd:           ${metrics.scaleStd[nid]?.toFixed(2) ?? '-'}`);
        console.log(`    eqDeviation:        ${(metrics.scaleEquilibriumDeviation[nid] ?? 0 * 100).toFixed(1)}%`);
        console.log(`    phaseLag:           ${metrics.phaseLagTicks[nid]?.toFixed(0) ?? '-'} ticks`);
        console.log(`    signalJerk:         ${metrics.signalJerk[nid]?.toFixed(4) ?? '-'}`);
    }
}

function printBangBangSummary(diagCases: DiagnosticCase[], allResults: Record<string, Record<string, { snapshots: SimSnapshot[]; metrics: DiagnosticMetrics }>>): void {
    console.log('\n' + '='.repeat(70));
    console.log(' BANG-BANG DIAGNOSIS SUMMARY');
    console.log('='.repeat(70));
    console.log('');
    console.log('A controller is "bang-bang" (on/off) when:');
    console.log('  - signal is extreme (>90% of time at |signal|>0.9)');
    console.log('  - PID stays saturated (>50% of time at ±outMax)');
    console.log('  - signal rarely in gray zone (<20% in [-0.5,0.5])');
    console.log('  - Many sign flips (signal oscillates)');
    console.log('');

    for (const diag of diagCases) {
        console.log(`Case: ${diag.name} — ${diag.description}`);
        for (const [demandName, results] of Object.entries(allResults)) {
            const r = results[diag.name];
            if (!r) continue;
            const m = r.metrics;
            const nodeIds = Object.keys(m.signalMeanAbs);

            // Compute average across nodes
            const avgExtreme = nodeIds.reduce((a, id) => a + (m.signalExtremeFraction[id] ?? 0), 0) / nodeIds.length;
            const avgSat = nodeIds.reduce((a, id) => a + (m.pidSaturationFraction[id] ?? 0), 0) / nodeIds.length;
            const avgGray = nodeIds.reduce((a, id) => a + (m.grayZoneFraction[id] ?? 0), 0) / nodeIds.length;
            const avgFlips = nodeIds.reduce((a, id) => a + (m.signalFlipCount[id] ?? 0), 0) / nodeIds.length;
            const avgMeanAbs = nodeIds.reduce((a, id) => a + (m.signalMeanAbs[id] ?? 0), 0) / nodeIds.length;
            const avgJerk = nodeIds.reduce((a, id) => a + (m.signalJerk[id] ?? 0), 0) / nodeIds.length;

            const isBangBang = avgExtreme > 0.9 && avgSat > 0.5 && avgGray < 0.2;

            console.log(`  ${demandName}:`);
            console.log(`    extreme=${(avgExtreme * 100).toFixed(0)}%  sat=${(avgSat * 100).toFixed(0)}%  gray=${(avgGray * 100).toFixed(0)}%  flips=${avgFlips.toFixed(0)}  |signal|_avg=${avgMeanAbs.toFixed(3)}  jerk=${avgJerk.toFixed(4)}`);
            console.log(`    → ${isBangBang ? '🔴 BANG-BANG' : '🟢 NOT bang-bang (smooth)'}`);
        }
    }
}

// =============================================================================
// Main
// =============================================================================

function main(): void {
    const args = process.argv.slice(2);
    const outDir = args.find(a => a.startsWith('--out='))?.split('=')[1] || 'tools/benchmark/results/diagnose';
    const isFast = args.includes('--fast');
    const NUM_TICKS = isFast ? 720 : 3600;

    fs.mkdirSync(outDir, { recursive: true });

    const diagCases = buildDiagnosticCases();
    const nodeIds = DEFAULT_CHAIN_CONFIG.map(n => n.id);

    const nodeConfigs = DEFAULT_CHAIN_CONFIG;

    const allResults: Record<string, Record<string, { snapshots: SimSnapshot[]; metrics: DiagnosticMetrics }>> = {};

    for (const [demandName, demandModel] of Object.entries(DIAG_DEMAND_SCENARIOS)) {
        console.log(`\n=== Demand: ${demandName} ===`);
        allResults[demandName] = {};

        for (const diag of diagCases) {
            const config: ChainSimConfig = {
                nodes: nodeConfigs,
                pid: diag.pid,
                pricing: diag.pricing,
                demand: demandModel,
                numTicks: NUM_TICKS,
            };

            const start = performance.now();
            const snapshots = runChainSimulation(config);
            const elapsed = ((performance.now() - start) / 1000).toFixed(2);

            const metrics = computeDiagnosticMetrics(snapshots, nodeIds, diag.pid, demandModel, nodeConfigs);

            printDiagnosticSummary(diag.name, demandName, metrics, nodeIds);
            console.log(`  [${elapsed}s, ${snapshots.length} ticks]`);

            // Write time-series CSV
            const csvPath = writeTimeSeriesCSV(
                snapshots, nodeIds,
                { kp: diag.pid.kp, ki: diag.pid.ki, outMax: diag.pid.outMax, outputBufferTicks: diag.pricing.outputBufferTicks },
                demandName, outDir,
            );
            console.log(`  Wrote ${csvPath}`);

            allResults[demandName][diag.name] = { snapshots, metrics };
        }
    }

    // Print bang-bang summary
    printBangBangSummary(diagCases, allResults);

    // Write combined summary JSON
    const summaryPath = path.join(outDir, 'diagnostic_summary.json');
    const summary: Record<string, Record<string, DiagnosticMetrics>> = {};
    for (const [dName, results] of Object.entries(allResults)) {
        summary[dName] = {};
        for (const [cName, r] of Object.entries(results)) {
            summary[dName][cName] = r.metrics;
        }
    }
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`\nWrote ${summaryPath}`);
    console.log('\nDone.');
}

main();