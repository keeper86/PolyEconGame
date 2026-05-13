import { ARBITRAGE_SEED_DEPOSIT } from '../constants';
import { grantLoan } from '../financial/loanTypes';
import { makeAgentPlanetAssets, makeStorage } from '../initialUniverse/helpers';
import type { Agent, GameState } from '../planet/planet';
import { createShip, shiptypes } from '../ships/ships';

const BOOTSTRAP_SHIP_TYPES = [
    shiptypes.solid.bulkCarrier1,
    shiptypes.liquid.tanker1,
    shiptypes.pieces.freighter1,
    shiptypes.gas.gasCarrier1,
];

export function seedArbitrageTraderAgents(gameState: GameState): void {
    const planets = Array.from(gameState.planets.values());

    let count = 0;
    for (const homePlanet of planets) {
        for (let i = 0; i < 2; i++) {
            count++;
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

                grantLoan(assets, planet.bank, ARBITRAGE_SEED_DEPOSIT, 'starter', 0);
                agent.assets[planet.id] = assets;
            }

            // Bootstrap ship: one Bulk Carrier idle at home planet
            const bootstrapShip = createShip(
                BOOTSTRAP_SHIP_TYPES[count % BOOTSTRAP_SHIP_TYPES.length],
                0,
                `Trader Ship ${i + 1} (${homePlanet.name})`,
                homePlanet,
            );
            agent.ships.push(bootstrapShip);

            gameState.arbitrageTraders.set(agentId, agent);
            gameState.agents.set(agentId, agent);
        }
    }
}
