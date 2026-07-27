#!/usr/bin/env tsx
/**
 * Starvation Comparison: overfill-only signal vs full retainment vs no buffer.
 *
 * Separately tests:
 *   - outputBufferTicks=0 (no buffer, no overfill penalty)
 *   - outputBufferTicks=10, overfillOnly=true (signal damping only, no retainment)
 *   - outputBufferTicks=10, overfillOnly=false (full retainment + signal)
 *
 * Starvation = ticks where factory_unfilledDemand > 0.
 *
 * Usage:
 *   npx tsx tools/benchmark/node/starvationCompare.ts
 */

import {
    runChainSimulation,
    type ChainSimConfig,
    type DemandModel,
    type PricingParams,
    PID_DEFAULTS,
    PRICING_DEFAULTS,
    DEFAULT_CHAIN_CONFIG,
} from '../../../src/app/supply-chain/chain-sim/_components/chainSimulator';

interface StarvationMetrics {
    totalTicks: number;
    maxStreak: number;
    meanUnfilled: number;
    peakUnfilled: number;
    finalUnfilled: number;
    episodeCount: number;
    scaleOsc: number;
}

function computeStarvation(snapshots: ReturnType<typeof runChainSimulation>): StarvationMetrics {
    const WARMUP = 600;
    const warm = snapshots.slice(WARMUP);
    if (warm.length === 0) {
        return { totalTicks: 0, maxStreak: 0, meanUnfilled: 0, peakUnfilled: 0, finalUnfilled: 0, episodeCount: 0, scaleOsc: 0 };
    }

    let total = 0;
    let maxStreak = 0;
    let currentStreak = 0;
    let peak = 0;
    let sum = 0;
    let inEpisode = false;
    let episodeCount = 0;

    for (const s of warm) {
        const unfilled = s.nodes['factory']?.unfilledDemand ?? 0;
        sum += unfilled;
        if (unfilled > 0) {
            total++;
            currentStreak++;
            if (currentStreak > maxStreak) maxStreak = currentStreak;
            if (unfilled > peak) peak = unfilled;
            if (!inEpisode) {
                episodeCount++;
                inEpisode = true;
            }
        } else {
            currentStreak = 0;
            inEpisode = false;
        }
    }

    const recent = warm.slice(-120);
    const scales = recent.map(s => s.nodes['factory']?.scale ?? 0);
    const mean = scales.reduce((a, b) => a + b, 0) / scales.length;
    const maxDev = Math.max(...scales.map(v => Math.abs(v - mean)));
    const scaleOsc = mean > 0 ? maxDev / mean : 0;

    return { totalTicks: total, maxStreak, meanUnfilled: sum / warm.length, peakUnfilled: peak, finalUnfilled: warm[warm.length - 1].nodes['factory']?.unfilledDemand ?? 0, episodeCount, scaleOsc };
}

const DEMAND_SCENARIOS: Record<string, DemandModel> = {
    baseline:  { type: 'constant', demandPerTick: 40 },
    stepDown70:{ type: 'step', initial: 40, afterTick: 1800, newValue: 12 },
    stepUp:    { type: 'step', initial: 20, afterTick: 1800, newValue: 60 },
    sineMed:   { type: 'sine', mean: 40, amplitude: 20, periodTicks: 720 },
};

interface ConfigVariant {
    label: string;
    buildPricing: () => PricingParams;
}

const VARIANTS: ConfigVariant[] = [
    {
        label: 'no_buf_signal+retain', // both=0 (default)
        buildPricing: () => ({ ...PRICING_DEFAULTS, outputBufferTicks: 0, overfillOnly: false }),
    },
    {
        label: 'buf5_overfillOnly',
        buildPricing: () => ({ ...PRICING_DEFAULTS, outputBufferTicks: 5, overfillOnly: true }),
    },
    {
        label: 'buf10_overfillOnly',
        buildPricing: () => ({ ...PRICING_DEFAULTS, outputBufferTicks: 10, overfillOnly: true }),
    },
    {
        label: 'buf20_overfillOnly',
        buildPricing: () => ({ ...PRICING_DEFAULTS, outputBufferTicks: 20, overfillOnly: true }),
    },
    {
        label: 'buf10_retainOnly',
        buildPricing: () => ({ ...PRICING_DEFAULTS, outputBufferTicks: 10, overfillOnly: false }),
    },
];

function runScenario(demand: DemandModel, variant: ConfigVariant) {
    const config: ChainSimConfig = {
        nodes: DEFAULT_CHAIN_CONFIG,
        pid: PID_DEFAULTS,
        pricing: variant.buildPricing(),
        demand,
        numTicks: 3600,
    };
    const snapshots = runChainSimulation(config);
    return computeStarvation(snapshots);
}

function main(): void {
    console.log('\n' + '='.repeat(100));
    console.log(' STARVATION COMPARISON: overfill-only signal vs retainment vs no buffer');
    console.log(' All runs: PID defaults, 3600 ticks, 600 tick warmup');
    console.log('='.repeat(100));

    console.log('');
    console.log(' Dem          | Config             | TotStarve | MaxStrk | MeanUnf | PeakUnf | Epis | Osc%  | FinalUnf');
    console.log(' ' + '-'.repeat(100));

    for (const [dName, demand] of Object.entries(DEMAND_SCENARIOS)) {
        for (const variant of VARIANTS) {
            const m = runScenario(demand, variant);
            const label = dName.padEnd(13);
            const config = variant.label.padEnd(19);
            const total = String(m.totalTicks).padStart(9);
            const streak = String(m.maxStreak).padStart(7);
            const mean = m.meanUnfilled.toFixed(1).padStart(7);
            const peak = m.peakUnfilled.toFixed(0).padStart(7);
            const eps = String(m.episodeCount).padStart(4);
            const osc = (m.scaleOsc * 100).toFixed(1).padStart(5);
            const final = m.finalUnfilled.toFixed(0).padStart(8);
            const marker = m.totalTicks > 200 && m.meanUnfilled > 5 ? ' ← STARVE' : m.totalTicks > 200 ? ' ← mild' : '';

            console.log(` ${label}| ${config} | ${total} | ${streak} | ${mean} | ${peak} | ${eps} | ${osc}% | ${final}${marker}`);
        }
        console.log(' ' + '-'.repeat(100));
    }
}

main();