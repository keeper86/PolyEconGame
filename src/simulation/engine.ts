import assert from 'assert';
import { performance } from 'node:perf_hooks';
import { arbitrageTraderTick } from './agents/arbitrageTraderTick';
import { forexMarketMakerPricing } from './agents/forexMarketMakerPricing';
import { forexMMRepaymentTick } from './agents/forexMarketMakerTick';
import { governmentTick } from './agents/governmentAgent';
import { shipbuilderTick } from './agents/shipbuilderTick';
import { isFirstTickInMonth, isMonthBoundary, isYearBoundary } from './constants';
import { maturesLoans, preProductionFinancialTick } from './financial/financialTick';
import { checkMonetaryConservation, checkWealthBankConsistency } from './invariants';
import { automaticPricing } from './market/automaticPricing';
import { forexTick } from './market/forexTick';
import { intergenerationalTransfersForPlanet } from './market/intergenerationalTransfers';
import { marketTick } from './market/market';
import { updateAgentClaims } from './planet/automaticClaimManagement';
import { updateAgentProductionScale } from './planet/automaticProductionScale';
import { claimBillingTick } from './planet/claimBilling';
import { environmentTick } from './planet/environment';
import type { GameState } from './planet/planet';
import { accumulatePlanetPrices, resetAgentMetrics } from './planet/planet';
import { constructionTick, productionTick, updateProductionCostFloors } from './planet/production';
import { populationAdvanceYearTick, populationTick, resetPopulationMonthCounters } from './population/populationTick';
import { shipTick } from './ships/ships';
import { seedRng } from './utils/stochasticRound';
import { assertPerCellWorkforcePopulationConsistency } from './utils/testHelper';
import { automaticWageAdjustment, automaticWorkerAllocation } from './workforce/automaticWorkerAllocation';
import { hireWorkforce } from './workforce/hireWorkforce';
import { postProductionLaborMarketTick } from './workforce/laborMarketMonthTick';
import { workforceAdvanceYearTick } from './workforce/workforceAdvanceYearTick';
import { workforceDemographicTick } from './workforce/workforceDemographicTick';
import { TickProfiler } from './TickProfiler';

export { seedRng };
export { TickProfiler };

const MAX_TICKER_EVENTS = 200;

// ── Tick profiler ──────────────────────────────────────────────────────────────
// Activated by process.env.SIM_DEBUG === '1'.  Accumulates per-phase timings
// across all planets and logs a breakdown every REPORT_INTERVAL ticks.

const REPORT_INTERVAL = 17;

// ── advanceTick ────────────────────────────────────────────────────────────────

export function advanceTick(gameState: GameState) {
    const tickStart = performance.now();
    const profile = new TickProfiler(process.env.SIM_DEBUG === '1');

    gameState.planets.forEach((planet) => {
        const planetMap = new Map([[planet.id, planet]]);
        planet.producedResources = {};
        planet.consumedResources = {};
        planet.productionCosts = {};

        let t: number = 0;

        if (isFirstTickInMonth(gameState.tick)) {
            resetAgentMetrics(gameState.agents, planet);
            resetAgentMetrics(gameState.forexMarketMakers, planet);
            resetPopulationMonthCounters(planet);
            planet.monthPriceAcc = {};
            planet.monthTransferVolume = 0;

            const govAgent = gameState.agents.get(planet.governmentId);
            assert(govAgent, `Government agent with id ${planet.governmentId} not found for planet ${planet.name}`);
            governmentTick(planet, govAgent);

            updateAgentClaims(gameState, planet);
            if (profile.isEnabled) {
                t = profile.markAndAccum('claimAdjust', '  updateAgentClaims', t);
            }
        }

        // ── Environment + Government ──
        if (profile.isEnabled) {
            t = profile.mark();
        }
        environmentTick(planet);

        if (profile.isEnabled) {
            t = profile.markAndAccum('envGov', 'environmentTick + governmentTick', t);
        }

        if (profile.isEnabled) {
            t = profile.mark();
        }
        if (process.env.SIM_DEBUG) {
            assertPerCellWorkforcePopulationConsistency(
                gameState.agents,
                planet,
                `${planet.name} before workforce tick`,
            );
        }

        const workforceEvents = workforceDemographicTick(gameState.agents, planet, profile);
        if (profile.isEnabled) {
            t = profile.markAndAccum('workforceDemographicTick', 'workforceDemographicTick', t);
        }

        populationTick(planet, workforceEvents, profile);

        if (process.env.SIM_DEBUG) {
            assertPerCellWorkforcePopulationConsistency(gameState.agents, planet, 'after');
        }
        if (profile.isEnabled) {
            t = profile.markAndAccum('pop', 'populationTick', t);
        }

        automaticWorkerAllocation(gameState.agents, planet);
        if (profile.isEnabled) {
            t = profile.markAndAccum('workforce', 'workforce', t);
        }
        hireWorkforce(gameState.agents, planet, profile);
        if (process.env.SIM_DEBUG) {
            assertPerCellWorkforcePopulationConsistency(gameState.agents, planet, 'othermonth');
        }
        if (profile.isEnabled) {
            t = profile.markAndAccum('hire', ' hire', t);
        }

        // ── Claims + Financial ──
        if (profile.isEnabled) {
            t = profile.mark();
        }
        maturesLoans(gameState.agents, planet, gameState.tick);
        if (profile.isEnabled) {
            t = profile.markAndAccum('maturesLoans', '  maturesLoans', t);
        }
        preProductionFinancialTick(gameState.agents, planet, gameState.tick);
        if (profile.isEnabled) {
            t = profile.markAndAccum('preProdFinance', '  preProductionFinancialTick', t);
        }
        intergenerationalTransfersForPlanet(planet, profile);
        if (profile.isEnabled) {
            t = profile.markAndAccum('intergenTransfers', '  intergenerationalTransfers', t);
        }

        // ── Market (pricing + clearing) ──
        if (profile.isEnabled) {
            t = profile.mark();
        }
        updateProductionCostFloors(planet);
        automaticPricing(gameState.agents, planet);
        marketTick(gameState.agents, planet);
        accumulatePlanetPrices(planet);
        if (profile.isEnabled) {
            t = profile.markAndAccum('market', 'updateCostFloor + pricing + marketTick', t);
        }

        // ── Production + Construction ──
        if (profile.isEnabled) {
            t = profile.mark();
        }
        productionTick(gameState, planet);
        constructionTick(gameState, planet);
        automaticWageAdjustment(gameState.agents, planet);
        updateAgentProductionScale(gameState, planet);
        if (profile.isEnabled) {
            t = profile.markAndAccum('production', 'production + construction + wageAdjust', t);
        }

        // Must be after productionTick, to infer claim usage
        claimBillingTick(gameState.agents, planet, gameState.tick);
        if (profile.isEnabled) {
            t = profile.markAndAccum('claimBilling', '  claimBillingTick', t);
        }

        // ── Month boundary ──
        if (profile.isEnabled) {
            t = profile.mark();
        }
        if (isMonthBoundary(gameState.tick)) {
            postProductionLaborMarketTick(gameState.agents, planet);
        }
        if (profile.isEnabled) {
            profile.markAndAccum('monthBoundary', 'monthBoundary (postProductionLaborMarketTick)', t);
        }

        // ── Year boundary ──
        if (profile.isEnabled) {
            t = profile.mark();
        }
        if (isYearBoundary(gameState.tick)) {
            if (process.env.SIM_DEBUG) {
                assertPerCellWorkforcePopulationConsistency(gameState.agents, planet, 'beforeYear');
            }
            for (const entry of Object.values(planet.resources)) {
                for (const claim of entry.claims) {
                    claim.pausedTicksThisYear = 0;
                }
            }
            populationAdvanceYearTick(planet);
            workforceAdvanceYearTick(gameState.agents, planet);
            if (process.env.SIM_DEBUG) {
                assertPerCellWorkforcePopulationConsistency(gameState.agents, planet, 'afterYear');
            }
        }
        if (profile.isEnabled) {
            profile.markAndAccum('yearBoundary', 'yearBoundary (advanceYearTick)', t);
        }

        if (process.env.SIM_DEBUG) {
            assertPerCellWorkforcePopulationConsistency(gameState.agents, planet, `${planet.name} end of tick`);
            const wealthBankIssues = checkWealthBankConsistency(planetMap, 'end of tick');
            if (wealthBankIssues.length > 0) {
                console.error(
                    `Wealth-bank inconsistency detected on planet ${planet.name} at end of tick ${gameState.tick}:`,
                    wealthBankIssues,
                );
            }
            const monetaryIssues = checkMonetaryConservation(
                gameState.agents,
                planetMap,
                0.01,
                gameState.forexMarketMakers,
                gameState.shipbuilderAgents,
                gameState.arbitrageTraders,
            );
            if (monetaryIssues.length > 0) {
                console.error(
                    `Monetary conservation violated on planet ${planet.name} at end of tick ${gameState.tick}:`,
                    monetaryIssues,
                );
            }
        }
    });

    // ── Global phases (after per-planet loop) ──
    let t: number = 0;
    if (profile.isEnabled) {
        t = profile.mark();
    }
    forexMarketMakerPricing(gameState);
    forexTick(gameState);
    forexMMRepaymentTick(gameState);
    if (profile.isEnabled) {
        profile.markAndAccum('forexGlobal', 'forexMarketMakerPricing + forexTick + repayment', t);
    }

    if (profile.isEnabled) {
        t = profile.mark();
    }
    shipTick(gameState);
    shipbuilderTick(gameState);
    if (profile.isEnabled) {
        profile.markAndAccum('ships', 'shipTick + shipbuilderTick', t);
    }

    if (profile.isEnabled) {
        t = profile.mark();
    }
    arbitrageTraderTick(gameState);
    if (profile.isEnabled) {
        profile.markAndAccum('arbitrage', 'arbitrageTraderTick', t);
    }

    if (gameState.tickerEvents.length > MAX_TICKER_EVENTS) {
        gameState.tickerEvents = gameState.tickerEvents.slice(-MAX_TICKER_EVENTS);
    }

    // ── Post-global invariants check ──
    // The per-planet loop above checks invariants, but the global phases (forex, ships, arbitrage)
    // can move money between planets and agent types. We need a second check here to catch leaks
    // introduced by those phases.
    if (process.env.SIM_DEBUG) {
        for (const planet of gameState.planets.values()) {
            const planetMap = new Map([[planet.id, planet]]);
            const monetaryIssues = checkMonetaryConservation(
                gameState.agents,
                planetMap,
                0.01,
                gameState.forexMarketMakers,
                gameState.shipbuilderAgents,
                gameState.arbitrageTraders,
            );
            if (monetaryIssues.length > 0) {
                console.error(
                    `Monetary conservation violated on planet ${planet.name} at end of tick ${gameState.tick} (post-global):`,
                    monetaryIssues,
                );
            }
        }
    }

    // ── Log profile every REPORT_INTERVAL ticks ──
    const elapsed = performance.now() - tickStart;
    if (profile.isEnabled && gameState.tick % REPORT_INTERVAL === 0) {
        profile.logBreakdown(gameState.tick, elapsed);
    }
}
