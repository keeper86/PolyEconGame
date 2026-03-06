/**
 * simulation/debug/runInvariants.ts
 *
 * Runs invariant checks against a small deterministic simulation scenario.
 * Useful for CI or local debugging to verify simulation consistency.
 *
 * Run with: npx tsx src/simulation/debug/runInvariants.ts
 * Or with SIM_DEBUG=1: SIM_DEBUG=1 npx tsx src/simulation/debug/runInvariants.ts
 */

import { advanceTick, runInvariantChecks, seedRng } from '../engine';
import { createPopulation } from '../entities';
import { createWorkforceDemography } from '../workforce/workforceHelpers';
import type { GameState, Agent, Planet } from '../planet';

seedRng(42);

function makeStorageFacility() {
    return {
        planetId: 'p',
        id: 's',
        name: 's',
        scale: 1,
        powerConsumptionPerTick: 0,
        workerRequirement: {},
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        capacity: { volume: 1e9, mass: 1e9 },
        current: { volume: 0, mass: 0 },
        currentInStorage: {},
    };
}

function makeAgent(id: string): Agent {
    return {
        id,
        name: id,
        associatedPlanetId: 'p',
        wealth: 0,
        transportShips: [],
        assets: {
            p: {
                resourceClaims: [],
                resourceTenancies: [],
                productionFacilities: [],
                deposits: 0,
                storageFacility: makeStorageFacility(),
                allocatedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 },
                workforceDemography: createWorkforceDemography(),
            },
        },
    };
}

const TICKS = 30; // simulate one month

const population = createPopulation(1000);
const gov = makeAgent('gov-1');
const company = makeAgent('company-1');

const planet: Planet = {
    id: 'p',
    name: 'Test Planet',
    position: { x: 0, y: 0, z: 0 },
    population,
    resources: {},
    governmentId: gov.id,
    bank: { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate: 0, depositRate: 0 },
    infrastructure: {
        primarySchools: 0,
        secondarySchools: 0,
        universities: 0,
        hospitals: 0,
        mobility: { roads: 0, railways: 0, airports: 0, seaports: 0, spaceports: 0 },
        energy: { production: 0 },
    },
    environment: {
        naturalDisasters: { earthquakes: 0, floods: 0, storms: 0 },
        pollution: { air: 0, water: 0, soil: 0 },
        regenerationRates: {
            air: { constant: 0, percentage: 0 },
            water: { constant: 0, percentage: 0 },
            soil: { constant: 0, percentage: 0 },
        },
    },
};

const gameState: GameState = {
    tick: 0,
    planets: new Map([[planet.id, planet]]),
    agents: new Map([
        [gov.id, gov],
        [company.id, company],
    ]),
};

console.log(`Running ${TICKS} ticks with invariant checks...`);
let failures = 0;

for (let t = 1; t <= TICKS; t++) {
    gameState.tick = t;
    advanceTick(gameState);

    const issues = runInvariantChecks(gameState);
    if (issues.length > 0) {
        console.error(`Tick ${t}: ${issues.length} invariant failure(s):`);
        for (const issue of issues) {
            console.error(`  - ${issue}`);
        }
        failures += issues.length;
    }
}

if (failures === 0) {
    console.log(`✓ All ${TICKS} ticks passed invariant checks.`);
    process.exit(0);
} else {
    console.error(`✗ ${failures} total invariant failure(s) across ${TICKS} ticks.`);
    process.exit(1);
}
