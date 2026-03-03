/**
 * simulation/immutableTypes.ts
 *
 * Immutable.js Record wrappers for the core domain types.
 *
 * Goal: Enable cheap, consistent snapshots inside the worker without blocking
 * the tick loop.  Converting GameState, Planet and Agent into Immutable Records
 * backed by `Map` collections means a snapshot can be captured in O(1) via
 * structural sharing.  The simulation engine continues to work with the
 * existing mutable plain-object types; only the snapshot path uses these
 * Records.
 *
 * Usage (worker):
 *   const snapshot = toImmutableGameState(state);   // cheap snapshot
 *   // ... tick loop continues mutating `state` ...
 *   await saveSnapshot(snapshot);                   // serialise off-loop
 */

import { Record, Map } from 'immutable';

import type { Agent, Planet } from './planet';
import type { GameState } from './engine';

// ---------------------------------------------------------------------------
// PlanetRecord
// ---------------------------------------------------------------------------

/** Immutable Record wrapping a Planet's scalar identity fields plus the full
 *  mutable planet value as `data`.  Using a thin Record here preserves
 *  structural sharing across ticks when only a subset of planets changes. */
interface PlanetRecordShape {
    id: string;
    name: string;
    /** Full planet value captured at snapshot time.  Treated as opaque from
     *  the immutable-types perspective; callers must not mutate it after
     *  passing it to `toImmutableGameState`. */
    data: Planet;
}

const PLANET_RECORD_DEFAULTS: PlanetRecordShape = {
    id: '',
    name: '',
    data: null as unknown as Planet,
};

export class PlanetRecord extends Record(PLANET_RECORD_DEFAULTS) {}

// ---------------------------------------------------------------------------
// AgentRecord
// ---------------------------------------------------------------------------

/** Immutable Record wrapping an Agent's scalar identity fields plus the full
 *  mutable agent value as `data`. */
interface AgentRecordShape {
    id: string;
    name: string;
    /** Full agent value captured at snapshot time. */
    data: Agent;
}

const AGENT_RECORD_DEFAULTS: AgentRecordShape = {
    id: '',
    name: '',
    data: null as unknown as Agent,
};

export class AgentRecord extends Record(AGENT_RECORD_DEFAULTS) {}

// ---------------------------------------------------------------------------
// GameStateRecord
// ---------------------------------------------------------------------------

/** Immutable Record for a complete simulation snapshot.
 *
 *  - `planets` is a `Map<planetId, PlanetRecord>` for O(1) lookup by ID.
 *  - `agents`  is a `Map<agentId,  AgentRecord>`  for O(1) lookup by ID.
 *
 *  Structural sharing ensures that a new `GameStateRecord` created from an
 *  existing one by updating a single planet only copies the path from the
 *  root to that node – all unmodified records are reused. */
interface GameStateRecordShape {
    tick: number;
    planets: Map<string, PlanetRecord>;
    agents: Map<string, AgentRecord>;
}

const GAME_STATE_RECORD_DEFAULTS: GameStateRecordShape = {
    tick: 0,
    planets: Map<string, PlanetRecord>(),
    agents: Map<string, AgentRecord>(),
};

export class GameStateRecord extends Record(GAME_STATE_RECORD_DEFAULTS) {}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert a mutable `GameState` to an immutable `GameStateRecord`.
 *
 * The planet and agent `data` values are stored by reference; after calling
 * this function the caller **must not** mutate those objects if it needs the
 * snapshot to remain consistent.  In the worker, the pattern is:
 *
 *   advanceTick(state);           // mutates state
 *   const snap = toImmutableGameState(state);
 *   // safe to store/send `snap` asynchronously while the loop continues
 */
export function toImmutableGameState(state: GameState): GameStateRecord {
    const planets = Map(
        [...state.planets.entries()].map(([id, p]) => [id, new PlanetRecord({ id: p.id, name: p.name, data: p })]),
    );

    const agents = Map(
        [...state.agents.entries()].map(([id, a]) => [id, new AgentRecord({ id: a.id, name: a.name, data: a })]),
    );

    return new GameStateRecord({ tick: state.tick, planets, agents });
}

/**
 * Reconstruct a plain mutable `GameState` from a `GameStateRecord`.
 *
 * This is primarily useful in tests and for passing the state back to code
 * that still operates on the plain-object types.
 */
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
    };
}
