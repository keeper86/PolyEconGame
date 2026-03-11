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
import { preProductionLaborMarketTick } from './workforce/laborMarketTick';
import { laborMarketYearTick } from './workforce/laborMarketYearTick';

export { seedRng };

// internalTickCounter has been removed; gameState.tick (incremented by the
// caller before advanceTick is called) is used for all boundary checks.
export function advanceTick(gameState: GameState) {
    gameState.planets.forEach((planet) => {
        const planetAgents = new Map<string, Agent>();
        for (const agent of gameState.agents.values()) {
            planetAgents.set(agent.id, agent);
        }

        // 1. Environment tick
        environmentTick(planet);

        // 2. Workforce allocation update
        updateAllocatedWorkers(planetAgents, planet);

        // 3. Labor market tick (monthly: hiring, firing, voluntary quits)
        if (isMonthBoundary(gameState.tick)) {
            preProductionLaborMarketTick(planetAgents, planet);
        }

        // 4. Pre-production financial tick: wages, working-capital loans
        preProductionFinancialTick(planetAgents, planet);

        // 5. Population tick: nutrition, mortality, disability, fertility
        populationTick(planetAgents, planet);

        // 6. Production tick: facility output
        productionTick(planetAgents, planet);

        // 7. Agent pricing: each food producer sets its offer price & quantity
        updateAgentPricing(planetAgents, planet);

        // 8. Intergenerational transfers: family support flows
        //    Runs BEFORE the food market so that dependent cohorts (children,
        //    elderly) receive wealth they can spend on food in the same tick.
        intergenerationalTransfersForPlanet(planet);

        // 9. Food market clearing: demand, per-agent merit-order dispatch, settlement
        foodMarketTick(planetAgents, planet);

        // 11. Post-production financial tick: loan repayment, reconciliation
        postProductionFinancialTick(planetAgents, planet);

        // Month/year boundary updates
        if (isMonthBoundary(gameState.tick)) {
            postProductionLaborMarketTick(planetAgents, planet);
        }

        if (isYearBoundary(gameState.tick)) {
            populationAdvanceYearTick(planet.population);
            laborMarketYearTick(planetAgents);
        }
    });
}
