/**
 * simulation/utils/testAssertions.ts
 *
 * Test assertion helpers that depend on vitest's `expect`.
 *
 * Separated from testHelper.ts so that testHelper (pure data factories)
 * can be imported by runtime code (e.g. entities.ts → worker.ts) without
 * pulling vitest into the worker bundle.
 */

import { expect } from 'vitest';
import { educationLevelKeys } from '../population/education';
import type { Agent, Planet } from '../planet/planet';
import { OCCUPATIONS, SKILL } from '../population/population';
import { totalPopulation, sumPopOcc, sumWorkforceForEdu } from './testHelper';

// ============================================================================
// Invariant / assertion helpers
// ============================================================================

/**
 * Assert workforce counts match population counts for each education level.
 * "company" occupation workforce should match all non-government agent workforces;
 * "employed" occupation population should match total workforce across all agents.
 */
export function assertWorkforcePopulationConsistency(planet: Planet, agents: Agent[], label = ''): void {
    for (const edu of educationLevelKeys) {
        const popEmployed = sumPopOcc(planet, edu, 'employed');
        let wfTotal = 0;
        for (const agent of agents) {
            wfTotal += sumWorkforceForEdu(agent, planet.id, edu);
        }
        expect(
            wfTotal,
            `${label} workforce ↔ population mismatch for edu=${edu}: wf=${wfTotal}, pop(employed)=${popEmployed}`,
        ).toBe(popEmployed);
    }
}

/**
 * Assert that total population count has not changed (conservation).
 */
export function assertTotalPopulationConserved(planet: Planet, expectedTotal: number, label = ''): void {
    const actual = totalPopulation(planet);
    expect(actual, `${label} total population changed: expected=${expectedTotal}, got=${actual}`).toBe(expectedTotal);
}

/**
 * Assert all population slots and workforce slots are non-negative.
 */
export function assertAllNonNegative(planet: Planet, agents: Agent[]): void {
    for (let age = 0; age < planet.population.demography.length; age++) {
        const cohort = planet.population.demography[age];
        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    expect(
                        cohort[occ][edu][skill].total,
                        `negative population at age=${age}, occ=${occ}, edu=${edu}, skill=${skill}: ${cohort[occ][edu][skill].total}`,
                    ).toBeGreaterThanOrEqual(0);
                }
            }
        }
    }

    for (const agent of agents) {
        const wf = agent.assets[planet.id]?.workforceDemography;
        if (!wf) {
            continue;
        }
        for (let age = 0; age < wf.length; age++) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    const cell = wf[age][edu][skill];
                    expect(
                        cell.active,
                        `negative active at age=${age}, edu=${edu}, skill=${skill} for agent ${agent.id}`,
                    ).toBeGreaterThanOrEqual(0);
                    for (let m = 0; m < cell.departing.length; m++) {
                        expect(
                            cell.departing[m],
                            `negative departing at age=${age}, edu=${edu}, skill=${skill}, m=${m} for agent ${agent.id}`,
                        ).toBeGreaterThanOrEqual(0);
                        expect(
                            cell.departingFired[m],
                            `negative departingFired at age=${age}, edu=${edu}, skill=${skill}, m=${m} for agent ${agent.id}`,
                        ).toBeGreaterThanOrEqual(0);
                    }
                }
            }
        }
    }
}
