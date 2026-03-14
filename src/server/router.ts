import { health } from './controller/health';
import { logs } from './controller/logs';
import { ship } from './controller/ship';
import {
    getLatestPlanetSummaries,
    getLatestAgents,
    getAgentListSummaries,
    getAgentDetail,
    getAgentOverview,
    getAgentPlanetDetail,
    getPlanetDetail,
    getPlanetPopulationHistory,
    getCurrentTick,
} from './controller/simulation';
import {
    getPlanetOverview,
    getPlanetDemographics,
    getPlanetEconomy,
    getPlanetFood,
    getPlanetDemographicsFull,
    getPlanetFoodMarket,
} from './controller/planet';

import { getUser, getUsers, updateUser } from './controller/user';
import { trpcRoot } from './trpcRoot';

const simulationRouter = trpcRoot.router({
    getCurrentTick: getCurrentTick(),
    getLatestPlanetSummaries: getLatestPlanetSummaries(),
    getLatestAgents: getLatestAgents(),
    getAgentListSummaries: getAgentListSummaries(),
    getAgentDetail: getAgentDetail(),
    getAgentOverview: getAgentOverview(),
    getAgentPlanetDetail: getAgentPlanetDetail(),
    getPlanetDetail: getPlanetDetail(),
    getPlanetPopulationHistory: getPlanetPopulationHistory(),
    getPlanetOverview: getPlanetOverview(),
    getPlanetDemographics: getPlanetDemographics(),
    getPlanetEconomy: getPlanetEconomy(),
    getPlanetFood: getPlanetFood(),
    getPlanetDemographicsFull: getPlanetDemographicsFull(),
    getPlanetFoodMarket: getPlanetFoodMarket(),
    // historical endpoints removed
});

const protectedAppRouter = trpcRoot.router({
    getUsers: getUsers(),
    getUser: getUser(),
    updateUser: updateUser(),
});

export const publicAccessibleRouter = trpcRoot.router({
    logs: logs(),
    health: health(),
    ship: ship(),
    simulation: simulationRouter,
});

export const appRouter = trpcRoot.mergeRouters(publicAccessibleRouter, protectedAppRouter);
export type AppRouter = typeof appRouter;
