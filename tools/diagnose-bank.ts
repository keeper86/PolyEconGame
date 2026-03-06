/**
 * Diagnostic script: run a few simulation ticks and inspect bank state.
 *
 * Usage:  npx tsx tools/diagnose-bank.ts
 */

import { seedRng, advanceTick } from '../src/simulation/engine';
import { earth, earthGovernment, testCompany } from '../src/simulation/entities';
import {
    agriculturalProductResourceType,
    putIntoStorageFacility,
    waterResourceType,
} from '../src/simulation/facilities';
import type { GameState } from '../src/simulation/planet';

// --- bootstrap state identical to worker.ts ---
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

function printBank(label: string) {
    const bank = earth.bank;
    console.log(`\n=== ${label} ===`);
    console.log('bank object:', bank);
    console.log('JSON:', JSON.stringify(bank));

    // Check for NaN
    if (bank) {
        for (const [key, val] of Object.entries(bank)) {
            if (typeof val === 'number' && isNaN(val)) {
                console.error(`  *** NaN detected in bank.${key} ***`);
            }
        }
    }

    // Also check agent deposits
    for (const agent of state.agents.values()) {
        console.log(`  agent ${agent.id}: assets.deposits=${agent.assets[earth.id]?.deposits}`);
    }
}

printBank('Before any ticks');

const TICKS = 400; // > 1 year of ticks to cover year boundary
for (let i = 1; i <= TICKS; i++) {
    state.tick = i;
    try {
        advanceTick(state);
        // Only print on interesting boundaries or if NaN detected
        const bank = earth.bank;
        const hasNaN = bank && Object.values(bank).some((v) => typeof v === 'number' && isNaN(v));
        if (hasNaN || i <= 2 || i === 30 || i === 60 || i === 360 || i === TICKS) {
            printBank(`After tick ${i}`);
        }
        if (hasNaN) {
            console.error('*** NaN detected, stopping ***');
            break;
        }
    } catch (err: unknown) {
        console.error(`\nError during tick ${i}:`, (err as Error).message);
        printBank(`After error at tick ${i}`);
        break;
    }
}
