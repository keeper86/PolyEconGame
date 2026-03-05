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
    AgeResolvedAccumulator,
    EducationLevelType,
    Environment,
    Occupation,
    Planet,
    Population,
    TenureCohort,
} from '../planet';
import { educationLevelKeys } from '../planet';
import { removeFromAgeMoments } from './workforceHelpers';
import { distributeProportionally } from '../utils/distributeProportionally';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Occupations that map to workforce active buckets. */
const WORKFORCE_OCCUPATIONS: Occupation[] = ['company', 'government'];

/**
 * Count total workers (active + departing pipeline) for a single tenure
 * cohort and education level.
 */
function totalWorkersInCohort(cohort: TenureCohort, edu: EducationLevelType): number {
    let total = cohort.active[edu].count;
    const dep = cohort.departing[edu];
    for (let m = 0; m < dep.length; m++) {
        total += dep[m].count;
    }
    return total;
}

/**
 * Distribute `count` removals for a single (age, edu, occ) cell across
 * agents and their tenure cohorts using the largest-remainder (Hamilton)
 * method weighted by headcount.
 *
 * Because we know the exact age of the removed workers, we can call
 * `removeFromAgeMoments(m, age, k)` for drift-free updates.
 *
 * Removals are distributed across active workers AND departing pipeline
 * workers because the population model counts all of them under the same
 * occupation.
 */
function distributeAgeCellRemovals(
    agents: Agent[],
    planetId: string,
    edu: EducationLevelType,
    age: number,
    count: number,
    trackDeaths: boolean,
): void {
    if (count <= 0) {
        return;
    }

    // Gather per-agent headcounts for this edu on the planet.
    const agentEntries: { agent: Agent; headcount: number }[] = [];
    let totalHeadcount = 0;

    for (const agent of agents) {
        const wf = agent.assets[planetId]?.workforceDemography;
        if (!wf) {
            continue;
        }
        let agentHead = 0;
        for (let ci = 0; ci < wf.length; ci++) {
            agentHead += totalWorkersInCohort(wf[ci], edu);
        }
        if (agentHead > 0) {
            agentEntries.push({ agent, headcount: agentHead });
            totalHeadcount += agentHead;
        }
    }
    if (totalHeadcount === 0) {
        return;
    }

    // Allocate integer removals to agents using largest-remainder
    const agentWeights = agentEntries.map((a) => a.headcount);
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

        // Track deaths
        if (trackDeaths) {
            if (!assets.deathsThisMonth) {
                assets.deathsThisMonth = {} as Record<EducationLevelType, number>;
                for (const e of educationLevelKeys) {
                    assets.deathsThisMonth[e] = 0;
                }
            }
            assets.deathsThisMonth[edu] += toRemove;
        }

        const wf = assets.workforceDemography;

        // Distribute across tenure cohorts proportionally to headcount
        const cohortWeights = wf.map((c) => totalWorkersInCohort(c, edu));
        const cohortTotal = cohortWeights.reduce((s, v) => s + v, 0);
        if (cohortTotal <= 0) {
            continue;
        }

        const cohortRemovals = distributeProportionally(toRemove, cohortWeights);

        // Apply removals within each cohort, splitting between active and
        // departing proportionally, using exact age for moment subtraction.
        let totalPending = toRemove;
        const pendingRemovals = cohortRemovals.slice();

        while (totalPending > 0) {
            let removedThisPass = 0;
            let overflow = 0;

            for (let ci = 0; ci < wf.length; ci++) {
                let wanted = pendingRemovals[ci];
                if (wanted <= 0) {
                    continue;
                }
                pendingRemovals[ci] = 0;

                const cohort = wf[ci];
                const activeCount = cohort.active[edu].count;

                let departingTotal = 0;
                const dep = cohort.departing[edu];
                for (let m = 0; m < dep.length; m++) {
                    departingTotal += dep[m].count;
                }

                const poolTotal = activeCount + departingTotal;
                if (poolTotal <= 0) {
                    overflow += wanted;
                    continue;
                }

                if (wanted > poolTotal) {
                    overflow += wanted - poolTotal;
                    wanted = poolTotal;
                }

                // Split proportionally between active and departing
                const poolWeights = [activeCount, departingTotal];
                const poolAlloc = distributeProportionally(wanted, poolWeights);
                let fromActive = Math.min(poolAlloc[0], activeCount);
                let fromDeparting = Math.min(poolAlloc[1], departingTotal);

                // Ensure we don't under-remove
                let poolExcess = wanted - fromActive - fromDeparting;
                if (poolExcess > 0 && fromActive < activeCount) {
                    const take = Math.min(poolExcess, activeCount - fromActive);
                    fromActive += take;
                    poolExcess -= take;
                }
                if (poolExcess > 0 && fromDeparting < departingTotal) {
                    const take = Math.min(poolExcess, departingTotal - fromDeparting);
                    fromDeparting += take;
                    poolExcess -= take;
                }

                const actuallyRemoved = fromActive + fromDeparting;
                removedThisPass += actuallyRemoved;

                // --- Remove from active using exact age ---
                if (fromActive > 0) {
                    cohort.active[edu] = removeFromAgeMoments(cohort.active[edu], age, fromActive);
                }

                // --- Remove from departing pipeline (proportional across slots) ---
                if (fromDeparting > 0 && departingTotal > 0) {
                    let toRemoveFromDep = fromDeparting;
                    // Distribute across departing slots proportionally
                    for (let m = 0; m < dep.length && toRemoveFromDep > 0; m++) {
                        const slotCount = dep[m].count;
                        if (slotCount <= 0) {
                            continue;
                        }
                        const slotShare = Math.round((slotCount / departingTotal) * fromDeparting);
                        const take = Math.min(slotShare, slotCount, toRemoveFromDep);
                        if (take > 0) {
                            dep[m] = removeFromAgeMoments(dep[m], age, take);
                            toRemoveFromDep -= take;
                        }
                    }
                    // Sweep any remaining from slots with workers
                    for (let m = 0; m < dep.length && toRemoveFromDep > 0; m++) {
                        const take = Math.min(toRemoveFromDep, dep[m].count);
                        if (take > 0) {
                            dep[m] = removeFromAgeMoments(dep[m], age, take);
                            toRemoveFromDep -= take;
                        }
                    }
                    // Clamp departingFired so it never exceeds departing per slot
                    const fired = cohort.departingFired[edu];
                    for (let m = 0; m < fired.length; m++) {
                        if (fired[m] > dep[m].count) {
                            fired[m] = dep[m].count;
                        }
                    }
                }
            }

            totalPending -= removedThisPass;

            if (overflow <= 0 || removedThisPass === 0) {
                break;
            }

            // Redistribute overflow proportionally across remaining cohorts
            const overflowWeights = wf.map((c) => totalWorkersInCohort(c, edu));
            const overflowAlloc = distributeProportionally(overflow, overflowWeights);
            for (let ci = 0; ci < wf.length; ci++) {
                pendingRemovals[ci] = overflowAlloc[ci];
            }
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
    function processAccumulator(acc: AgeResolvedAccumulator | undefined, trackDeaths: boolean): void {
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
                    distributeAgeCellRemovals(relevantAgents, planetId, edu, age, count, trackDeaths);
                }
            }
        }
    }

    // Deaths
    processAccumulator(tickDeathsByAge, /* trackDeaths */ true);
    // Disabilities
    processAccumulator(tickDisabilitiesByAge, /* trackDeaths */ false);
    // Retirements
    processAccumulator(tickRetirementsByAge, /* trackDeaths */ false);
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
