/**
 * simulation/snapshotCompression.ts
 *
 * Serialization & compression helpers for cold snapshots.
 *
 * Pipeline:
 *   GameStateRecord → GameState → MessagePack → gzip → Buffer
 *
 * Uses Node.js built-in `zlib` for gzip compression — zero external
 * dependencies.  Typical compression ratio on MessagePack game-state
 * blobs is ~3–5× (e.g. 490 KB msgpack → ~100–160 KB gzipped).
 *
 * Note: MessagePack cannot natively serialize JS `Map` objects, so we
 * convert Maps to arrays on the wire and rebuild them on deserialize.
 */

import { gzipSync, gunzipSync } from 'node:zlib';
import { encode, decode } from '@msgpack/msgpack';

import { toImmutableGameState, fromImmutableGameState } from './immutableTypes';
import type { GameStateRecord } from './immutableTypes';
import type { GameState } from './engine';
import type { Planet, Agent } from './planet';

// ---------------------------------------------------------------------------
// Wire format (MessagePack-safe — uses arrays instead of Maps)
// ---------------------------------------------------------------------------

/** MessagePack-safe representation used only on the wire.
 *  Maps are converted to arrays for serialization. */
interface WireGameState {
    tick: number;
    planets: Planet[];
    agents: Agent[];
}

function gameStateToWire(gs: GameState): WireGameState {
    return {
        tick: gs.tick,
        planets: [...gs.planets.values()],
        agents: [...gs.agents.values()],
    };
}

function wireToGameState(wire: WireGameState): GameState {
    const planets = new Map<string, Planet>();
    for (const p of wire.planets) {
        planets.set(p.id, p);
    }
    const agents = new Map<string, Agent>();
    for (const a of wire.agents) {
        agents.set(a.id, a);
    }
    return { tick: wire.tick, planets, agents };
}

// ---------------------------------------------------------------------------
// Serialize / Deserialize
// ---------------------------------------------------------------------------

/**
 * Serialize a GameStateRecord to a compressed Buffer.
 *
 *   GameStateRecord → GameState → wire format → MessagePack → gzip → Buffer
 */
export function serializeSnapshot(record: GameStateRecord): Buffer {
    const gs = fromImmutableGameState(record);
    const wire = gameStateToWire(gs);
    const packed = encode(wire);
    return gzipSync(Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength));
}

/**
 * Serialize a GameState (already converted from a GameStateRecord) to a
 * compressed Buffer.  Useful when the caller has already extracted the
 * plain GameState from the immutable snapshot (e.g. off the tick loop).
 */
export function serializeGameState(gs: GameState): Buffer {
    const wire = gameStateToWire(gs);
    const packed = encode(wire);
    return gzipSync(Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength));
}

/**
 * Deserialize a compressed Buffer back to a GameStateRecord.
 *
 *   Buffer → gunzip → MessagePack → wire format → GameState → GameStateRecord
 */
export function deserializeSnapshot(data: Buffer): GameStateRecord {
    const decompressed = gunzipSync(data);
    const wire = decode(decompressed) as WireGameState;
    return toImmutableGameState(wireToGameState(wire));
}
