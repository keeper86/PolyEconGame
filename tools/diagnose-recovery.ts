/**
 * Diagnostic: test snapshot recovery that loads from PostgreSQL.
 *
 * This mimics the worker boot path when it finds a cold snapshot in the DB.
 * We manually serialize → deserialize a state with non-zero bank values
 * and check whether the bank survives.
 *
 * Usage:  npx tsx tools/diagnose-recovery.ts
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
import { serializeGameState, deserializeSnapshot } from '../src/simulation/snapshotCompression';

// --- bootstrap ---
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

// Run 10 ticks so bank has non-zero values
for (let i = 1; i <= 10; i++) {
    state.tick = i;
    advanceTick(state);
}

console.log('=== State at tick 10 ===');
console.log('bank:', JSON.stringify(earth.bank));


// Simulate cold snapshot save + recovery
console.log('\n=== Simulating cold snapshot save/restore ===');
const buf = serializeGameState(state);
console.log(`Snapshot size: ${buf.length} bytes`);

const record = deserializeSnapshot(buf);
const recovered = fromImmutableGameState(record);

const recoveredPlanet = recovered.planets.get('earth');
console.log('Recovered bank:', JSON.stringify(recoveredPlanet?.bank));
console.log('Recovered bank (raw):', recoveredPlanet?.bank);

// Check for NaN
if (recoveredPlanet?.bank) {
    for (const [key, val] of Object.entries(recoveredPlanet.bank)) {
        if (typeof val === 'number' && isNaN(val)) {
            console.error(`  *** NaN in recovered bank.${key} ***`);
        }
        if (val === null || val === undefined) {
            console.error(`  *** ${val} in recovered bank.${key} ***`);
        }
    }
}

// Now continue ticking from the recovered state
console.log('\n=== Continuing from recovered state ===');
for (let i = recovered.tick + 1; i <= recovered.tick + 5; i++) {
    recovered.tick = i;
    try {
        advanceTick(recovered);
        const bank = recoveredPlanet?.bank;
        const hasNaN = bank && Object.values(bank).some((v) => typeof v === 'number' && isNaN(v));
        if (hasNaN) {
            console.error(`*** NaN detected at tick ${i} ***`);
            console.log('bank:', JSON.stringify(bank));
            break;
        }
        console.log(`  tick ${i}: bank.loans=${bank?.loans}, bank.deposits=${bank?.deposits}`);
    } catch (err: unknown) {
        console.error(`Error at tick ${i}:`, (err as Error).message);
        console.log('bank:', JSON.stringify(recoveredPlanet?.bank));
        break;
    }
}
