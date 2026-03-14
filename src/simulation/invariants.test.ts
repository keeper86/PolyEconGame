/**
 * simulation/invariants.test.ts
 *
 * Tests for the monetary conservation invariant:
 *   householdDeposits + Σ(agent.deposits) − bank.loans === 0
 */

import { describe, it, expect } from 'vitest';
import { checkMonetaryConservation, checkWealthBankConsistency } from './invariants';
import { advanceTick, seedRng } from './engine';
import { agriculturalProductResourceType, putIntoStorageFacility } from './planet/facilities';
import { makeProductionFacility, makeWorld } from './utils/testHelper';

describe('checkMonetaryConservation', () => {
    it('reports no violation when all balances are zero', () => {
        const { gameState } = makeWorld({
            populationByEdu: { none: 100, primary: 0, secondary: 0, tertiary: 0 },
            companyIds: [],
        });

        const discrepancies = checkMonetaryConservation(gameState.agents, gameState.planets);
        expect(discrepancies).toEqual([]);
    });

    it('holds after a single tick with wages and no food market', () => {
        seedRng(42);

        const { gameState, planet, agents } = makeWorld({
            populationByEdu: { none: 500, primary: 300, secondary: 100, tertiary: 50 },
            companyIds: ['company-1'],
        });

        const gov = agents[0];
        gov.assets[planet.id].productionFacilities.push(
            makeProductionFacility({ none: 100, primary: 50, secondary: 20, tertiary: 5 }, { planetId: planet.id }),
        );

        // Seed food to prevent starvation
        putIntoStorageFacility(gov.assets[planet.id].storageFacility, agriculturalProductResourceType, 1e9);

        gameState.tick = 1;
        advanceTick(gameState);

        const discrepancies = checkMonetaryConservation(
            gameState.agents,
            gameState.planets,
            0.02, // 2% tolerance for floating-point
        );
        expect(discrepancies).toEqual([]);
    });

    it('holds over 30 ticks (1 month) with full economic activity', () => {
        seedRng(42);

        const { gameState, planet, agents } = makeWorld({
            populationByEdu: { none: 2000, primary: 1000, secondary: 500, tertiary: 200 },
            companyIds: ['company-1'],
        });

        const gov = agents[0];
        gov.assets[planet.id].productionFacilities.push(
            makeProductionFacility({ none: 500, primary: 200, secondary: 50, tertiary: 20 }, { planetId: planet.id }),
        );

        // Seed food
        putIntoStorageFacility(gov.assets[planet.id].storageFacility, agriculturalProductResourceType, 1e9);

        for (let t = 1; t <= 30; t++) {
            gameState.tick = t;
            advanceTick(gameState);
        }

        const discrepancies = checkMonetaryConservation(gameState.agents, gameState.planets, 0.02);
        expect(discrepancies).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Wealth ↔ householdDeposits consistency
// ---------------------------------------------------------------------------

describe('checkWealthBankConsistency', () => {
    it('holds at zero state', () => {
        const { gameState } = makeWorld({
            populationByEdu: { none: 100, primary: 0, secondary: 0, tertiary: 0 },
            companyIds: [],
        });

        const discrepancies = checkWealthBankConsistency(gameState.planets);
        expect(discrepancies).toEqual([]);
    });

    it('holds after ticks with a single agent', () => {
        seedRng(42);

        const { gameState, planet, agents } = makeWorld({
            populationByEdu: { none: 500, primary: 300, secondary: 100, tertiary: 50 },
            companyIds: ['company-1'],
        });

        const gov = agents[0];
        gov.assets[planet.id].productionFacilities.push(
            makeProductionFacility({ none: 100, primary: 50, secondary: 20, tertiary: 5 }, { planetId: planet.id }),
        );

        putIntoStorageFacility(gov.assets[planet.id].storageFacility, agriculturalProductResourceType, 1e9);

        for (let t = 1; t <= 30; t++) {
            gameState.tick = t;
            advanceTick(gameState);
        }

        const discrepancies = checkWealthBankConsistency(gameState.planets, 10);
        expect(discrepancies).toEqual([]);
    });

    it('holds with MULTIPLE agents on the same planet (regression: multi-agent wage over-credit)', () => {
        seedRng(42);

        const { gameState, planet, agents } = makeWorld({
            populationByEdu: { none: 2000, primary: 1000, secondary: 500, tertiary: 200 },
            companyIds: ['company-1', 'company-2', 'company-3'],
        });

        // Give each company production facilities so they all hire workers
        for (const agent of agents) {
            const assets = agent.assets[planet.id];
            if (!assets) {
                continue;
            }
            assets.productionFacilities.push(
                makeProductionFacility({ none: 100, primary: 50, secondary: 20, tertiary: 5 }, { planetId: planet.id }),
            );
            putIntoStorageFacility(assets.storageFacility, agriculturalProductResourceType, 1e9);
        }

        for (let t = 1; t <= 60; t++) {
            gameState.tick = t;
            advanceTick(gameState);
        }

        // With the old bug, each agent would credit ALL employed workers
        // with wages, causing wealth to grow N× faster than householdDeposits.
        // tolerance = 50 to allow small floating-point drift.
        const discrepancies = checkWealthBankConsistency(gameState.planets, 50);
        expect(discrepancies).toEqual([]);
    });

    it('holds after food market activity (regression: uncapped wealth reduction)', () => {
        seedRng(42);

        const { gameState, planet, agents } = makeWorld({
            populationByEdu: { none: 1000, primary: 500, secondary: 200, tertiary: 100 },
            companyIds: ['company-1'],
        });

        const gov = agents[0];
        gov.assets[planet.id].productionFacilities.push(
            makeProductionFacility({ none: 200, primary: 100, secondary: 50, tertiary: 10 }, { planetId: planet.id }),
        );

        // Seed moderate food — enough for food market activity but not unlimited
        putIntoStorageFacility(gov.assets[planet.id].storageFacility, agriculturalProductResourceType, 1e6);

        for (let t = 1; t <= 90; t++) {
            gameState.tick = t;
            advanceTick(gameState);
        }

        // Both monetary conservation and wealth-bank consistency must hold
        const monetaryDisc = checkMonetaryConservation(gameState.agents, gameState.planets, 0.02);
        expect(monetaryDisc).toEqual([]);
        const wealthDisc = checkWealthBankConsistency(gameState.planets, 100);
        expect(wealthDisc).toEqual([]);
    });
});
