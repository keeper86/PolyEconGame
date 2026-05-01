import type { Planet, Agent } from './planet/planet';
import type { LoanConditions } from '../server/controller/simulation';
import type { Loan } from './financial/loanTypes';
import type { ShipCapitalMarket } from './ships/ships';

// ---------------------------------------------------------------------------
// Query shapes (main → worker)
// ---------------------------------------------------------------------------

export type WorkerQuery =
    | { type: 'getCurrentTick' }
    | { type: 'getFullState' }
    | { type: 'getPlanet'; planetId: string }
    | { type: 'getAllPlanets' }
    | { type: 'getAgent'; agentId: string }
    | { type: 'getAllAgents' }
    | { type: 'getAgentsByPlanet'; planetId: string }
    | { type: 'getLoanConditions'; agentId: string; planetId: string }
    | { type: 'getShipCapitalMarket' };

// ---------------------------------------------------------------------------
// Result shapes (worker → main), keyed by query type
// ---------------------------------------------------------------------------

/** Maps each query `type` to its result payload (excluding requestId / error
 *  envelope — those are added by WorkerResponseMessage). */
export interface WorkerQueryResult {
    getCurrentTick: { tick: number };
    getFullState: { tick: number; planets: Planet[]; agents: Agent[] };
    getPlanet: { planet: Planet | null };
    getAllPlanets: { tick: number; planets: Planet[] };
    getAgent: { agent: Agent | null };
    getAllAgents: { tick: number; agents: Agent[] };
    getAgentsByPlanet: { agents: Agent[] };
    getLoanConditions: { conditions: LoanConditions | null; activeLoans: Loan[] };
    getShipCapitalMarket: { shipCapitalMarket: ShipCapitalMarket };
}

// ---------------------------------------------------------------------------
// Wire messages
// ---------------------------------------------------------------------------

/** Inbound query message sent from main thread to worker. */
export type WorkerQueryMessage = WorkerQuery & { requestId: string };

/** Successful response sent from worker to main thread. */
export type WorkerSuccessResponse<T extends WorkerQuery['type'] = WorkerQuery['type']> = {
    type: 'queryResponse';
    requestId: string;
    queryType: T;
    data: WorkerQueryResult[T];
};

/** Error response sent from worker when a query fails. */
export type WorkerErrorResponse = {
    type: 'queryError';
    requestId: string;
    error: string;
};

/** Union of all possible response messages from the worker related to queries. */
export type WorkerResponseMessage = WorkerSuccessResponse | WorkerErrorResponse;
