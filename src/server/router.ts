import { health } from './controller/health';
import { logs } from './controller/logs';
import { ship } from './controller/ship';
import { getLatestPlanets, getLatestAgents, getPlanetHistory, getAgentHistory } from './controller/simulation';

import { getUser, getUsers, updateUser } from './controller/user';
import { trpcRoot } from './trpcRoot';

const simulationRouter = trpcRoot.router({
    getLatestPlanets: getLatestPlanets(),
    getLatestAgents: getLatestAgents(),
    getPlanetHistory: getPlanetHistory(),
    getAgentHistory: getAgentHistory(),
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
