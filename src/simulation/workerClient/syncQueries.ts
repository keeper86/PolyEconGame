import { getCachedGameState, getLatestTick, type SnapshotCache } from './manager';
import type { Planet, Agent } from '../planet/planet';
import type { ShipCapitalMarket } from '../ships/ships';
import type { TickerEvent, LoanConditions } from '../../server/controller/simulation';
import type { Loan } from '../financial/loanTypes';
import { computeLoanConditions } from '../financial/loanConditions';

/**
 * Synchronous query accessors that read from the cached game state.
 * These replace the async worker roundtrip queries entirely.
 */

function getCache(): SnapshotCache | null {
    return getCachedGameState();
}

export function getCurrentTickSync(): { tick: number } {
    return { tick: getLatestTick() };
}

export function getFullStateSync(): { tick: number; planets: Planet[]; agents: Agent[] } {
    const cache = getCache();
    if (!cache) {
        return { tick: getLatestTick(), planets: [], agents: [] };
    }
    return { tick: cache.tick, planets: cache.planets, agents: cache.agents };
}

export function getPlanetSync(planetId: string): { planet: Planet | null } {
    const cache = getCache();
    if (!cache) {
        return { planet: null };
    }
    return { planet: cache.planetsById.get(planetId) ?? null };
}

export function getAllPlanetsSync(): { tick: number; planets: Planet[] } {
    const cache = getCache();
    if (!cache) {
        return { tick: getLatestTick(), planets: [] };
    }
    return { tick: cache.tick, planets: cache.planets };
}

export function getAgentSync(agentId: string): { agent: Agent | null } {
    const cache = getCache();
    if (!cache) {
        return { agent: null };
    }
    return { agent: cache.agentsById.get(agentId) ?? null };
}

export function getAllAgentsSync(): { tick: number; agents: Agent[] } {
    const cache = getCache();
    if (!cache) {
        return { tick: getLatestTick(), agents: [] };
    }
    return { tick: cache.tick, agents: cache.agents };
}

export function getForexMarketMakersSync(): Agent[] {
    const cache = getCache();
    if (!cache) {
        return [];
    }
    return cache.forexMarketMakers;
}

export function getShipbuilderAgentsSync(): Agent[] {
    const cache = getCache();
    if (!cache) {
        return [];
    }
    return cache.shipbuilderAgents;
}

export function getArbitrageTradersSync(): Agent[] {
    const cache = getCache();
    if (!cache) {
        return [];
    }
    return cache.arbitrageTraders;
}

export function getLoanConditionsSync(
    agentId: string,
    planetId: string,
): { conditions: LoanConditions | null; activeLoans: Loan[] } {
    const cache = getCache();
    if (!cache) {
        return { conditions: null, activeLoans: [] };
    }
    const agent = cache.agentsById.get(agentId);
    const planet = cache.planetsById.get(planetId);
    if (!agent || !planet) {
        return { conditions: null, activeLoans: agent?.assets[planetId]?.activeLoans ?? [] };
    }
    return {
        conditions: computeLoanConditions(agent, planet, cache.shipCapitalMarket),
        activeLoans: agent.assets[planetId]?.activeLoans ?? [],
    };
}

export function getShipCapitalMarketSync(): { shipCapitalMarket: ShipCapitalMarket } {
    const cache = getCache();
    if (!cache) {
        return { shipCapitalMarket: { tradeHistory: [], emaPrice: {} } };
    }
    return { shipCapitalMarket: cache.shipCapitalMarket };
}

export function getPlanetWithAgentsSync(planetId: string): { tick: number; planet: Planet | null; agents: Agent[] } {
    const cache = getCache();
    if (!cache) {
        return { tick: getLatestTick(), planet: null, agents: [] };
    }
    const planet = cache.planetsById.get(planetId);
    // O(1) lookup from pre-built index instead of O(N) filter over all agents
    const agents = cache.agentsByPlanetId.get(planetId) ?? [];
    const forexMMs = cache.forexMarketMakersByPlanetId.get(planetId) ?? [];
    return {
        tick: cache.tick,
        planet: planet ?? null,
        agents: [...agents, ...forexMMs],
    };
}

export function getTickerEventsSync(): { tickerEvents: TickerEvent[] } {
    const cache = getCache();
    if (!cache) {
        return { tickerEvents: [] };
    }
    return { tickerEvents: cache.tickerEvents as TickerEvent[] };
}
