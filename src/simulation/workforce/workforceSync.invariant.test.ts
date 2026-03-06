/**
 * workforceSync.invariant.test.ts
 *
 * Reproduction test for the tick-2 government headcount mismatch:
 *
 *   "tick 2 after laborMarketTick: Planet earth: government headcount
 *    mismatch: population=1293172279 vs agents=1293061914 (diff=110365)"
 *
 * Uses the exact initial state from worker.ts (Earth + earthGovernment,
 * 8 billion population) to run two ticks step-by-step, checking the
 * population ↔ agent workforce consistency after every engine sub-step.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { earth as rawEarth, earthGovernment as rawGov, createPopulation } from '../entities';
import { agriculturalProductResourceType, putIntoStorageFacility, waterResourceType } from '../facilities';
import type { GameState, Agent, Planet } from '../planet';
import { educationLevelKeys } from '../planet';
import { seedRng } from '../utils/stochasticRound';

// Engine sub-steps (imported individually so we can call them one by one)
import { advanceTick } from '../engine';
import { environmentTick } from '../environment';
import { updateAllocatedWorkers } from './allocatedWorkers';
import { laborMarketTick } from './laborMarketTick';
import { laborMarketMonthTick } from './laborMarketMonthTick';
import { laborMarketYearTick } from './laborMarketYearTick';
import { preProductionFinancialTick, postProductionFinancialTick } from '../financial/financialTick';
import { populationTick } from '../population';
import { populationAdvanceYearTick } from '../population/populationTick';
import { productionTick } from '../production';
import { updateAgentPricing, foodMarketTick, intergenerationalTransfersTick, wealthDiffusionTick } from '../market';

// Invariant checkers
import {
    checkPopulationWorkforceConsistency,
    checkAgeMomentConsistency,
    computePopulationOccupationTotals,
    computeAgentWorkforceTotals,
    computePopulationAgeMoments,
    computeAgentAgeMomentsFromTenure,
} from '../invariants';
import { isMonthBoundary, isYearBoundary, MIN_EMPLOYABLE_AGE, TICKS_PER_MONTH, TICKS_PER_YEAR } from '../constants';
import { totalActiveForEdu } from './workforceHelpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deep-clone the mutable initial entities so each test starts fresh. */
function cloneState(): { earth: Planet; earthGovernment: Agent } {
    // The entities are module-level singletons with mutable state.
    // We need a full structural clone for isolation.
    const earthGovernment: Agent = JSON.parse(JSON.stringify(rawGov));
    const earth: Planet = JSON.parse(JSON.stringify(rawEarth));
    // Restore the governmentId reference (JSON round-trip preserves strings)
    earth.governmentId = earthGovernment.id;
    return { earth, earthGovernment };
}

/**
 * Build a GameState identical to the one in worker.ts (fresh start path).
 */
function buildWorkerInitialState(): GameState {
    const { earth, earthGovernment } = cloneState();

    const state: GameState = {
        tick: 0,
        planets: new Map([[earth.id, earth]]),
        agents: new Map([[earthGovernment.id, earthGovernment]]),
    };

    // Seed food + water exactly as worker.ts does
    const storage = earthGovernment.assets[earth.id]?.storageFacility;
    if (!storage) {
        throw new Error('Earth government has no storage facility');
    }
    putIntoStorageFacility(storage, agriculturalProductResourceType, 10_000_000_000);
    putIntoStorageFacility(storage, waterResourceType, 100_000);

    return state;
}

/**
 * Build a lighter-weight GameState with a smaller population (default 10M)
 * for tests that need to run many ticks without timing out.
 */
function buildSmallState(totalPop = 10_000_000): GameState {
    const { earth, earthGovernment } = cloneState();
    // Replace the 8B population with a smaller one
    earth.population = createPopulation(totalPop);

    const state: GameState = {
        tick: 0,
        planets: new Map([[earth.id, earth]]),
        agents: new Map([[earthGovernment.id, earthGovernment]]),
    };

    const storage = earthGovernment.assets[earth.id]?.storageFacility;
    if (!storage) {
        throw new Error('Earth government has no storage facility');
    }
    putIntoStorageFacility(storage, agriculturalProductResourceType, 10_000_000_000);
    putIntoStorageFacility(storage, waterResourceType, 100_000);

    return state;
}

/**
 * Summarise per-education government headcount from population and agents.
 */
function govBreakdown(gs: GameState) {
    const planet = gs.planets.get('earth')!;
    const popByEdu: Record<string, number> = {};
    const agentByEdu: Record<string, number> = {};

    // Population side
    for (let age = MIN_EMPLOYABLE_AGE; age < planet.population.demography.length; age++) {
        const cohort = planet.population.demography[age];
        for (const edu of educationLevelKeys) {
            popByEdu[edu] = (popByEdu[edu] ?? 0) + (cohort[edu].government ?? 0);
        }
    }

    // Agent side
    for (const agent of gs.agents.values()) {
        if (agent.id !== planet.governmentId) {
            continue;
        }
        const assets = agent.assets[planet.id];
        if (!assets?.workforceDemography) {
            continue;
        }
        for (const cohort of assets.workforceDemography) {
            for (const edu of educationLevelKeys) {
                const active = cohort.active[edu].count;
                agentByEdu[edu] = (agentByEdu[edu] ?? 0) + active;
            }
        }
        // Also include departing workers (they're still "government" in population)
        for (const cohort of assets.workforceDemography) {
            for (const edu of educationLevelKeys) {
                for (const dep of cohort.departing[edu]) {
                    agentByEdu[`${edu}_departing`] = (agentByEdu[`${edu}_departing`] ?? 0) + dep.count;
                }
            }
        }
    }

    return { popByEdu, agentByEdu };
}

/**
 * Check consistency; returns discrepancies array (empty = OK).
 */
function checkConsistency(gs: GameState): string[] {
    const d1 = checkPopulationWorkforceConsistency(gs.agents, gs.planets);
    const d2 = checkAgeMomentConsistency(gs.agents, gs.planets);
    return [...d1, ...d2];
}

/**
 * Compute total government headcount from population and agents for quick comparison.
 */
function govTotals(gs: GameState) {
    const planet = gs.planets.get('earth')!;
    const popTotals = computePopulationOccupationTotals(planet, MIN_EMPLOYABLE_AGE);
    const agentTotals = computeAgentWorkforceTotals(gs.agents, planet);
    const popMoments = computePopulationAgeMoments(planet, MIN_EMPLOYABLE_AGE);
    const agentMoments = computeAgentAgeMomentsFromTenure(gs.agents, planet);
    return {
        popGov: popTotals.government,
        agentGov: agentTotals.government,
        diff: popTotals.government - agentTotals.government,
        popGovMoments: popMoments.government,
        agentGovMoments: agentMoments.government,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Disable SIM_DEBUG so invariant violations don't kill the process
const origDebug = process.env.SIM_DEBUG;

describe('workforceSync invariant — tick 2 government headcount', () => {
    beforeEach(() => {
        process.env.SIM_DEBUG = '0';
        seedRng(42);
    });

    afterEach(() => {
        process.env.SIM_DEBUG = origDebug ?? '';
    });

    it('reproduces and investigates the per-education government headcount divergence', () => {
        const gs = buildWorkerInitialState();

        // ── Tick 0 sanity ──
        // No government workers initially (all unoccupied in createPopulation)
        const t0 = govTotals(gs);
        expect(t0.popGov).toBe(0);
        expect(t0.agentGov).toBe(0);

        // ================================================================
        // TICK 1  (step by step)
        // ================================================================
        gs.tick = 1;

        // 1. Environment
        environmentTick(gs);
        expect(checkConsistency(gs)).toEqual([]);

        // 2. Allocated workers (bootstrap path)
        updateAllocatedWorkers(gs.agents, gs.planets);
        expect(checkConsistency(gs)).toEqual([]);

        // Inspect what targets were set
        const gov = gs.agents.get('earth-government')!;
        const govAssets = gov.assets.earth;
        const allocated1: Record<string, number> = {};
        for (const edu of educationLevelKeys) {
            allocated1[edu] = govAssets.allocatedWorkers[edu];
        }
        console.log('Tick 1 — allocatedWorkers:', allocated1);

        // 3. Labor market tick (hiring)
        laborMarketTick(gs.agents, gs.planets);
        const afterHire1 = govTotals(gs);
        console.log('Tick 1 — after laborMarketTick:', {
            popGov: afterHire1.popGov,
            agentGov: afterHire1.agentGov,
            diff: afterHire1.diff,
        });
        // After hiring the population and agent counts should match exactly
        // (active + departing in agent == government in population)
        const d1 = checkConsistency(gs);
        expect(d1).toEqual([]);

        // 4. Pre-production financial tick
        preProductionFinancialTick(gs);
        expect(checkConsistency(gs)).toEqual([]);

        // 5. Population tick (mortality, disability, retirement + workforceSync)
        populationTick(gs);
        const afterPop1 = govTotals(gs);
        console.log('Tick 1 — after populationTick:', {
            popGov: afterPop1.popGov,
            agentGov: afterPop1.agentGov,
            diff: afterPop1.diff,
        });
        // This is where deaths/retirements are applied. Check per-edu.
        const breakdown1 = govBreakdown(gs);
        console.log('Tick 1 — per-edu pop gov:', breakdown1.popByEdu);
        console.log('Tick 1 — per-edu agent gov (active):', breakdown1.agentByEdu);

        const d1pop = checkConsistency(gs);
        if (d1pop.length > 0) {
            console.warn('Tick 1 — consistency issues after populationTick:', d1pop);
        }

        // 6. Production
        productionTick(gs);
        expect(checkConsistency(gs)).toEqual([]);

        // 7. Agent pricing
        updateAgentPricing(gs);
        // 8. Food market
        foodMarketTick(gs);
        // 9. Intergenerational
        intergenerationalTransfersTick(gs);
        // 10. Wealth diffusion
        wealthDiffusionTick(gs);
        // 11. Post-production financial
        postProductionFinancialTick(gs);

        const afterTick1 = govTotals(gs);
        console.log('Tick 1 — end:', {
            popGov: afterTick1.popGov,
            agentGov: afterTick1.agentGov,
            diff: afterTick1.diff,
        });

        // ================================================================
        // TICK 2  (step by step — the failing tick)
        // ================================================================
        gs.tick = 2;

        // 1. Environment
        environmentTick(gs);
        const afterEnv2 = govTotals(gs);
        console.log('Tick 2 — after environmentTick:', {
            popGov: afterEnv2.popGov,
            agentGov: afterEnv2.agentGov,
            diff: afterEnv2.diff,
        });

        // 2. Allocated workers
        updateAllocatedWorkers(gs.agents, gs.planets);
        const afterAlloc2 = govTotals(gs);
        console.log('Tick 2 — after updateAllocatedWorkers:', {
            popGov: afterAlloc2.popGov,
            agentGov: afterAlloc2.agentGov,
            diff: afterAlloc2.diff,
        });

        // Inspect what targets were set for tick 2
        const allocated2: Record<string, number> = {};
        for (const edu of educationLevelKeys) {
            allocated2[edu] = govAssets.allocatedWorkers[edu];
        }
        console.log('Tick 2 — allocatedWorkers:', allocated2);

        // Inspect current active counts before hiring
        const activeBeforeHire2: Record<string, number> = {};
        for (const edu of educationLevelKeys) {
            activeBeforeHire2[edu] = totalActiveForEdu(govAssets.workforceDemography!, edu);
        }
        console.log('Tick 2 — active before hire:', activeBeforeHire2);

        // 3. Labor market tick (the step that triggers the invariant failure)
        laborMarketTick(gs.agents, gs.planets);
        const afterHire2 = govTotals(gs);
        console.log('Tick 2 — after laborMarketTick:', {
            popGov: afterHire2.popGov,
            agentGov: afterHire2.agentGov,
            diff: afterHire2.diff,
        });

        // Per-edu breakdown after hiring in tick 2
        const breakdown2 = govBreakdown(gs);
        console.log('Tick 2 — per-edu pop gov:', breakdown2.popByEdu);
        console.log('Tick 2 — per-edu agent gov (active+departing):', breakdown2.agentByEdu);

        // Check for per-edu discrepancies
        for (const edu of educationLevelKeys) {
            const popCount = breakdown2.popByEdu[edu] ?? 0;
            const agentActive = breakdown2.agentByEdu[edu] ?? 0;
            const agentDeparting = breakdown2.agentByEdu[`${edu}_departing`] ?? 0;
            const agentTotal = agentActive + agentDeparting;
            const diff = popCount - agentTotal;
            if (Math.abs(diff) > 1) {
                console.error(
                    `  EDU=${edu}: pop=${popCount}, agent_active=${agentActive}, agent_departing=${agentDeparting}, agent_total=${agentTotal}, DIFF=${diff}`,
                );
            }
        }

        // THE ASSERTION: counts should match
        const d2 = checkConsistency(gs);
        if (d2.length > 0) {
            console.error('Tick 2 — consistency failures after laborMarketTick:\n' + d2.join('\n'));
        }
        expect(d2).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Isolate drift source: which engine step introduces the sumAge delta?
// ---------------------------------------------------------------------------

describe('workforceSync — isolate drift source per engine step', () => {
    beforeEach(() => {
        process.env.SIM_DEBUG = '0';
        seedRng(42);
    });

    afterEach(() => {
        process.env.SIM_DEBUG = origDebug ?? '';
    });

    /**
     * Run 15 months (450 ticks) and at every month boundary, measure
     * the sumAge discrepancy introduced by EACH engine sub-step within
     * that boundary tick.  This pinpoints which step causes the drift.
     */
    it.skip('measures per-step sumAge delta at month boundaries', { timeout: 120_000 }, () => {
        const gs = buildSmallState(10_000_000);

        function govSumAge(): { popSumAge: number; agentSumAge: number; diff: number } {
            const planet = gs.planets.get('earth')!;
            const popM = computePopulationAgeMoments(planet, MIN_EMPLOYABLE_AGE);
            const agM = computeAgentAgeMomentsFromTenure(gs.agents, planet);
            return {
                popSumAge: popM.government.sumAge,
                agentSumAge: agM.government.sumAge,
                diff: popM.government.sumAge - agM.government.sumAge,
            };
        }

        // We need individual step imports — already at top of file

        const TOTAL_TICKS = TICKS_PER_MONTH * 15; // 15 months = past the year boundary

        console.log('\n=== Per-step sumAge delta at month/year boundaries ===');
        console.log('tick'.padStart(6), 'step'.padEnd(35), 'Δ(pop-agent)'.padStart(16), 'cumulative'.padStart(14));

        for (let t = 1; t <= TOTAL_TICKS; t++) {
            gs.tick = t;

            // Run all the normal tick steps
            environmentTick(gs);
            updateAllocatedWorkers(gs.agents, gs.planets);
            laborMarketTick(gs.agents, gs.planets);
            preProductionFinancialTick(gs);
            populationTick(gs);
            productionTick(gs);
            updateAgentPricing(gs);
            foodMarketTick(gs);
            intergenerationalTransfersTick(gs);
            wealthDiffusionTick(gs);
            postProductionFinancialTick(gs);

            // At month boundaries, instrument the boundary steps
            if (isMonthBoundary(t)) {
                const beforeMonth = govSumAge();
                laborMarketMonthTick(gs.agents, gs.planets);
                const afterMonth = govSumAge();
                const monthDelta = afterMonth.diff - beforeMonth.diff;

                console.log(
                    String(t).padStart(6),
                    'laborMarketMonthTick'.padEnd(35),
                    monthDelta.toFixed(1).padStart(16),
                    afterMonth.diff.toFixed(1).padStart(14),
                );
            }

            if (isYearBoundary(t)) {
                const beforeYear = govSumAge();
                populationAdvanceYearTick(gs);
                const afterPopYear = govSumAge();
                const popYearDelta = afterPopYear.diff - beforeYear.diff;

                laborMarketYearTick(gs.agents);
                const afterLaborYear = govSumAge();
                const laborYearDelta = afterLaborYear.diff - afterPopYear.diff;

                console.log(
                    String(t).padStart(6),
                    'populationAdvanceYearTick'.padEnd(35),
                    popYearDelta.toFixed(1).padStart(16),
                    afterPopYear.diff.toFixed(1).padStart(14),
                );
                console.log(
                    String(t).padStart(6),
                    'laborMarketYearTick'.padEnd(35),
                    laborYearDelta.toFixed(1).padStart(16),
                    afterLaborYear.diff.toFixed(1).padStart(14),
                );
            }
        }

        // Just needs to complete — the output is what matters
        expect(true).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Age-drift characterisation test
// ---------------------------------------------------------------------------

describe('workforceSync — age moment drift characterisation', () => {
    beforeEach(() => {
        process.env.SIM_DEBUG = '0';
        seedRng(42);
    });

    afterEach(() => {
        process.env.SIM_DEBUG = origDebug ?? '';
    });

    /**
     * Run the full simulation for 5 years (1800 ticks) using advanceTick and
     * sample the mean-age discrepancy at every month boundary.
     *
     * Key diagnostic:  If the drift is random noise (zero-mean Gaussian
     * approximation error), the cumulative error should grow as √t —
     * i.e. |drift| / √(months) should stay roughly constant.
     *
     * If instead |drift| / months stays constant (linear growth), there
     * is a systematic bias that needs fixing.
     *
     * The first ~12 months are a transient (departing pipeline fills up),
     * so we measure the scaling regime from month 13 onward.
     */
    it.skip('characterises mean-age drift over 5 years (random-walk vs linear)', { timeout: 300_000 }, () => {
        const gs = buildSmallState(10_000_000);

        interface Sample {
            tick: number;
            month: number; // months since tick 0
            year: number; // year number
            popMean: number;
            agentMean: number;
            diff: number; // popMean - agentMean
            absDiff: number;
            sumAgeDiff: number; // raw Σage difference
            /** |diff| / √(months since year-1 end) — should be const if random walk */
            driftOverSqrtT: number;
            /** |diff| / (months since year-1 end) — should be const if linear */
            driftOverT: number;
        }
        const samples: Sample[] = [];

        const TOTAL_TICKS = TICKS_PER_YEAR * 5;

        for (let t = 1; t <= TOTAL_TICKS; t++) {
            gs.tick = t;
            advanceTick(gs);

            const isMonth = t % TICKS_PER_MONTH === 0;
            if (!isMonth && t !== 1) {
                continue;
            }

            const planet = gs.planets.get('earth')!;
            const popM = computePopulationAgeMoments(planet, MIN_EMPLOYABLE_AGE);
            const agM = computeAgentAgeMomentsFromTenure(gs.agents, planet);

            const pm = popM.government;
            const am = agM.government;

            const popMean = pm.count > 0 ? pm.sumAge / pm.count : 0;
            const agentMean = am.count > 0 ? am.sumAge / am.count : 0;
            const diff = popMean - agentMean;
            const sumAgeDiff = pm.sumAge - am.sumAge;

            const month = Math.floor(t / TICKS_PER_MONTH);
            const year = Math.floor(t / TICKS_PER_YEAR);

            // Months elapsed since end of transient (year 1 = month 12).
            // The departing pipeline is 12 months, so by month 12 the
            // system should have reached its steady-state regime.
            const monthsSinceTransient = Math.max(0, month - 12);

            const absDiff = Math.abs(diff);
            const driftOverSqrtT = monthsSinceTransient > 0 ? absDiff / Math.sqrt(monthsSinceTransient) : 0;
            const driftOverT = monthsSinceTransient > 0 ? absDiff / monthsSinceTransient : 0;

            samples.push({
                tick: t,
                month,
                year,
                popMean,
                agentMean,
                diff,
                absDiff,
                sumAgeDiff,
                driftOverSqrtT,
                driftOverT,
            });
        }

        // Print summary table
        console.log('\n=== Government mean-age drift over 5 years ===');
        console.log(
            'tick'.padStart(6),
            'mo'.padStart(4),
            'yr'.padStart(3),
            'popMean'.padStart(11),
            'agentMean'.padStart(11),
            'diff'.padStart(12),
            '|d|/√t'.padStart(10),
            '|d|/t'.padStart(10),
            'sumΔage'.padStart(14),
            'notes',
        );
        for (const s of samples) {
            const notes: string[] = [];
            if (s.tick % TICKS_PER_YEAR === 0) {
                notes.push('YEAR');
            }
            console.log(
                String(s.tick).padStart(6),
                String(s.month).padStart(4),
                String(s.year).padStart(3),
                s.popMean.toFixed(5).padStart(11),
                s.agentMean.toFixed(5).padStart(11),
                s.diff.toFixed(7).padStart(12),
                s.driftOverSqrtT.toFixed(6).padStart(10),
                s.driftOverT.toFixed(6).padStart(10),
                s.sumAgeDiff.toFixed(0).padStart(14),
                notes.join(' '),
            );
        }

        // ── Analysis: check scaling regime (months 13–60) ──
        // If random walk: |d|/√t should be roughly constant
        // If linear:      |d|/t  should be roughly constant
        const postTransient = samples.filter((s) => s.month > 12 && s.absDiff > 0);
        if (postTransient.length > 2) {
            const sqrtRatios = postTransient.map((s) => s.driftOverSqrtT);
            const linRatios = postTransient.map((s) => s.driftOverT);

            const avgSqrt = sqrtRatios.reduce((a, b) => a + b, 0) / sqrtRatios.length;
            const avgLin = linRatios.reduce((a, b) => a + b, 0) / linRatios.length;

            // Coefficient of variation (CV = σ/μ) — lower = more constant
            const cvSqrt =
                Math.sqrt(sqrtRatios.reduce((s, v) => s + (v - avgSqrt) ** 2, 0) / sqrtRatios.length) / avgSqrt;
            const cvLin = Math.sqrt(linRatios.reduce((s, v) => s + (v - avgLin) ** 2, 0) / linRatios.length) / avgLin;

            console.log('\n=== Scaling analysis (post-transient, months 13–60) ===');
            console.log(`  |diff|/√t — mean: ${avgSqrt.toFixed(6)}, CV: ${cvSqrt.toFixed(4)}`);
            console.log(`  |diff|/t  — mean: ${avgLin.toFixed(6)},  CV: ${cvLin.toFixed(4)}`);
            console.log(`  Lower CV = better fit.  √t-scaling ⇒ random walk,  t-scaling ⇒ systematic bias.`);

            if (cvSqrt < cvLin) {
                console.log(`  → Drift scales as √t (RANDOM WALK) — this is acceptable approximation noise.`);
            } else {
                console.log(`  → Drift scales linearly in t (SYSTEMATIC BIAS) — investigate the source!`);
            }
        }

        // The drift over 5 years should stay below 0.5 years for a 10M population.
        const maxAbsDiff = Math.max(...samples.map((s) => s.absDiff));
        console.log(`\nMax absolute mean-age diff over 5 years: ${maxAbsDiff.toFixed(8)}`);
        expect(maxAbsDiff).toBeLessThan(0.5);
    });
});
