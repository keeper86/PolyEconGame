import { ARBITRAGE_SEED_DEPOSIT, ARBITRAGE_BOOTSTRAP_LOAN } from '../constants';
import { grantLoan } from '../financial/loanTypes';
import { makeAgentPlanetAssets, makeStorage } from '../initialUniverse/helpers';
import type { Agent, GameState } from '../planet/planet';
import { createShip, shiptypes } from '../ships/ships';

const BOOTSTRAP_SHIP_TYPE = shiptypes.solid.bulkCarrier1;

export function seedArbitrageTraderAgents(gameState: GameState): void {
    const planets = Array.from(gameState.planets.values());

    for (const homePlanet of planets) {
        for (let i = 0; i < 2; i++) {
            const agentId = `arb_${homePlanet.id}_${i}`;

            const agent: Agent = {
                id: agentId,
                name: `Arbitrage Trader ${i + 1} (${homePlanet.name})`,
                automated: true,
                automateWorkerAllocation: true,
                foundedTick: 0,
                starterLoanTaken: true,
                associatedPlanetId: homePlanet.id,
                agentRole: 'arbitrage_trader',
                ships: [],
                assets: {},
            };

            // Create assets + seed deposit on every planet
            for (const planet of planets) {
                const storage = makeStorage({
                    planetId: planet.id,
                    id: `${agentId}_store_${planet.id}`,
                    name: 'Trader Storage',
                    volumeCapacity: 5e14,
                    massCapacity: 5e15,
                });
                const assets = makeAgentPlanetAssets(planet.id, [], storage);
                assets.licenses = { commercial: { acquiredTick: 0, frozen: false } };
                assets.market = { sell: {}, buy: {} };

                grantLoan(assets, planet.bank, ARBITRAGE_SEED_DEPOSIT, 'arbitrageBootstrap', 0);
                agent.assets[planet.id] = assets;
            }

            // Bootstrap ship: one Bulk Carrier idle at home planet
            const bootstrapShip = createShip(
                BOOTSTRAP_SHIP_TYPE,
                0,
                `Trader Ship ${i + 1} (${homePlanet.name})`,
                homePlanet,
            );
            agent.ships.push(bootstrapShip);
            grantLoan(agent.assets[homePlanet.id], homePlanet.bank, ARBITRAGE_BOOTSTRAP_LOAN, 'arbitrageBootstrap', 0);

            gameState.arbitrageTraders.set(agentId, agent);
            gameState.agents.set(agentId, agent);
        }
    }
}
