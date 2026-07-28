#!/usr/bin/env tsx
/**
 * Chain-sim food starve: compares sell-smoothing vs. no sell-smoothing
 * with a population feedback loop.
 *
 * Key comparisons:
 *   - Both smoothing OFF: should oscillate/stave (like bad config)
 *   - Sell smoothing ON, buy OFF: does sell-alone stabilize?
 *   - Buy smoothing ON, sell OFF: does buy-alone stabilize?
 *   - Both ON: should match real-game behavior
 *   - buf10_retainOnly: old reference
 *
 * Usage:
 *   npx tsx tools/benchmark/node/chainSimFood.ts
 *   npx tsx tools/benchmark/node/chainSimFood.ts --fast   # 1200 ticks
 */
import fs from 'node:fs';
import path from 'node:path';
import {
    runChainSimulation,
    type ChainSimConfig,
    type PricingParams,
    type SimSnapshot,
    PID_DEFAULTS,
    PRICING_DEFAULTS,
    DEFAULT_CHAIN_CONFIG,
    POP_GROWTH_RATE,
    POP_DECLINE_RATE,
} from '../../../src/app/supply-chain/chain-sim/_components/chainSimulator';

const OUT_DIR = 'tools/benchmark/results/food';

// ── Constants ────────────────────────────────────────────────────────────────

const INITIAL_POPULATION = 1000;
const FOOD_PER_CAPITA = 0.04; // widgets per tick per person → 40 widgets/tick at equilibrium

// Start all nodes at max scale so we see the over-production crash
const MAXED_NODES = DEFAULT_CHAIN_CONFIG.map(n => ({
    ...n,
    initialScale: n.maxScale,
}));

// ── Config variants ──────────────────────────────────────────────────────────

interface Variant {
    label: string;
    pricing: PricingParams;
    description: string;
}

const VARIANTS: Variant[] = [
    {
        label: 'raw',
        pricing: {
            ...PRICING_DEFAULTS,
            outputBufferTicks: 0,
            overfillOnly: false,
            sellSmoothing: false,
            buySmoothing: false,
        },
        description: 'No smoothing at all (raw chain sim)',
    },
    {
        label: 'sellOnly',
        pricing: {
            ...PRICING_DEFAULTS,
            outputBufferTicks: 0,
            overfillOnly: false,
            sellSmoothing: true,
            buySmoothing: false,
        },
        description: 'Sell smoothing only',
    },
    {
        label: 'buyOnly',
        pricing: {
            ...PRICING_DEFAULTS,
            outputBufferTicks: 0,
            overfillOnly: false,
            sellSmoothing: false,
            buySmoothing: true,
        },
        description: 'Buy smoothing only',
    },
    {
        label: 'both',
        pricing: {
            ...PRICING_DEFAULTS,
            outputBufferTicks: 0,
            overfillOnly: false,
            sellSmoothing: true,
            buySmoothing: true,
        },
        description: 'Both sell and buy smoothing',
    },
    {
        label: 'buf10_ref',
        pricing: {
            ...PRICING_DEFAULTS,
            outputBufferTicks: 10,
            overfillOnly: false,
            sellSmoothing: false,
            buySmoothing: true, // real game has buy-smoothing always
        },
        description: 'Old buffer retainment (reference)',
    },
];

// ── Metrics ──────────────────────────────────────────────────────────────────

interface FoodMetrics {
    finalPopulation: number;
    minPopulation: number;
    starvationTicks: number; // ticks where foodConsumed < foodNeeded
    severeStarvationTicks: number; // ticks where foodConsumed < 0.5 * foodNeeded
    maxStreak: number; // longest consecutive starvation
    meanUnfilled: number;
    meanFoodRatio: number;
    scaleOsc: number;
    finalUnfilled: number;
}

function computeMetrics(snaps: SimSnapshot[]): FoodMetrics {
    const WARMUP = 600;
    const warm = snaps.slice(WARMUP);
    if (warm.length === 0) {
        return {
            finalPopulation: 0, minPopulation: 0, starvationTicks: 0, severeStarvationTicks: 0,
            maxStreak: 0, meanUnfilled: 0, meanFoodRatio: 0, scaleOsc: 0, finalUnfilled: 0,
        };
    }

    let starveCount = 0;
    let severeCount = 0;
    let currentStreak = 0;
    let maxStreak = 0;
    let sumUnfilled = 0;
    let sumRatio = 0;

    for (const s of warm) {
        const needed = s.foodNeeded ?? 0;
        const consumed = s.foodConsumed ?? 0;
        const ratio = needed > 0 ? consumed / needed : 1;
        sumRatio += ratio;

        const unfilled = s.nodes['factory']?.unfilledDemand ?? 0;
        sumUnfilled += unfilled;

        if (consumed < needed) {
            starveCount++;
            currentStreak++;
            if (currentStreak > maxStreak) maxStreak = currentStreak;
            if (ratio < 0.5) severeCount++;
        } else {
            currentStreak = 0;
        }
    }

    const populations = warm.map(s => s.population ?? 0).filter(p => p > 0);
    const finalPopulation = populations.length > 0 ? populations[populations.length - 1] : 0;
    const minPopulation = populations.length > 0 ? Math.min(...populations) : 0;

    const recent = warm.slice(-120);
    const scales = recent.map(s => s.nodes['factory']?.scale ?? 0);
    const meanScale = scales.reduce((a, b) => a + b, 0) / scales.length;
    const maxDev = Math.max(...scales.map(v => Math.abs(v - meanScale)));
    const scaleOsc = meanScale > 0 ? maxDev / meanScale : 0;

    const finalUnfilled = warm[warm.length - 1].nodes['factory']?.unfilledDemand ?? 0;

    return {
        finalPopulation,
        minPopulation,
        starvationTicks: starveCount,
        severeStarvationTicks: severeCount,
        maxStreak,
        meanUnfilled: sumUnfilled / warm.length,
        meanFoodRatio: sumRatio / warm.length,
        scaleOsc,
        finalUnfilled,
    };
}

// ── Run ──────────────────────────────────────────────────────────────────────

function runVariant(variant: Variant, numTicks: number): SimSnapshot[] {
    const config: ChainSimConfig = {
        nodes: MAXED_NODES,
        pid: { ...PID_DEFAULTS },
        pricing: variant.pricing,
        demand: { type: 'constant', demandPerTick: FOOD_PER_CAPITA * INITIAL_POPULATION },
        numTicks,
        population: INITIAL_POPULATION,
        foodPerCapita: FOOD_PER_CAPITA,
    };
    return runChainSimulation(config);
}

function writeTimeSeriesCSV(
    snapshots: SimSnapshot[],
    label: string,
    outDir: string,
): string {
    const fields = [
        'tick', 'population', 'foodNeeded', 'foodConsumed',
        'factory_scale', 'factory_inventory', 'factory_signal',
        'factory_unfilledDemand', 'factory_unsoldSupply', 'factory_totalDemand', 'factory_totalSupply',
        'smelter_scale', 'smelter_inventory', 'smelter_signal',
        'mine_scale', 'mine_inventory', 'mine_signal',
    ];

    const rows = snapshots.map(s => {
        const f = s.nodes['factory'] ?? {};
        const sm = s.nodes['smelter'] ?? {};
        const m = s.nodes['mine'] ?? {};
        return [
            s.tick,
            (s.population ?? 0).toFixed(1),
            (s.foodNeeded ?? 0).toFixed(2),
            (s.foodConsumed ?? 0).toFixed(2),
            f.scale?.toFixed(2) ?? '0',
            f.inventory?.toFixed(2) ?? '0',
            f.signal?.toFixed(4) ?? '0',
            f.unfilledDemand?.toFixed(2) ?? '0',
            f.unsoldSupply?.toFixed(2) ?? '0',
            f.totalDemand?.toFixed(2) ?? '0',
            f.totalSupply?.toFixed(2) ?? '0',
            sm.scale?.toFixed(2) ?? '0',
            sm.inventory?.toFixed(2) ?? '0',
            sm.signal?.toFixed(4) ?? '0',
            m.scale?.toFixed(2) ?? '0',
            m.inventory?.toFixed(2) ?? '0',
            m.signal?.toFixed(4) ?? '0',
        ].join(',');
    });

    const csv = [fields.join(','), ...rows].join('\n');
    const filename = `food_${label}.csv`;
    const filepath = path.join(outDir, filename);
    fs.writeFileSync(filepath, csv);
    return filepath;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
    const args = process.argv.slice(2);
    const isFast = args.includes('--fast');
    const numTicks = isFast ? 3600 : 7200;

    fs.mkdirSync(OUT_DIR, { recursive: true });

    console.log('\n' + '='.repeat(110));
    console.log(' FOOD CHAIN SIMULATION: sell-smoothing vs no smoothing');
    console.log(` Initial population: ${INITIAL_POPULATION}, food per capita: ${FOOD_PER_CAPITA}/tick`);
    console.log(` Growth rate: ${POP_GROWTH_RATE}/tick, Decline rate: ${POP_DECLINE_RATE}/tick`);
    console.log(` Ticks: ${numTicks}, all nodes start at maxScale`);
    console.log('='.repeat(110));

    console.log('\n Variant          | FinalPop  | MinPop  | Starve% | Severe% | MeanRat | MeanUnf | MaxStrk | Osc%  | Outcome');
    console.log(' ' + '-'.repeat(110));

    for (const variant of VARIANTS) {
        const start = performance.now();
        const snapshots = runVariant(variant, numTicks);
        const elapsed = ((performance.now() - start) / 1000).toFixed(2);
        const m = computeMetrics(snapshots);

        const label = variant.label.padEnd(16);
        const finalPop = String(Math.round(m.finalPopulation)).padStart(8);
        const minPop = String(Math.round(m.minPopulation)).padStart(7);
        const starvePct = ((m.starvationTicks / (numTicks - 600)) * 100).toFixed(1).padStart(7);
        const severePct = ((m.severeStarvationTicks / (numTicks - 600)) * 100).toFixed(1).padStart(7);
        const meanRat = m.meanFoodRatio.toFixed(3).padStart(7);
        const meanUnf = m.meanUnfilled.toFixed(1).padStart(7);
        const maxStrk = String(m.maxStreak).padStart(7);
        const osc = (m.scaleOsc * 100).toFixed(1).padStart(5);
        const outcome = m.finalPopulation > INITIAL_POPULATION * 1.1 ? '✓ GROW'
            : m.finalPopulation > INITIAL_POPULATION * 0.9 ? '≈ STABLE'
            : m.finalPopulation > 0 ? '✗ DECLINE'
            : '✗ EXTINCT';

        console.log(` ${label}| ${finalPop} | ${minPop} | ${starvePct}% | ${severePct}% | ${meanRat} | ${meanUnf} | ${maxStrk} | ${osc}% | ${outcome} [${elapsed}s]`);

        const csvPath = writeTimeSeriesCSV(snapshots, variant.label, OUT_DIR);
        console.log(`   Wrote ${csvPath}`);
    }

    console.log('\n' + '='.repeat(110));
    console.log(' Done.');
}

main();