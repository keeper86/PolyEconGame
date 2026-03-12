import { isMonthBoundary, isYearBoundary } from './constants';
import { postProductionFinancialTick, preProductionFinancialTick } from './financial/financialTick';
import { updateAgentPricing } from './market/agentPricing';
import { foodMarketTick } from './market/foodMarket';
import { intergenerationalTransfersForPlanet } from './market/intergenerationalTransfers';
import { environmentTick } from './planet/environment';
import type { Agent, GameState } from './planet/planet';
import { productionTick } from './planet/production';
import { populationAdvanceYearTick, populationTick } from './population/populationTick';
import { seedRng } from './utils/stochasticRound';
import { assertPerCellWorkforcePopulationConsistency } from './utils/testHelper';
import { updateAllocatedWorkers } from './workforce/allocatedWorkers';
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
            updateAllocatedWorkers(planetAgents, planet);
            hireWorkforce(planetAgents, planet);
            if (process.env.SIM_DEBUG) {
                assertPerCellWorkforcePopulationConsistency(planetAgents, planet, 'othermonth');
            }
        }

        preProductionFinancialTick(planetAgents, planet);

        productionTick(planetAgents, planet);

        updateAgentPricing(planetAgents, planet);

        intergenerationalTransfersForPlanet(planet);

        foodMarketTick(planetAgents, planet);

        postProductionFinancialTick(planetAgents, planet);

        if (isMonthBoundary(gameState.tick)) {
            postProductionLaborMarketTick(planetAgents, planet);
        }

        if (isYearBoundary(gameState.tick)) {
            if (process.env.SIM_DEBUG) {
                assertPerCellWorkforcePopulationConsistency(planetAgents, planet, 'beforeYear');
            }
            populationAdvanceYearTick(planet.population);
            workforceAdvanceYearTick(planetAgents, planet);
            if (process.env.SIM_DEBUG) {
                assertPerCellWorkforcePopulationConsistency(planetAgents, planet, 'afterYear');
            }
        }
        if (process.env.SIM_DEBUG) {
            assertPerCellWorkforcePopulationConsistency(planetAgents, planet, `${planet.name} end of tick`);
        }
    });
}
