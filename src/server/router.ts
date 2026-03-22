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
    getLoanConditions,
} from './controller/simulation';
import {
    getPlanetOverview,
    getPlanetDemographics,
    getPlanetEconomy,
    getPlanetFood,
    getPlanetDemographicsFull,
    getPlanetMarket,
} from './controller/planet';

import {
    getUser,
    getUsers,
    updateUser,
    getUserIdFromSession,
    createAgent,
    requestLoan,
    setAutomation,
    setWorkerAllocationTargets,
    setSellOffers,
    claimResources,
} from './controller/user';
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
    getLoanConditions: getLoanConditions(),
    getPlanetOverview: getPlanetOverview(),
    getPlanetDemographics: getPlanetDemographics(),
    getPlanetEconomy: getPlanetEconomy(),
    getPlanetFood: getPlanetFood(),
    getPlanetDemographicsFull: getPlanetDemographicsFull(),
    getPlanetMarket: getPlanetMarket(),
    // historical endpoints removed
});

const protectedAppRouter = trpcRoot.router({
    getUsers: getUsers(),
    getUser: getUser(),
    updateUser: updateUser(),
    getUserIdFromSession: getUserIdFromSession(),
    createAgent: createAgent(),
    requestLoan: requestLoan(),
    setAutomation: setAutomation(),
    setWorkerAllocationTargets: setWorkerAllocationTargets(),
    setSellOffers: setSellOffers(),
    claimResources: claimResources(),
});

export const publicAccessibleRouter = trpcRoot.router({
    logs: logs(),
    health: health(),
    ship: ship(),
    simulation: simulationRouter,
});

export const appRouter = trpcRoot.mergeRouters(publicAccessibleRouter, protectedAppRouter);
export type AppRouter = typeof appRouter;
