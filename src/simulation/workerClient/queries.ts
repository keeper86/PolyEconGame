import { sendQuery } from './transport';

export const workerQueries = {
    getCurrentTick: () => sendQuery({ type: 'getCurrentTick' }),

    getFullState: () => sendQuery({ type: 'getFullState' }),

    getPlanet: (planetId: string) => sendQuery({ type: 'getPlanet', planetId }),

    getAllPlanets: () => sendQuery({ type: 'getAllPlanets' }),

    getAgent: (agentId: string) => sendQuery({ type: 'getAgent', agentId }),

    getAllAgents: () => sendQuery({ type: 'getAllAgents' }),

    getLoanConditions: (agentId: string, planetId: string) =>
        sendQuery({ type: 'getLoanConditions', agentId, planetId }),

    getShipCapitalMarket: () => sendQuery({ type: 'getShipCapitalMarket' }),

    getPlanetWithAgents: (planetId: string) => sendQuery({ type: 'getPlanetWithAgents', planetId }),

    getTickerEvents: () => sendQuery({ type: 'getTickerEvents' }),
};
