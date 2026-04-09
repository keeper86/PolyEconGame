import { health } from './controller/health';
import { logs } from './controller/logs';
import {
    getAgentClaims,
    getPlanetClaims,
    getPlanetDemographics,
    getPlanetDemographicsFull,
    getPlanetEconomy,
    getPlanetMarket,
    getPlanetMarketOverview,
    getPlanetOverview,
} from './controller/planet';
import { ship } from './controller/ship';
import {
    getAgentDetail,
    getAgentFinancials,
    getAgentHistory,
    getAgentListSummaries,
    getAgentOverview,
    getAgentPlanetDetail,
    getCurrentTick,
    getLatestAgents,
    getLatestPlanetSummaries,
    getLoanConditions,
    getPlanetDetail,
    getPlanetPopulationHistory,
    getProductPriceHistory,
} from './controller/simulation';

import {
    buildFacility,
    cancelBuyBid,
    cancelSellOffer,
    createAgent,
    expandFacility,
    getUser,
    getUserIdFromSession,
    getUsers,
    leaseClaim,
    quitClaim,
    requestLoan,
    setAutomation,
    setBuyBids,
    setSellOffers,
    setWorkerAllocationTargets,
    updateUser,
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
    getProductPriceHistory: getProductPriceHistory(),
    getAgentHistory: getAgentHistory(),
    getLoanConditions: getLoanConditions(),
    getAgentFinancials: getAgentFinancials(),
    getPlanetOverview: getPlanetOverview(),
    getPlanetDemographics: getPlanetDemographics(),
    getPlanetEconomy: getPlanetEconomy(),
    getPlanetDemographicsFull: getPlanetDemographicsFull(),
    getPlanetMarket: getPlanetMarket(),
    getPlanetMarketOverview: getPlanetMarketOverview(),
    getPlanetClaims: getPlanetClaims(),
    getAgentClaims: getAgentClaims(),
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
    cancelSellOffer: cancelSellOffer(),
    cancelBuyBid: cancelBuyBid(),
    setBuyBids: setBuyBids(),
    buildFacility: buildFacility(),
    expandFacility: expandFacility(),
    leaseClaim: leaseClaim(),
    quitClaim: quitClaim(),
});

export const publicAccessibleRouter = trpcRoot.router({
    logs: logs(),
    health: health(),
    ship: ship(),
    simulation: simulationRouter,
});

export const appRouter = trpcRoot.mergeRouters(publicAccessibleRouter, protectedAppRouter);
export type AppRouter = typeof appRouter;
