/**
 * workforce/workforceSync.ts
 *
 * Synchronisation between the authoritative population demography and
 * agents' WorkforceDemography after mortality, disability, and retirement
 * transitions.
 *
 * The population pipeline now records **age-resolved** events
 * (tickDeathsByAge, tickDisabilitiesByAge, tickRetirementsByAge).  This
 * module consumes those exact per-age counts and uses
 * `removeFromAgeMoments(moments, age, k)` to keep the compact workforce
 * representation perfectly in sync — no Gaussian approximation needed.
 */

import type {
    Agent,
    AgeMoments,
    AgeResolvedAccumulator,
    EducationLevelType,
    Environment,
    Occupation,
    Planet,
    Population,
    TenureCohort,
} from '../planet';
import { educationLevelKeys } from '../planet';
import { removeFromAgeMoments, ageMean, ageVariance } from './workforceHelpers';
import { distributeProportionally } from '../utils/distributeProportionally';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Occupations that map to workforce active buckets. */
const WORKFORCE_OCCUPATIONS: Occupation[] = ['company', 'government'];

/**
 * Count total workers (active + entire departing pipeline) for a single
 * tenure cohort and education level.
 *
 * Note: `departing[edu][m].count` already includes **fired** workers —
 * `departingFired` is merely a subset counter of `departing`, not a
 * separate pipeline.  Therefore active + departing = the full headcount
 * that the population model still considers employed (and thus subject
 * to deaths, disabilities, and retirements).
 */
function totalWorkersInCohort(cohort: TenureCohort, edu: EducationLevelType): number {
    let total = cohort.active[edu].count;
    const dep = cohort.departing[edu];
    for (let m = 0; m < dep.length; m++) {
        total += dep[m].count;
    }
    return total;
}

/** Type of demographic event being applied by workforceSync. */
type DemographicEventType = 'death' | 'disability' | 'retirement';

/**
 * Estimate how many workers at a specific `age` exist within a pool
 * described by `AgeMoments`.  This uses the Gaussian approximation of
 * the age distribution within the cohort.
 *
 * For a zero-variance (single-age) cohort, returns count if the cohort's
 * mean rounds to `age`, else 0.
 *
 * For cohorts with non-trivial variance, uses the Gaussian PDF weight:
 *   weight = count × φ((age − mean) / σ)
 * where φ is the standard normal PDF.
 *
 * This is the critical function that ensures demographic removals are
 * routed to cohorts that actually plausibly contain workers of the target
 * age — preventing moment corruption from removing e.g. age-67 workers
 * from a cohort whose actual workers are all ~25 years old.
 */
function estimatedWorkersAtAge(m: AgeMoments, age: number): number {
    if (m.count <= 0) {
        return 0;
    }
    const mean = ageMean(m);
    const variance = ageVariance(m);

    if (variance < 1) {
        // Near-delta distribution: only matches if age ≈ mean
        // Use a tolerance window of ±1 year to handle rounding
        return Math.abs(age - mean) <= 1.5 ? m.count : 0;
    }

    const stdDev = Math.sqrt(variance);
    const z = (age - mean) / stdDev;
    // Gaussian PDF weight (unnormalised — we only need relative weights)
    // exp(-0.5 * z²) drops off rapidly: at z=3 it's ~0.01, at z=4 ~0.0003
    return m.count * Math.exp(-0.5 * z * z);
}

/**
 * Compute the age-weighted likelihood for each tenure cohort×pool(active/departing)
 * slot to contain workers at a specific age.  Returns a flat array of weights
 * corresponding to all pools across all cohorts.
 */
function computeAgeWeightsForCohorts(
    wf: TenureCohort[],
    edu: EducationLevelType,
    age: number,
): { activeWeights: number[]; departingWeights: number[][] } {
    const activeWeights: number[] = new Array(wf.length);
    const departingWeights: number[][] = new Array(wf.length);

    for (let ci = 0; ci < wf.length; ci++) {
        const cohort = wf[ci];
        activeWeights[ci] = estimatedWorkersAtAge(cohort.active[edu], age);

        const dep = cohort.departing[edu];
        departingWeights[ci] = new Array(dep.length);
        for (let m = 0; m < dep.length; m++) {
            departingWeights[ci][m] = estimatedWorkersAtAge(dep[m], age);
        }
    }
    return { activeWeights, departingWeights };
}

/**
 * Distribute `count` removals for a single (age, edu, occ) cell across
 * agents and their tenure cohorts, using **age-weighted** distribution
 * so that removals target cohorts that plausibly contain workers of that
 * exact age.
 *
 * The weight for each cohort is proportional to its estimated number of
 * workers at the target age (Gaussian approximation from moments).  This
 * ensures that removing age-67 retirees targets high-tenure cohorts with
 * older workers, not tenure-0 cohorts full of 25-year-olds — which would
 * corrupt the raw moments and cause systematic drift.
 *
 * Because we know the exact age of the removed workers, we can call
 * `removeFromAgeMoments(m, age, k)` for drift-free updates.
 */
function distributeAgeCellRemovals(
    agents: Agent[],
    planetId: string,
    edu: EducationLevelType,
    age: number,
    count: number,
    eventType: DemographicEventType,
): void {
    if (count <= 0) {
        return;
    }

    // Gather per-agent age-weighted likelihood of having workers at this age.
    const agentEntries: { agent: Agent; ageWeight: number }[] = [];
    let totalAgeWeight = 0;

    for (const agent of agents) {
        const wf = agent.assets[planetId]?.workforceDemography;
        if (!wf) {
            continue;
        }
        let agentWeight = 0;
        for (let ci = 0; ci < wf.length; ci++) {
            agentWeight += estimatedWorkersAtAge(wf[ci].active[edu], age);
            const dep = wf[ci].departing[edu];
            for (let m = 0; m < dep.length; m++) {
                agentWeight += estimatedWorkersAtAge(dep[m], age);
            }
        }
        if (agentWeight > 0) {
            agentEntries.push({ agent, ageWeight: agentWeight });
            totalAgeWeight += agentWeight;
        }
    }

    // Fallback: if no agent has plausible workers at this age (e.g. moments
    // are stale or all near-delta at different ages), fall back to headcount-
    // based distribution to ensure conservation.
    if (totalAgeWeight === 0) {
        for (const agent of agents) {
            const wf = agent.assets[planetId]?.workforceDemography;
            if (!wf) {
                continue;
            }
            let head = 0;
            for (let ci = 0; ci < wf.length; ci++) {
                head += totalWorkersInCohort(wf[ci], edu);
            }
            if (head > 0) {
                agentEntries.push({ agent, ageWeight: head });
                totalAgeWeight += head;
            }
        }
    }

    if (totalAgeWeight === 0) {
        return;
    }

    // Allocate integer removals to agents using largest-remainder
    const agentWeights = agentEntries.map((a) => a.ageWeight);
    const agentRemovals = distributeProportionally(count, agentWeights);

    for (let i = 0; i < agentEntries.length; i++) {
        const { agent } = agentEntries[i];
        const toRemove = agentRemovals[i] ?? 0;
        if (toRemove <= 0) {
            continue;
        }

        const assets = agent.assets[planetId];
        if (!assets?.workforceDemography) {
            continue;
        }

        // Track demographic event on agent assets
        {
            const initRecord = (): Record<EducationLevelType, number> => {
                const rec = {} as Record<EducationLevelType, number>;
                for (const e of educationLevelKeys) {
                    rec[e] = 0;
                }
                return rec;
            };
            if (eventType === 'death') {
                if (!assets.deathsThisMonth) {
                    assets.deathsThisMonth = initRecord();
                }
                assets.deathsThisMonth[edu] += toRemove;
            } else if (eventType === 'disability') {
                if (!assets.disabilitiesThisMonth) {
                    assets.disabilitiesThisMonth = initRecord();
                }
                assets.disabilitiesThisMonth[edu] += toRemove;
            } else if (eventType === 'retirement') {
                if (!assets.retirementsThisMonth) {
                    assets.retirementsThisMonth = initRecord();
                }
                assets.retirementsThisMonth[edu] += toRemove;
            }
        }

        const wf = assets.workforceDemography;

        // Distribute across ALL pools (active + departing slots) weighted by
        // estimated worker count at the target age.
        const { activeWeights, departingWeights } = computeAgeWeightsForCohorts(wf, edu, age);

        // Build a flat list of pools with their weights and refs
        type PoolRef =
            | { type: 'active'; cohortIdx: number }
            | { type: 'departing'; cohortIdx: number; slotIdx: number };
        const pools: { ref: PoolRef; weight: number; capacity: number }[] = [];

        for (let ci = 0; ci < wf.length; ci++) {
            const cohort = wf[ci];
            if (activeWeights[ci] > 0) {
                pools.push({
                    ref: { type: 'active', cohortIdx: ci },
                    weight: activeWeights[ci],
                    capacity: cohort.active[edu].count,
                });
            }
            const dep = cohort.departing[edu];
            for (let m = 0; m < dep.length; m++) {
                if (departingWeights[ci][m] > 0) {
                    pools.push({
                        ref: { type: 'departing', cohortIdx: ci, slotIdx: m },
                        weight: departingWeights[ci][m],
                        capacity: dep[m].count,
                    });
                }
            }
        }

        // Fallback: if no pool has age-weight (shouldn't happen since we
        // already checked agents), use headcount weights.
        if (pools.length === 0) {
            for (let ci = 0; ci < wf.length; ci++) {
                const cohort = wf[ci];
                if (cohort.active[edu].count > 0) {
                    pools.push({
                        ref: { type: 'active', cohortIdx: ci },
                        weight: cohort.active[edu].count,
                        capacity: cohort.active[edu].count,
                    });
                }
                const dep = cohort.departing[edu];
                for (let m = 0; m < dep.length; m++) {
                    if (dep[m].count > 0) {
                        pools.push({
                            ref: { type: 'departing', cohortIdx: ci, slotIdx: m },
                            weight: dep[m].count,
                            capacity: dep[m].count,
                        });
                    }
                }
            }
        }

        if (pools.length === 0) {
            continue;
        }

        // Distribute removals across pools proportionally, with overflow
        // redistribution to ensure all removals are accounted for.
        let remaining = toRemove;
        let activePools = pools.map((p, idx) => ({ ...p, idx }));

        while (remaining > 0 && activePools.length > 0) {
            const weights = activePools.map((p) => p.weight);
            const allocated = distributeProportionally(remaining, weights);
            let removedThisPass = 0;

            const nextActivePools: typeof activePools = [];

            for (let j = 0; j < activePools.length; j++) {
                const pool = activePools[j];
                const wanted = allocated[j];
                if (wanted <= 0) {
                    if (pool.capacity > 0) {
                        nextActivePools.push(pool);
                    }
                    continue;
                }

                // Clamp to capacity
                const actual = Math.min(wanted, pool.capacity);
                if (actual <= 0) {
                    continue;
                }

                const { ref } = pool;
                if (ref.type === 'active') {
                    const cohort = wf[ref.cohortIdx];
                    cohort.active[edu] = removeFromAgeMoments(cohort.active[edu], age, actual);
                } else {
                    const cohort = wf[ref.cohortIdx];
                    const dep = cohort.departing[edu];
                    dep[ref.slotIdx] = removeFromAgeMoments(dep[ref.slotIdx], age, actual);
                    // Clamp departingFired so it never exceeds departing
                    const fired = cohort.departingFired[edu];
                    if (fired[ref.slotIdx] > dep[ref.slotIdx].count) {
                        fired[ref.slotIdx] = dep[ref.slotIdx].count;
                    }
                }

                pool.capacity -= actual;
                removedThisPass += actual;

                if (pool.capacity > 0) {
                    nextActivePools.push(pool);
                }
            }

            remaining -= removedThisPass;
            if (removedThisPass === 0) {
                break; // no progress — can't remove any more
            }
            activePools = nextActivePools;
        }
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * syncWorkforceWithPopulation — apply deaths, new disabilities, and
 * retirements computed by the population pipeline to agents'
 * WorkforceDemography so both representations remain consistent.
 *
 * Uses the **age-resolved** event accumulators
 * (`tickDeathsByAge`, `tickDisabilitiesByAge`, `tickRetirementsByAge`)
 * produced by the population pipeline, so that `removeFromAgeMoments`
 * can be called with the exact age of each removed worker — eliminating
 * the drift inherent in the old Gaussian-weighted distribution approach.
 *
 * Deaths/disabilities for a given occupation are distributed only to
 * agents of that same occupation (company vs government).
 */
export function syncWorkforceWithPopulation(
    agents: Map<string, Agent>,
    planetId: string,
    population: Population,
    _environment: Environment,
    planet?: Planet,
): void {
    const { tickDeathsByAge, tickDisabilitiesByAge, tickRetirementsByAge } = population;

    // --- Build agent occupation lookup ---
    const governmentId = planet?.governmentId;
    const allAgents = [...agents.values()];

    function agentsForOcc(occ: Occupation): Agent[] {
        if (!governmentId) {
            return allAgents;
        }
        if (occ === 'government') {
            const gov = agents.get(governmentId);
            return gov ? [gov] : [];
        }
        return allAgents.filter((a) => a.id !== governmentId);
    }

    // Helper: iterate an AgeResolvedAccumulator and dispatch removals
    function processAccumulator(acc: AgeResolvedAccumulator | undefined, eventType: DemographicEventType): void {
        if (!acc) {
            return;
        }
        for (const ageStr of Object.keys(acc)) {
            const age = Number(ageStr);
            const eduRecord = acc[age];
            if (!eduRecord) {
                continue;
            }
            for (const edu of educationLevelKeys) {
                const occRecord = eduRecord[edu];
                if (!occRecord) {
                    continue;
                }
                for (const occ of WORKFORCE_OCCUPATIONS) {
                    const count = occRecord[occ] ?? 0;
                    if (count <= 0) {
                        continue;
                    }
                    const relevantAgents = agentsForOcc(occ);
                    distributeAgeCellRemovals(relevantAgents, planetId, edu, age, count, eventType);
                }
            }
        }
    }

    // Deaths
    processAccumulator(tickDeathsByAge, 'death');
    // Disabilities
    processAccumulator(tickDisabilitiesByAge, 'disability');
    // Retirements
    processAccumulator(tickRetirementsByAge, 'retirement');
}

/**
 * @deprecated Use `syncWorkforceWithPopulation` instead.
 * Kept temporarily for backward compatibility.
 */
export function applyPopulationDeathsToWorkforce(
    agents: Map<string, Agent>,
    planetId: string,
    deathsByEduOcc: Record<EducationLevelType, Record<Occupation, number>>,
    population: Population,
    environment: Environment,
): void {
    population.tickDeaths = deathsByEduOcc;
    syncWorkforceWithPopulation(agents, planetId, population, environment);
}
