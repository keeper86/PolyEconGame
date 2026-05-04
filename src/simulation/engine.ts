import { isFirstTickInMonth, isMonthBoundary, isYearBoundary } from './constants';
import { automaticLoanRepayment, maturesLoans, preProductionFinancialTick } from './financial/financialTick';
import { checkWealthBankConsistency } from './invariants';
import { automaticPricing } from './market/automaticPricing';
import { forexMarketMakerPricing } from './market/forexMarketMakerPricing';
import { forexMMRepaymentTick } from './market/forexMarketMakerTick';
import { forexTick } from './market/forexTick';
import { intergenerationalTransfersForPlanet } from './market/intergenerationalTransfers';
import { marketTick } from './market/market';
import { claimBillingTick } from './planet/claimBilling';
import { environmentTick } from './planet/environment';
import type { GameState } from './planet/planet';
import { accumulatePlanetPrices, pushTickerEvent, resetAgentMetrics } from './planet/planet';
import { constructionTick, productionTick } from './planet/production';
import { populationAdvanceYearTick, populationTick } from './population/populationTick';
import { shipTick } from './ships/ships';
import { seedRng } from './utils/stochasticRound';
import { assertPerCellWorkforcePopulationConsistency } from './utils/testHelper';
import { automaticWorkerAllocation } from './workforce/automaticWorkerAllocation';
import { hireWorkforce } from './workforce/hireWorkforce';
import { postProductionLaborMarketTick } from './workforce/laborMarketMonthTick';
import { workforceAdvanceYearTick } from './workforce/workforceAdvanceYearTick';
import { workforceDemographicTick } from './workforce/workforceDemographicTick';

export { seedRng };

const MAX_TICKER_EVENTS = 200;

export function advanceTick(gameState: GameState) {
    gameState.planets.forEach((planet) => {
        const planetMap = new Map([[planet.id, planet]]);

        if (isFirstTickInMonth(gameState.tick)) {
            resetAgentMetrics(gameState.agents, planet);
            resetAgentMetrics(gameState.forexMarketMakers, planet);
        }

        environmentTick(planet);

        if (process.env.SIM_DEBUG) {
            assertPerCellWorkforcePopulationConsistency(
                gameState.agents,
                planet,
                `${planet.name} before workforce tick`,
            );
        }

        const workforceEvents = workforceDemographicTick(gameState.agents, planet);
        populationTick(planet, workforceEvents);

        if (process.env.SIM_DEBUG) {
            assertPerCellWorkforcePopulationConsistency(gameState.agents, planet, 'after');
        }

        if (isFirstTickInMonth(gameState.tick)) {
            automaticWorkerAllocation(gameState.agents, planet);
            hireWorkforce(gameState.agents, planet);
            if (process.env.SIM_DEBUG) {
                assertPerCellWorkforcePopulationConsistency(gameState.agents, planet, 'othermonth');
            }
            automaticLoanRepayment(gameState.agents, planet);
        }
        claimBillingTick(gameState.agents, planet, gameState.tick);
        maturesLoans(gameState.agents, planet, gameState.tick);
        preProductionFinancialTick(gameState.agents, planet, gameState.tick);

        // updateAgentProductionScale(gameState.agents, planet);

        intergenerationalTransfersForPlanet(planet);

        automaticPricing(gameState.agents, planet);

        marketTick(gameState.agents, planet);

        accumulatePlanetPrices(planet, gameState.tick);

        constructionTick(gameState, planet);

        productionTick(gameState, planet);

        if (isMonthBoundary(gameState.tick)) {
            postProductionLaborMarketTick(gameState.agents, planet);
        }

        if (isYearBoundary(gameState.tick)) {
            if (process.env.SIM_DEBUG) {
                assertPerCellWorkforcePopulationConsistency(gameState.agents, planet, 'beforeYear');
            }
            for (const entries of Object.values(planet.resources)) {
                for (const entry of entries) {
                    entry.pausedTicksThisYear = 0;
                }
            }
            populationAdvanceYearTick(planet);
            workforceAdvanceYearTick(gameState.agents, planet);
            if (process.env.SIM_DEBUG) {
                assertPerCellWorkforcePopulationConsistency(gameState.agents, planet, 'afterYear');
            }
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
        }
    });

    pushTickerEvent(gameState, {
        category: 'priceSpike',
        message: 'Price spike check completed ' + `(tick ${gameState.tick})`,
        planetId: 'earth',
        tick: gameState.tick,
    });

    forexMarketMakerPricing(gameState);
    forexTick(gameState);
    forexMMRepaymentTick(gameState);

    shipTick(gameState);

    if (gameState.tickerEvents.length > MAX_TICKER_EVENTS) {
        gameState.tickerEvents = gameState.tickerEvents.slice(-MAX_TICKER_EVENTS);
    }
}
