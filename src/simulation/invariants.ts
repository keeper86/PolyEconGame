/**
 * simulation/invariants.ts
 *
 * Invariant checks for the simulation engine.
 * Each function returns an array of discrepancy messages (empty = healthy).
 */

import type { Agent, Planet } from './planet/planet';
import { educationLevelKeys } from './population/education';
import { SKILL, forEachPopulationCohort } from './population/population';

// ---------------------------------------------------------------------------
// Population ↔ Workforce consistency
// ---------------------------------------------------------------------------

/**
 * Verify that the total number of 'employed' people in each planet's
 * population demography matches the sum of workforce (active + departing)
 * across all agents on that planet, for every education level.
 */
export function checkPopulationWorkforceConsistency(
    agents: Map<string, Agent>,
    planets: Map<string, Planet>,
): string[] {
    const discrepancies: string[] = [];

    for (const [planetId, planet] of planets) {
        for (const edu of educationLevelKeys) {
            // Sum employed in population
            let popEmployed = 0;
            for (const cohort of planet.population.demography) {
                for (const skill of SKILL) {
                    popEmployed += cohort.employed[edu][skill].total;
                }
            }

            // Sum workforce across all agents on this planet.
            // NOTE: departingFired is a *subset tag* on departing (tracks
            // which departing workers were fired vs voluntary quits) — it
            // is NOT an additional pool.  Only active + departing count.
            let wfTotal = 0;
            for (const agent of agents.values()) {
                const wf = agent.assets[planetId]?.workforceDemography;
                if (!wf) {
                    continue;
                }
                for (let age = 0; age < wf.length; age++) {
                    for (const skill of SKILL) {
                        const cell = wf[age][edu][skill];
                        wfTotal += cell.active;
                        for (const d of cell.departing) {
                            wfTotal += d;
                        }
                    }
                }
            }

            if (popEmployed !== wfTotal) {
                discrepancies.push(
                    `planet=${planetId} edu=${edu}: population(employed)=${popEmployed} ≠ workforce=${wfTotal}`,
                );
            }
        }
    }

    return discrepancies;
}

// ---------------------------------------------------------------------------
// Age-moment consistency
// ---------------------------------------------------------------------------

/**
 * Verify that no population category has negative total or nonsensical
 * Gaussian moments (negative variance, NaN values).
 */
export function checkAgeMomentConsistency(agents: Map<string, Agent>, planets: Map<string, Planet>): string[] {
    const discrepancies: string[] = [];

    for (const [planetId, planet] of planets) {
        for (let age = 0; age < planet.population.demography.length; age++) {
            forEachPopulationCohort(planet.population.demography[age], (cat, occ, edu, skill) => {
                if (cat.total < 0) {
                    discrepancies.push(
                        `planet=${planetId} age=${age} occ=${occ} edu=${edu} skill=${skill}: negative total=${cat.total}`,
                    );
                }
                if (Number.isNaN(cat.wealth.mean) || Number.isNaN(cat.wealth.variance)) {
                    discrepancies.push(
                        `planet=${planetId} age=${age} occ=${occ} edu=${edu} skill=${skill}: NaN wealth moments`,
                    );
                }
                if (cat.wealth.variance < 0) {
                    discrepancies.push(
                        `planet=${planetId} age=${age} occ=${occ} edu=${edu} skill=${skill}: negative variance=${cat.wealth.variance}`,
                    );
                }
            });
        }
    }

    return discrepancies;
}
