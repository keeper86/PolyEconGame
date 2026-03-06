/**
 * market/wealthDiffusion.ts
 *
 * Implements the low-temperature wealth diffusion operator (Subsystem 6).
 *
 * Purpose: Introduce slow, mean-preserving diffusion of wealth variance
 * across all cohort-classes and neighboring age cohorts.
 *
 * Economic justification:
 * - Informal gifts, social mixing, marriage
 * - Small transfers (e.g. "treating someone to breakfast")
 * - Informal redistribution, random shocks, insurance pooling
 *
 * Properties:
 * - Mean wealth unchanged globally
 * - Total wealth unchanged
 * - Variance decays slowly
 * - Diffusion is weak: characteristic timescale ~100 years
 * - Must be dominated by strong forces (wages, profits, interest)
 *
 * Applied AFTER all other wealth updates each tick.
 */

import type { GameState, WealthDemography } from '../planet';
import { educationLevelKeys, OCCUPATIONS } from '../planet';
import { DIFFUSION_EPSILON } from '../constants';
import { getWealthDemography } from '../population/populationHelpers';

// ---------------------------------------------------------------------------
// Main tick
// ---------------------------------------------------------------------------

/**
 * Apply low-temperature wealth diffusion to all planets.
 *
 * Called AFTER intergenerational transfers and BEFORE post-production
 * financial tick.
 */
export function wealthDiffusionTick(gameState: GameState): void {
    gameState.planets.forEach((planet) => {
        const wealthDemography = getWealthDemography(planet.population);

        // Step 1: Within-cohort variance decay
        applyWithinCohortDiffusion(wealthDemography);

        // Step 2: Cross-cohort variance smoothing (adjacent ages)
        applyCrossAgeDiffusion(wealthDemography);
    });
}

// ---------------------------------------------------------------------------
// Within-cohort diffusion
// ---------------------------------------------------------------------------

/**
 * Decay variance within each cohort-class independently.
 *
 *   variance_i ← variance_i × (1 − ε)
 *
 * This is mean-preserving: only variance is affected.
 * Total wealth (Σ mean × pop) is unchanged because means are untouched.
 */
function applyWithinCohortDiffusion(wealthDemography: WealthDemography): void {
    const factor = 1 - DIFFUSION_EPSILON;
    for (let age = 0; age < wealthDemography.length; age++) {
        for (const edu of educationLevelKeys) {
            for (const occ of OCCUPATIONS) {
                const wm = wealthDemography[age][edu][occ];
                if (wm.variance > 0) {
                    wealthDemography[age][edu][occ] = {
                        mean: wm.mean,
                        variance: wm.variance * factor,
                    };
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Cross-age diffusion
// ---------------------------------------------------------------------------

/**
 * Smooth variance between adjacent age cohorts (age ± 1).
 *
 * For each cohort i with adjacent cohort j (age ± 1):
 *   variance_i ← variance_i − ε × (variance_i − variance_j)
 *
 * This creates weak smoothing across the age axis.
 * We use a separate pass to avoid order-dependent artifacts.
 *
 * Implementation: read old variances into a buffer, then write new
 * variances based on the old values.
 */
function applyCrossAgeDiffusion(wealthDemography: WealthDemography): void {
    if (wealthDemography.length < 2) {
        return;
    }

    // For each edu × occ, collect the variance vector, smooth it, write back
    for (const edu of educationLevelKeys) {
        for (const occ of OCCUPATIONS) {
            const n = wealthDemography.length;
            // Read old variances
            const oldVar = new Float64Array(n);
            for (let age = 0; age < n; age++) {
                oldVar[age] = wealthDemography[age][edu][occ].variance;
            }

            // Compute new variances
            for (let age = 0; age < n; age++) {
                let neighborAvg = 0;
                let neighborCount = 0;
                if (age > 0) {
                    neighborAvg += oldVar[age - 1];
                    neighborCount++;
                }
                if (age < n - 1) {
                    neighborAvg += oldVar[age + 1];
                    neighborCount++;
                }
                if (neighborCount > 0) {
                    neighborAvg /= neighborCount;
                    const newVar = oldVar[age] - DIFFUSION_EPSILON * (oldVar[age] - neighborAvg);
                    wealthDemography[age][edu][occ] = {
                        mean: wealthDemography[age][edu][occ].mean,
                        variance: Math.max(0, newVar),
                    };
                }
            }
        }
    }
}
