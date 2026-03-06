/**
 * Diagnostic: simulate loading a pre-bank snapshot (missing bank field).
 *
 * Usage:  npx tsx tools/diagnose-legacy-snapshot.ts
 */

import { encode, decode } from '@msgpack/msgpack';
import { gzipSync, gunzipSync } from 'node:zlib';

// Simulate a planet saved before the bank feature was added
const legacyPlanet = {
    id: 'earth',
    name: 'Earth',
    position: { x: 0, y: 0, z: 0 },
    population: { demography: [], starvationLevel: 0 },
    resources: {},
    governmentId: 'gov',
    infrastructure: {},
    environment: {},
    // NOTE: no `bank`, `wagePerEdu`, or `priceLevel` fields
};

const wire = {
    tick: 100,
    planets: [legacyPlanet],
    agents: [{
        id: 'gov',
        name: 'Gov',
        associatedPlanetId: 'earth',
        wealth: 0,
        transportShips: [],
        assets: {},
        // NOTE: no `deposits` field
    }],
};

// Serialize and deserialize via msgpack (same as snapshot)
const packed = encode(wire);
const buf = gzipSync(Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength));
const decompressed = gunzipSync(buf);
const restored = decode(decompressed) as typeof wire;

const restoredPlanet = restored.planets[0] as Record<string, unknown>;
console.log('=== Restored planet ===');
console.log('bank:', restoredPlanet.bank);
console.log('typeof bank:', typeof restoredPlanet.bank);

console.log('\n=== Restored agent ===');
const restoredAgent = restored.agents[0] as Record<string, unknown>;
console.log('deposits:', restoredAgent.deposits);
console.log('typeof deposits:', typeof restoredAgent.deposits);

// Now simulate what happens if we do arithmetic on undefined/missing bank
const bank = restoredPlanet.bank as { loans: number } | undefined;
console.log('\n=== Arithmetic on missing bank ===');
console.log('bank?.loans:', bank?.loans);
console.log('bank?.loans + 10:', (bank?.loans ?? 0) + 10);
console.log('undefined + 10:', undefined as unknown as number + 10);  // NaN!

// Now simulate the actual ensureBank path
const planet = restoredPlanet;
if (!planet.bank) {
    planet.bank = {
        loans: 0,
        deposits: 0,
        householdDeposits: 0,
        equity: 0,
        loanRate: 0,
        depositRate: 0,
    };
    console.log('\n=== ensureBank created fresh bank ===');
    console.log('bank:', planet.bank);
} else {
    console.log('\n=== bank already exists ===');
    console.log('bank:', planet.bank);
}

// Check: what about a bank that was serialized but had NaN values?
const nanBank = { loans: NaN, deposits: NaN, householdDeposits: NaN, equity: NaN, loanRate: 0, depositRate: 0 };
const nanWire = { tick: 1, planets: [{ ...legacyPlanet, bank: nanBank }], agents: [] };
const nanPacked = encode(nanWire);
const nanBuf = gzipSync(Buffer.from(nanPacked.buffer, nanPacked.byteOffset, nanPacked.byteLength));
const nanDecompressed = gunzipSync(nanBuf);
const nanRestored = decode(nanDecompressed) as typeof nanWire;
console.log('\n=== NaN bank after msgpack round-trip ===');
console.log('bank:', nanRestored.planets[0].bank);
console.log('JSON:', JSON.stringify(nanRestored.planets[0].bank));
