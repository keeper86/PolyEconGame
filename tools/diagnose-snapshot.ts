/**
 * Diagnostic script: test snapshot round-trip for bank data.
 *
 * Usage:  npx tsx tools/diagnose-snapshot.ts
 */

import { seedRng, advanceTick } from '../src/simulation/engine';
import { earth, earthGovernment, testCompany } from '../src/simulation/entities';
import {
    agriculturalProductResourceType,
    putIntoStorageFacility,
    waterResourceType,
} from '../src/simulation/facilities';
import type { GameState } from '../src/simulation/planet';
import { toImmutableGameState, fromImmutableGameState } from '../src/simulation/immutableTypes';
import { serializeGameState } from '../src/simulation/snapshotCompression';
import { encode, decode } from '@msgpack/msgpack';
import { gzipSync, gunzipSync } from 'node:zlib';

// --- bootstrap state ---
seedRng(42);

const earthGovStorage = earthGovernment.assets[earth.id]?.storageFacility;
if (!earthGovStorage) throw new Error('No storage');
putIntoStorageFacility(earthGovStorage, agriculturalProductResourceType, 10_000_000_000);
putIntoStorageFacility(earthGovStorage, waterResourceType, 100_000);

const state: GameState = {
    tick: 0,
    planets: new Map([[earth.id, earth]]),
    agents: new Map([
        [earthGovernment.id, earthGovernment],
        [testCompany.id, testCompany],
    ]),
};

// Run a few ticks so we have some bank data
for (let i = 1; i <= 3; i++) {
    state.tick = i;
    advanceTick(state);
}

console.log('=== Bank state before serialization ===');
console.log(JSON.stringify(earth.bank, null, 2));

// Test 1: immutable round-trip
console.log('\n=== Test 1: Immutable round-trip ===');
const immutable = toImmutableGameState(state);
const restored1 = fromImmutableGameState(immutable);
const planet1 = restored1.planets.get('earth');
console.log('bank after immutable round-trip:', JSON.stringify(planet1?.bank, null, 2));

// Test 2: MessagePack round-trip (the wire format)
console.log('\n=== Test 2: MessagePack round-trip ===');
const wire = {
    tick: state.tick,
    planets: [...state.planets.values()],
    agents: [...state.agents.values()],
};
const packed = encode(wire);
const unpacked = decode(packed) as typeof wire;
console.log('bank after msgpack round-trip:', JSON.stringify(unpacked.planets[0]?.bank, null, 2));

// Check if any keys are missing
if (unpacked.planets[0]?.bank) {
    const orig = earth.bank;
    const rt = unpacked.planets[0].bank as unknown as Record<string, unknown>;
    for (const key of Object.keys(orig)) {
        if (!(key in rt)) {
            console.error(`  *** Missing key after msgpack: ${key} ***`);
        } else if (rt[key] !== (orig as unknown as Record<string, unknown>)[key]) {
            console.warn(`  Key ${key}: ${(orig as unknown as Record<string, unknown>)[key]} -> ${rt[key]}`);
        }
    }
}

// Test 3: Full serialize/deserialize round-trip
console.log('\n=== Test 3: Full serialize/deserialize (gzip+msgpack) ===');
import { deserializeSnapshot } from '../src/simulation/snapshotCompression';

const record = toImmutableGameState(state);
const buf = serializeGameState(state);
console.log(`Serialized size: ${buf.length} bytes`);

const restored3 = deserializeSnapshot(buf);
const gs3 = fromImmutableGameState(restored3);
const planet3 = gs3.planets.get('earth');
console.log('bank after full round-trip:', JSON.stringify(planet3?.bank, null, 2));

// Check agent deposits
for (const agent of gs3.agents.values()) {
    console.log(`  agent ${agent.id}: deposits=${agent.deposits}, assets.deposits=${agent.assets?.earth?.deposits}`);
}

// Test 4: structuredClone (simulates postMessage)
console.log('\n=== Test 4: structuredClone (simulates postMessage) ===');
const cloned = structuredClone(earth);
console.log('bank after structuredClone:', JSON.stringify(cloned.bank, null, 2));
