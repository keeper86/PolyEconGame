import { isMonthBoundary, isYearBoundary } from './constants';
import { automaticLoanRepayment, preProductionFinancialTick } from './financial/financialTick';
import { checkWealthBankConsistency } from './invariants';
import { automaticPricing } from './market/automaticPricing';
import { marketTick } from './market/market';
import { intergenerationalTransfersForPlanet } from './market/intergenerationalTransfers';
import { environmentTick } from './planet/environment';
import type { Agent, GameState } from './planet/planet';
import { productionTick } from './planet/production';
import { populationAdvanceYearTick, populationTick } from './population/populationTick';
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
        const planetAgents = new Map<string, Agent>();
        for (const agent of gameState.agents.values()) {
            planetAgents.set(agent.id, agent);
        }

        const planetMap = new Map([[planet.id, planet]]);

        environmentTick(planet);

        if (process.env.SIM_DEBUG) {
            assertPerCellWorkforcePopulationConsistency(planetAgents, planet, `${planet.name} before workforce tick`);
        }

        const workforceEvents = workforceDemographicTick(planetAgents, planet);
        populationTick(planet, workforceEvents);

        if (process.env.SIM_DEBUG) {
            assertPerCellWorkforcePopulationConsistency(planetAgents, planet, 'after');
        }

        if (isMonthBoundary(gameState.tick)) {
            automaticWorkerAllocation(planetAgents, planet);
            hireWorkforce(planetAgents, planet);
            if (process.env.SIM_DEBUG) {
                assertPerCellWorkforcePopulationConsistency(planetAgents, planet, 'othermonth');
            }
        }
        preProductionFinancialTick(planetAgents, planet);

        //updateAgentProductionScale(planetAgents, planet);

        intergenerationalTransfersForPlanet(planet);

        marketTick(planetAgents, planet);

        productionTick(planetAgents, planet);

        automaticLoanRepayment(planetAgents, planet);

        automaticPricing(planetAgents, planet);

        if (isMonthBoundary(gameState.tick)) {
            postProductionLaborMarketTick(planetAgents, planet);
        }

        if (isYearBoundary(gameState.tick)) {
            if (process.env.SIM_DEBUG) {
                assertPerCellWorkforcePopulationConsistency(planetAgents, planet, 'beforeYear');
            }
            populationAdvanceYearTick(planet);
            workforceAdvanceYearTick(planetAgents, planet);
            if (process.env.SIM_DEBUG) {
                assertPerCellWorkforcePopulationConsistency(planetAgents, planet, 'afterYear');
            }
        }
        if (process.env.SIM_DEBUG) {
            assertPerCellWorkforcePopulationConsistency(planetAgents, planet, `${planet.name} end of tick`);
            if (checkWealthBankConsistency(planetMap, 'end of tick').length > 0) {
                console.error(
                    `Wealth-bank inconsistency detected on planet ${planet.name} at end of tick ${gameState.tick}`,
                );
            }
        }
    });
}
