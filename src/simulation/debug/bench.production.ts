/**
 * benchmarks/simulation/bench.production.ts
 *
 * Micro-benchmarks for the production and environment subsystems:
 *   - productionTick
 *   - environmentTick
 *   - updateAllocatedWorkers (as a pre-production pass)
 *
 * Production is the heart of each tick for firm agents.  We test it with
 * a realistic set of facilities to expose per-facility overhead.
 */

import { environmentTick } from '../planet/environment';
import { agriculturalProductResourceType, waterResourceType, arableLandResourceType } from '../planet/facilities';
import { productionTick } from '../planet/production';
import { makeWorld, makeProductionFacility } from '../utils/testHelper';
import { BenchmarkSuite } from './bench.harness';

/** Seed each agent's storage with enough water + arable land for production. */
function seedResources(gs: ReturnType<typeof makeWorld>['gameState']): void {
    for (const planet of gs.planets.values()) {
        for (const agent of gs.agents.values()) {
            const assets = agent.assets[planet.id];
            if (!assets) {
                continue;
            }
            // Ensure storage has input resources so production can proceed
            assets.storageFacility.currentInStorage = {
                [agriculturalProductResourceType.name]: { resource: agriculturalProductResourceType, quantity: 0 },
                [waterResourceType.name]: { resource: waterResourceType, quantity: 1e9 },
                [arableLandResourceType.name]: { resource: arableLandResourceType, quantity: 1e9 },
            };
            assets.storageFacility.current = { mass: 2e9, volume: 2e9 };
        }
        // Put resource claims on the planet so production can extract them
        planet.resources[arableLandResourceType.name] ??= [];
        planet.resources[waterResourceType.name] ??= [];
    }
}

/**
 * Give each company agent a realistic farm facility (requires none+primary
 * workers and water) and seed active workers into their workforce.
 */
function seedFacilities(gs: ReturnType<typeof makeWorld>['gameState'], scale = 1000): void {
    for (const planet of gs.planets.values()) {
        for (const agent of gs.agents.values()) {
            const assets = agent.assets[planet.id];
            if (!assets) {
                continue;
            }
            // Skip the government (no production facilities)
            const facility = makeProductionFacility(
                { none: 60, primary: 20 },
                {
                    id: `farm-${agent.id}`,
                    planetId: planet.id,
                    scale,
                    needs: [{ resource: waterResourceType, quantity: scale }],
                    produces: [{ resource: agriculturalProductResourceType, quantity: scale * 2 }],
                },
            );
            assets.productionFacilities = [facility];

            // Seed active workers into the workforce demography at age 30
            const wf = assets.workforceDemography;
            if (wf) {
                wf[30].none.novice.active = 60 * scale;
                wf[30].primary.novice.active = 20 * scale;
            }
        }
    }
}

function makeSmallWorld(nCompanies = 1) {
    const w = makeWorld({
        populationByEdu: { none: 60_000, primary: 30_000, secondary: 8_000, tertiary: 2_000 },
        companyIds: Array.from({ length: nCompanies }, (_, i) => `co-${i}`),
    });
    seedResources(w.gameState);
    return w.gameState;
}

function makeMediumWorld(nCompanies = 4) {
    const w = makeWorld({
        populationByEdu: { none: 500_000, primary: 300_000, secondary: 150_000, tertiary: 50_000 },
        companyIds: Array.from({ length: nCompanies }, (_, i) => `co-${i}`),
    });
    seedResources(w.gameState);
    return w.gameState;
}

export function productionSuite(): BenchmarkSuite {
    const suite = new BenchmarkSuite('Production & environment subsystems');

    // -----------------------------------------------------------------------
    // environmentTick
    // -----------------------------------------------------------------------

    suite.add(
        'environmentTick – 1 planet',
        () => makeSmallWorld(1),
        (gs) => {
            environmentTick(Object.values(gs.planets)[0]);
        },
        { iterations: 1000, warmup: 100 },
    );

    // -----------------------------------------------------------------------
    // productionTick
    // -----------------------------------------------------------------------

    suite.add(
        'productionTick – small (2 agents, 1 facility each)',
        () => {
            const gs = makeSmallWorld(1);
            seedFacilities(gs, 100);
            return gs;
        },
        (gs) => {
            productionTick(gs.agents, Object.values(gs.planets)[0]);
        },
        { iterations: 500, warmup: 50 },
    );

    suite.add(
        'productionTick – medium (5 agents, 1 facility each)',
        () => {
            const gs = makeMediumWorld(4);
            seedFacilities(gs, 500);
            return gs;
        },
        (gs) => {
            productionTick(gs.agents, Object.values(gs.planets)[0]);
        },
        { iterations: 200, warmup: 20 },
    );

    suite.add(
        'productionTick – large (21 agents, 1 facility each)',
        () => {
            const w = makeWorld({
                populationByEdu: {
                    none: 4_800_000,
                    primary: 2_400_000,
                    secondary: 600_000,
                    tertiary: 200_000,
                },
                companyIds: Array.from({ length: 20 }, (_, i) => `co-${i}`),
            });
            seedResources(w.gameState);
            seedFacilities(w.gameState, 1000);
            return w.gameState;
        },
        (gs) => {
            productionTick(gs.agents, Object.values(gs.planets)[0]);
        },
        { iterations: 50, warmup: 5 },
    );

    return suite;
}
