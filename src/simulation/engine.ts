import { isMonthBoundary, isYearBoundary } from './constants';
import { postProductionFinancialTick, preProductionFinancialTick } from './financial/financialTick';
import { updateAgentPricing } from './market/agentPricing';
import { foodMarketTick } from './market/foodMarket';
import { updateAgentProductionScale } from './planet/agentProduction';
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
import { checkWealthBankConsistency } from './invariants';

export { seedRng };

function logWealthDivergence(
    step: string,
    tick: number,
    discrepancies: ReturnType<typeof checkWealthBankConsistency>,
): void {
    for (const d of discrepancies) {
        console.error(
            `[engine] wealth/bank divergence | tick=${tick} step=${step} planet=${d.planetName}` +
                ` | householdDeposits=${d.householdDeposits.toFixed(2)}` +
                ` populationWealth=${d.populationWealth.toFixed(2)}` +
                ` diff=${d.diff.toFixed(4)}` +
                ` diffPerCapita=${d.diffPerCapita.toFixed(6)}` +
                ` totalPopulation=${Math.round(d.totalPopulation)}`,
        );
    }
}

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
            logWealthDivergence('BEFOREpopulationTick', gameState.tick, checkWealthBankConsistency(planetMap));
        }

        const workforceEvents = workforceDemographicTick(planetAgents, planet);
        populationTick(planet, workforceEvents);

        if (process.env.SIM_DEBUG) {
            assertPerCellWorkforcePopulationConsistency(planetAgents, planet, 'after');
            logWealthDivergence('populationTick', gameState.tick, checkWealthBankConsistency(planetMap));
        }

        if (isMonthBoundary(gameState.tick)) {
            updateAllocatedWorkers(planetAgents, planet);
            hireWorkforce(planetAgents, planet);
            if (process.env.SIM_DEBUG) {
                assertPerCellWorkforcePopulationConsistency(planetAgents, planet, 'othermonth');
                logWealthDivergence('hireWorkforce', gameState.tick, checkWealthBankConsistency(planetMap));
            }
        }

        preProductionFinancialTick(planetAgents, planet);

        if (process.env.SIM_DEBUG) {
            logWealthDivergence('preProductionFinancialTick', gameState.tick, checkWealthBankConsistency(planetMap));
        }

        productionTick(planetAgents, planet);

        updateAgentPricing(planetAgents, planet);

        updateAgentProductionScale(planetAgents, planet);

        intergenerationalTransfersForPlanet(planet);

        if (process.env.SIM_DEBUG) {
            logWealthDivergence('intergenerationalTransfers', gameState.tick, checkWealthBankConsistency(planetMap));
        }

        foodMarketTick(planetAgents, planet);

        if (process.env.SIM_DEBUG) {
            logWealthDivergence('foodMarketTick', gameState.tick, checkWealthBankConsistency(planetMap));
        }

        postProductionFinancialTick(planetAgents, planet);

        if (process.env.SIM_DEBUG) {
            logWealthDivergence('postProductionFinancialTick', gameState.tick, checkWealthBankConsistency(planetMap));
        }

        if (isMonthBoundary(gameState.tick)) {
            postProductionLaborMarketTick(planetAgents, planet);
            if (process.env.SIM_DEBUG) {
                logWealthDivergence(
                    'postProductionLaborMarketTick',
                    gameState.tick,
                    checkWealthBankConsistency(planetMap),
                );
            }
        }

        if (isYearBoundary(gameState.tick)) {
            if (process.env.SIM_DEBUG) {
                assertPerCellWorkforcePopulationConsistency(planetAgents, planet, 'beforeYear');
            }
            populationAdvanceYearTick(planet);
            workforceAdvanceYearTick(planetAgents, planet);
            if (process.env.SIM_DEBUG) {
                assertPerCellWorkforcePopulationConsistency(planetAgents, planet, 'afterYear');
                logWealthDivergence('populationAdvanceYearTick', gameState.tick, checkWealthBankConsistency(planetMap));
            }
        }
        if (process.env.SIM_DEBUG) {
            assertPerCellWorkforcePopulationConsistency(planetAgents, planet, `${planet.name} end of tick`);
            logWealthDivergence('end of tick', gameState.tick, checkWealthBankConsistency(planetMap));
        }
    });
}
