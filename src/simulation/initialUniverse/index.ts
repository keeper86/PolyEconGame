import type { GameState, Planet } from '../planet/planet';
import { AC_ID, buildAlphaCentauri } from './alphaCentauri';
import { EARTH_ID } from './earth';
import { buildProceduralWorld, PROC_PLANET_ID } from './proceduralWorld';
import { buildSmallPlanets } from './smallPlanets';
import { seedForexMarketMakers } from '../market/forexMarketMaker';

export {
    createPopulation,
    makeAgent,
    makeAgentPlanetAssets,
    makeAgriculturalProduction,
    makeDefaultEnvironment,
    makeProductionFacility,
    makeStorage,
    makeWaterExtraction,
    type ResourceClaimEntry,
} from './helpers';
export { makeClaim, makeUnclaimedRemainder } from './resourceClaimFactory';
export { AC_ID, EARTH_ID, PROC_PLANET_ID };

export function createInitialGameState(): GameState {
    const { planet: earth, agents: earthAgents } = buildProceduralWorld();
    const { planet: alphaCentauri, agents: acAgents } = buildAlphaCentauri();

    const smallPlanets = buildSmallPlanets();

    const allAgents = [...earthAgents, ...acAgents, ...smallPlanets.flatMap((p) => p.agents)];

    const gameState: GameState = {
        tick: 0,
        planets: new Map([
            [earth.id, earth],
            [alphaCentauri.id, alphaCentauri],
            ...smallPlanets.map(({ planet }) => [planet.id, planet] as [string, Planet]),
        ]),
        agents: new Map(allAgents.map((a) => [a.id, a])),
        shipCapitalMarket: { tradeHistory: [], emaPrice: {} },
        forexMarketMakers: new Map(),
    };

    seedForexMarketMakers(gameState);

    return gameState;
}
