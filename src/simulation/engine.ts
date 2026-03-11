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
import { updateAllocatedWorkers } from './workforce/allocatedWorkers';
import { postProductionLaborMarketTick } from './workforce/laborMarketMonthTick';
import { hireWorkforce } from './workforce/hireWorkforce';
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

        const workforceEvents = workforceDemographicTick(planetAgents, planet);
        populationTick(planetAgents, planet, workforceEvents);

        if (isMonthBoundary(gameState.tick)) {
            updateAllocatedWorkers(planetAgents, planet);
            hireWorkforce(planetAgents, planet);
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
            populationAdvanceYearTick(planet.population);
            workforceAdvanceYearTick(planetAgents);
        }
    });
}
