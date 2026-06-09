import { Record, Map } from 'immutable';

import type { Agent, GameState, Planet } from './planet/planet';
import type { ShipCapitalMarket } from './ships/ships';

interface PlanetRecordShape {
    id: string;
    name: string;

    data: Planet;
}

const PLANET_RECORD_DEFAULTS: PlanetRecordShape = {
    id: '',
    name: '',
    data: null as unknown as Planet,
};

export class PlanetRecord extends Record(PLANET_RECORD_DEFAULTS) {}

interface AgentRecordShape {
    id: string;
    name: string;

    data: Agent;
}

const AGENT_RECORD_DEFAULTS: AgentRecordShape = {
    id: '',
    name: '',
    data: null as unknown as Agent,
};

export class AgentRecord extends Record(AGENT_RECORD_DEFAULTS) {}

interface GameStateRecordShape {
    tick: number;
    planets: Map<string, PlanetRecord>;
    agents: Map<string, AgentRecord>;
    shipCapitalMarket: ShipCapitalMarket;

    forexMarketMakers: globalThis.Map<string, Agent>;

    shipbuilderAgents: globalThis.Map<string, Agent>;

    arbitrageTraders: globalThis.Map<string, Agent>;

    nextEventId: number;
}

const GAME_STATE_RECORD_DEFAULTS: GameStateRecordShape = {
    tick: 0,
    planets: Map<string, PlanetRecord>(),
    agents: Map<string, AgentRecord>(),
    shipCapitalMarket: { tradeHistory: [], emaPrice: {} },
    forexMarketMakers: new globalThis.Map<string, Agent>(),
    shipbuilderAgents: new globalThis.Map<string, Agent>(),
    arbitrageTraders: new globalThis.Map<string, Agent>(),
    nextEventId: 1,
};

export class GameStateRecord extends Record(GAME_STATE_RECORD_DEFAULTS) {}

export function toImmutableGameState(state: GameState): GameStateRecord {
    const planets = Map(
        [...state.planets.entries()].map(([id, p]) => [id, new PlanetRecord({ id: p.id, name: p.name, data: p })]),
    );

    const agents = Map(
        [...state.agents.entries()].map(([id, a]) => [id, new AgentRecord({ id: a.id, name: a.name, data: a })]),
    );

    return new GameStateRecord({
        tick: state.tick,
        planets,
        agents,
        shipCapitalMarket: state.shipCapitalMarket,
        forexMarketMakers: state.forexMarketMakers,
        shipbuilderAgents: state.shipbuilderAgents,
        arbitrageTraders: state.arbitrageTraders,
        nextEventId: state.nextEventId,
    });
}

export function fromImmutableGameState(record: GameStateRecord): GameState {
    const planets = new globalThis.Map<string, Planet>();
    record.planets.forEach((pr) => {
        planets.set(pr.id, pr.data);
    });

    const agents = new globalThis.Map<string, Agent>();
    record.agents.forEach((ar) => {
        agents.set(ar.id, ar.data);
    });

    return {
        tick: record.tick,
        planets,
        agents,
        shipCapitalMarket: record.shipCapitalMarket,
        forexMarketMakers: record.forexMarketMakers,
        shipbuilderAgents: record.shipbuilderAgents,
        arbitrageTraders: record.arbitrageTraders,
        tickerEvents: [],
        nextEventId: record.nextEventId,
    };
}
