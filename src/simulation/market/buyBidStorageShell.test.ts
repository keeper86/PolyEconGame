import { describe, expect, it } from 'vitest';

import { getAvailableStorageCapacity } from '../planet/facility';
import { coalResourceType, copperResourceType } from '../planet/resources';
import { ironSmelter } from '../planet/productionFacilities';
import { updateAgentShellCompartments } from '../planet/automaticProductionScale/agentStorage';
import { makeAgent, makeGameState, makePlanet, makeStorageFacility } from '../utils/testHelper';
import { collectAgentBids } from './orderCollection';

const COAL = coalResourceType.name;
const COPPER = copperResourceType.name;

function makePlayerAgent(): { planetId: string; agent: ReturnType<typeof makeAgent> } {
    const planetId = 'p';
    const agent = makeAgent('player', planetId, 'Player Co', { automated: false });
    agent.assets[planetId].deposits = 1_000_000;
    agent.assets[planetId].storage = makeStorageFacility({ planetId, id: 'storage-player' }, 20);
    agent.assets[planetId].productionFacilities = [ironSmelter(planetId, 'smelter')];
    agent.assets[planetId].market = {
        sell: {},
        buy: {
            [COAL]: {
                resource: coalResourceType,
                bidPrice: 5,
                bidStorageTarget: 1_000,
                automated: true,
            },
            [COPPER]: {
                resource: copperResourceType,
                bidPrice: 30,
                bidStorageTarget: 1_000,
                automated: true,
            },
        },
    };
    return { planetId, agent };
}

describe('non-automated agent buys a production input', () => {
    it('gets its shell compartment authored so the bid reaches the order book', () => {
        const { planetId, agent } = makePlayerAgent();
        const planet = makePlanet({ id: planetId });
        const gameState = makeGameState(planet, [agent]);

        updateAgentShellCompartments(gameState, planet);

        expect(agent.assets[planetId].storage.shells.solid.compartments[COAL]).toBeGreaterThan(0);
        expect(getAvailableStorageCapacity(agent.assets[planetId].storage, coalResourceType)).toBeGreaterThan(0);

        const books = collectAgentBids(gameState.agents, planet);
        expect(books.get(COAL) ?? []).toHaveLength(1);
    });

    it('drops a bid for a resource no facility touches until compartments can be authored explicitly', () => {
        const { planetId, agent } = makePlayerAgent();
        const planet = makePlanet({ id: planetId });
        const gameState = makeGameState(planet, [agent]);

        updateAgentShellCompartments(gameState, planet);

        expect(agent.assets[planetId].storage.shells.solid.compartments[COPPER]).toBeUndefined();
        expect(getAvailableStorageCapacity(agent.assets[planetId].storage, copperResourceType)).toBe(0);

        const books = collectAgentBids(gameState.agents, planet);
        expect(books.get(COPPER) ?? []).toHaveLength(0);
    });
});
