import type { Agent, Planet } from '../planet/planet';

export const governmentTick = (planet: Planet, agent: Agent) => {
    if (agent.id !== planet.governmentId) {
        throw new Error(`Tick called on non-government agent ${agent.id} of planet ${planet.id}`);
    }
};
