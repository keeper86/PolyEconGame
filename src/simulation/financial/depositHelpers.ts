import type { Agent } from '../planet';

/**
 * Strict helpers for reading/writing agent deposits per-planet.
 *
 * Early development uses an explicit per-planet assets structure. These helpers
 * assume the caller has initialised `agent.assets[planetId]` and that the
 * numeric fields are present. They throw on missing data to surface errors
 * early — no legacy fallbacks are provided.
 */
export function getAgentDepositsForPlanet(agent: Agent, planetId: string): number {
    const assets = agent.assets?.[planetId];
    if (!assets) {
        throw new Error(`Missing assets entry for agent ${agent.id} on planet ${planetId}`);
    }
    if (typeof assets.deposits !== 'number') {
        throw new Error(`Missing deposits field for agent ${agent.id} on planet ${planetId}`);
    }
    return assets.deposits;
}

export function setAgentDepositsForPlanet(agent: Agent, planetId: string, value: number): void {
    const assets = agent.assets?.[planetId];
    if (!assets) {
        throw new Error(`Missing assets entry for agent ${agent.id} on planet ${planetId}`);
    }
    assets.deposits = value;
}

export function addAgentDepositsForPlanet(agent: Agent, planetId: string, delta: number): void {
    const cur = getAgentDepositsForPlanet(agent, planetId);
    setAgentDepositsForPlanet(agent, planetId, cur + delta);
}

// ---------------------------------------------------------------------------
// Per-agent loan helpers (per-planet)
// ---------------------------------------------------------------------------

export function getAgentLoansForPlanet(agent: Agent, planetId: string): number {
    const assets = agent.assets?.[planetId];
    if (assets && typeof assets.loans === 'number') {
        return assets.loans;
    }
    return 0;
}

export function setAgentLoansForPlanet(agent: Agent, planetId: string, value: number): void {
    const assets = agent.assets?.[planetId];
    if (assets) {
        assets.loans = value;
    }
}

export function addAgentLoansForPlanet(agent: Agent, planetId: string, delta: number): void {
    const cur = getAgentLoansForPlanet(agent, planetId);
    setAgentLoansForPlanet(agent, planetId, cur + delta);
}
