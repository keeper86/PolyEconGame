import type { Planet, Agent } from './planet/planet';

import type { LoanConditions, TickerEvent } from '../server/controller/simulation';
import type { Loan } from './financial/loanTypes';
import type { ShipCapitalMarket } from './ships/ships';

export type WorkerQuery =
    | { type: 'getCurrentTick' }
    | { type: 'getFullState' }
    | { type: 'getPlanet'; planetId: string }
    | { type: 'getAllPlanets' }
    | { type: 'getAgent'; agentId: string }
    | { type: 'getAllAgents' }
    | { type: 'getLoanConditions'; agentId: string; planetId: string }
    | { type: 'getShipCapitalMarket' }
    | { type: 'getPlanetWithAgents'; planetId: string }
    | { type: 'getTickerEvents' };

export interface WorkerQueryResult {
    getCurrentTick: { tick: number };
    getFullState: { tick: number; planets: Planet[]; agents: Agent[] };
    getPlanet: { planet: Planet | null };
    getAllPlanets: { tick: number; planets: Planet[] };
    getAgent: { agent: Agent | null };
    getAllAgents: { tick: number; agents: Agent[] };
    getLoanConditions: { conditions: LoanConditions | null; activeLoans: Loan[] };
    getShipCapitalMarket: { shipCapitalMarket: ShipCapitalMarket };
    getPlanetWithAgents: { tick: number; planet: Planet | null; agents: Agent[] };
    getTickerEvents: { tickerEvents: TickerEvent[] };
}

export type WorkerQueryMessage = WorkerQuery & { requestId: string };

export type WorkerSuccessResponse<T extends WorkerQuery['type'] = WorkerQuery['type']> = {
    type: 'queryResponse';
    requestId: string;
    queryType: T;
    data: WorkerQueryResult[T];
};

export type WorkerErrorResponse = {
    type: 'queryError';
    requestId: string;
    error: string;
};

export type WorkerResponseMessage = WorkerSuccessResponse | WorkerErrorResponse;
