import type { GameState, Planet } from '../planet/planet';
import { buildEarth, EARTH_ID } from './earth';
import { buildAlphaCentauri, AC_ID } from './alphaCentauri';
import { buildProceduralWorld, PROC_PLANET_ID } from './proceduralWorld';
import { buildSmallPlanets } from './smallPlanets';

export { EARTH_ID, AC_ID, PROC_PLANET_ID };
export {
    makeProductionFacility,
    makeStorage,
    makeAgentPlanetAssets,
    makeAgent,
    createPopulation,
    makeDefaultEnvironment,
    makeWaterExtraction,
    makeAgriculturalProduction,
    type ResourceClaimEntry,
} from './helpers';
export { makeClaim, makeUnclaimedRemainder } from './resourceClaimFactory';

export function createInitialGameState(): GameState {
    const { planet: earth, agents: earthAgents } = buildProceduralWorld();
    const { planet: alphaCentauri, agents: acAgents } = buildAlphaCentauri();

    const smallPlanets = buildSmallPlanets();

    const allAgents = [...earthAgents, ...acAgents, ...smallPlanets.flatMap((p) => p.agents)];

    return {
        tick: 0,
        planets: new Map([
            [earth.id, earth],
            [alphaCentauri.id, alphaCentauri],
            ...smallPlanets.map(({ planet }) => [planet.id, planet] as [string, Planet]),
        ]),
        agents: new Map(allAgents.map((a) => [a.id, a])),
    };
}
