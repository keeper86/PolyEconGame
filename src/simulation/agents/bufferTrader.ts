import { BUFFER_TRADER_SEED_DEPOSIT, BUFFER_TRADER_STORAGE_SCALE } from '../constants';
import { grantLoan } from '../financial/loanTypes';
import { makeAgentPlanetAssets, makeStorage } from '../initialUniverse/helpers';
import type { Agent, GameState } from '../planet/planet';

export function seedBufferTraderAgents(gameState: GameState): void {
    for (const planet of gameState.planets.values()) {
        const agentId = `buf_${planet.id}`;

        const agent: Agent = {
            id: agentId,
            name: `${planet.name} Buffer`,
            automated: true,
            automateWorkerAllocation: true,
            logo: 'ai_company',
            foundedTick: gameState.tick,
            starterLoanTaken: true,
            associatedPlanetId: planet.id,
            agentRole: 'buffer_trader',
            ships: [],
            assets: {},
        };

        const storage = makeStorage({
            planetId: planet.id,
            id: `${agentId}_store`,
            scale: BUFFER_TRADER_STORAGE_SCALE,
        });
        const assets = makeAgentPlanetAssets([], storage, null);
        assets.licenses = { commercial: { acquiredTick: gameState.tick, frozen: false } };
        assets.market = { sell: {}, buy: {} };

        grantLoan(assets, planet.bank, BUFFER_TRADER_SEED_DEPOSIT, 'forexWorkingCapital', gameState.tick);
        agent.assets[planet.id] = assets;

        gameState.bufferTraders.set(agentId, agent);
        gameState.agents.set(agentId, agent);
    }
}
