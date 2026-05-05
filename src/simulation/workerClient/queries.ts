import { sendQuery } from './transport';

export const workerQueries = {
    /** Get the current simulation tick number. */
    getCurrentTick: () => sendQuery({ type: 'getCurrentTick' }),

    /** Get the full game state (all planets + agents). */
    getFullState: () => sendQuery({ type: 'getFullState' }),

    /** Get a single planet by ID. */
    getPlanet: (planetId: string) => sendQuery({ type: 'getPlanet', planetId }),

    /** Get all planets. */
    getAllPlanets: () => sendQuery({ type: 'getAllPlanets' }),

    /** Get a single agent by ID. */
    getAgent: (agentId: string) => sendQuery({ type: 'getAgent', agentId }),

    /** Get all agents. */
    getAllAgents: () => sendQuery({ type: 'getAllAgents' }),

    /** Get credit conditions the bank would offer an agent on a planet. */

    getLoanConditions: (agentId: string, planetId: string) =>
        sendQuery({ type: 'getLoanConditions', agentId, planetId }),

    /** Get the ship capital market state (trade history + EMA prices). */
    getShipCapitalMarket: () => sendQuery({ type: 'getShipCapitalMarket' }),

    getPlanetWithAgents: (planetId: string) => sendQuery({ type: 'getPlanetWithAgents', planetId }),

    /** Get the rolling buffer of ticker events. */
    getTickerEvents: () => sendQuery({ type: 'getTickerEvents' }),
};
