import { isFirstTickInMonth, isMonthBoundary, isYearBoundary } from './constants';
import { automaticLoanRepayment, preProductionFinancialTick } from './financial/financialTick';
import { checkWealthBankConsistency } from './invariants';
import { automaticPricing } from './market/automaticPricing';
import { intergenerationalTransfersForPlanet } from './market/intergenerationalTransfers';
import { marketTick } from './market/market';
import { forexTick } from './market/forexTick';
import { forexMarketMakerPricing } from './market/forexMarketMakerPricing';
import { forexMMRepaymentTick } from './market/forexMarketMakerTick';
import { claimBillingTick } from './planet/claimBilling';
import { environmentTick } from './planet/environment';
import type { GameState } from './planet/planet';
import { accumulatePlanetPrices, resetAgentMetrics } from './planet/planet';
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
        }
        claimBillingTick(gameState.agents, planet, gameState.tick);
        preProductionFinancialTick(gameState.agents, planet);

        // updateAgentProductionScale(gameState.agents, planet);

        intergenerationalTransfersForPlanet(planet);

        automaticPricing(gameState.agents, planet);

        marketTick(gameState.agents, planet);

        accumulatePlanetPrices(planet, gameState.tick);

        constructionTick(gameState.agents, planet);

        productionTick(gameState.agents, planet, gameState.tick);

        automaticLoanRepayment(gameState.agents, planet, gameState.tick);

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

    // inter-planet effects and markets
    forexMarketMakerPricing(gameState);
    forexTick(gameState);
    forexMMRepaymentTick(gameState);
    shipTick(gameState);
}
