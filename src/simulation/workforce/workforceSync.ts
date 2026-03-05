/**
 * workforce/workforceSync.ts
 *
 * Synchronisation between the authoritative population demography and
 * agents' WorkforceDemography after mortality and disability transitions.
 *
 * Uses age-weighted distribution (Hamilton method) so that tenure cohorts
 * with older workers attract proportionally more removals.
 */

import type { Agent, EducationLevelType, Environment, Occupation, Planet, Population } from '../planet';
import { educationLevelKeys } from '../planet';
import { DEFAULT_HIRE_AGE_MEAN, expectedRateForMoments } from './workforceHelpers';
import { distributeProportionally } from '../utils/distributeProportionally';
import {
    convertAnnualToPerTick,
    perTickMortality,
    computeEnvironmentalMortality,
    computeExtraAnnualMortality,
} from '../population/mortality';
import {
    ageDependentBaseDisabilityProb,
    computeEnvironmentalDisability,
    STARVATION_DISABILITY_COEFFICIENT,
} from '../population/disability';
import { perTickRetirement } from '../population/retirement';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Occupations that map to workforce active buckets. */
const WORKFORCE_OCCUPATIONS: Occupation[] = ['company', 'government'];

/**
 * Count total workers (active + departing pipeline + retiring pipeline)
 * for a single tenure cohort and education level.
 */
function totalWorkersInCohort(
    cohort: { active: Record<string, number>; departing: Record<string, number[]>; retiring: Record<string, number[]> },
    edu: EducationLevelType,
): number {
    let total = cohort.active[edu] ?? 0;
    const dep = cohort.departing[edu];
    if (dep) {
        for (let m = 0; m < dep.length; m++) {
            total += dep[m];
        }
    }
    const ret = cohort.retiring[edu];
    if (ret) {
        for (let m = 0; m < ret.length; m++) {
            total += ret[m];
        }
    }
    return total;
}

/**
 * Distribute `count` removals for a single (edu, occ) pair across agents
 * and their tenure cohorts using the largest-remainder (Hamilton) method,
 * **weighted by age-dependent expected rate**.
 *
 * Each tenure cohort tracks `ageMoments` (mean, variance) per education
 * level.  Instead of distributing removals proportionally to headcount
 * alone — which under-counts old-age deaths and over-counts young-age
 * deaths — we weight each cohort by `headcount × expectedRate(ageMoments)`.
 *
 * This means a cohort of 10 workers with mean age 75 will attract far
 * more mortality removals than a cohort of 10 workers with mean age 25,
 * matching the biological reality even though we only know the age
 * distribution statistically.
 *
 * **IMPORTANT**: Removals are distributed across active workers AND
 * pipeline workers (departing + retiring).  The population model does not
 * distinguish between active and pipeline workers — they are all counted
 * under the same occupation.  When mortality/disability kills a worker,
 * that worker may have been in any of these pools.  Distributing only
 * from `active` would create ghost pipeline workers that later attempt to
 * transfer back into the population, causing population < workforce drift.
 *
 * @param agents      All agents to consider.
 * @param planetId    Planet whose workforce is updated.
 * @param edu         Education level being processed.
 * @param count       Total integer removals to distribute.
 * @param trackDeaths If true, accumulate into `assets.deathsThisMonth`.
 * @param ageRateFn   Age-dependent rate function (e.g. mortality or
 *                    disability per-tick probability).  Used to weight
 *                    distribution across cohorts.  If omitted, falls
 *                    back to headcount-proportional distribution.
 */
function distributeWorkforceRemovals(
    agents: Agent[],
    planetId: string,
    edu: EducationLevelType,
    count: number,
    trackDeaths: boolean,
    ageRateFn?: (age: number) => number,
): void {
    if (count <= 0) {
        return;
    }

    // Gather per-agent weighted totals for this edu on the planet.
    // Weight = sum over cohorts of (totalWorkers × expectedRate).
    // totalWorkers includes active + departing + retiring because the
    // population model counts all of them under the same occupation.
    const agentEntries: {
        agent: Agent;
        weight: number;
        cohortWeights: number[]; // per tenure cohort
    }[] = [];
    let totalWeight = 0;

    for (const agent of agents) {
        const wf = agent.assets[planetId]?.workforceDemography;
        if (!wf) {
            continue;
        }

        const cohortWeights: number[] = new Array(wf.length);
        let agentWeight = 0;
        for (let ci = 0; ci < wf.length; ci++) {
            const headcount = totalWorkersInCohort(wf[ci], edu);
            if (headcount <= 0) {
                cohortWeights[ci] = 0;
                continue;
            }
            if (ageRateFn) {
                const rate = expectedRateForMoments(wf[ci].ageMoments[edu], ageRateFn);
                cohortWeights[ci] = headcount * Math.max(rate, 1e-12);
            } else {
                cohortWeights[ci] = headcount;
            }
            agentWeight += cohortWeights[ci];
        }

        if (agentWeight > 0) {
            agentEntries.push({ agent, weight: agentWeight, cohortWeights });
            totalWeight += agentWeight;
        }
    }

    if (totalWeight === 0) {
        return; // No workforce to remove from (rare).
    }

    // Allocate integer removals to agents using largest-remainder method
    const agentWeights = agentEntries.map((a) => a.weight);
    const agentRemovals = distributeProportionally(count, agentWeights);

    // Apply removals within each agent, distributing across tenure cohorts
    for (let i = 0; i < agentEntries.length; i++) {
        const { agent, cohortWeights } = agentEntries[i];
        const toRemoveForAgent = agentRemovals[i] ?? 0;
        if (!toRemoveForAgent) {
            continue;
        }

        const assets = agent.assets[planetId];
        if (!assets) {
            continue;
        }

        // Optionally accumulate into the per-agent monthly death counter
        if (trackDeaths) {
            if (!assets.deathsThisMonth) {
                assets.deathsThisMonth = {} as Record<EducationLevelType, number>;
                for (const e of educationLevelKeys) {
                    assets.deathsThisMonth[e] = 0;
                }
            }
            assets.deathsThisMonth[edu] += toRemoveForAgent;
        }

        const wf = assets.workforceDemography;
        if (!wf) {
            continue;
        }

        // Within-agent distribution uses cohort-level weights
        const agentCohortTotal = cohortWeights.reduce((s, v) => s + v, 0);
        if (agentCohortTotal === 0) {
            continue;
        }

        // Allocate removals across cohorts (largest-remainder, weighted)
        const cohortRemovals = distributeProportionally(toRemoveForAgent, cohortWeights);

        // Apply removals to each cohort, splitting between active, departing,
        // and retiring proportionally.  This prevents ghost pipeline workers
        // from accumulating when mortality hits workers in the pipeline.
        //
        // An overflow redistribution loop ensures that if a cohort can't absorb
        // all its assigned removals (poolTotal < wanted), the excess is
        // redistributed to remaining cohorts.  Without this, removals would be
        // silently dropped and the workforce would drift above the population.
        let totalPending = toRemoveForAgent;
        const pendingRemovals = cohortRemovals.slice();

        while (totalPending > 0) {
            let removedThisPass = 0;
            let overflow = 0;

            for (let ci = 0; ci < wf.length; ci++) {
                let wanted = pendingRemovals[ci];
                if (wanted <= 0) {
                    continue;
                }
                pendingRemovals[ci] = 0; // consumed

                const cohort = wf[ci];
                const activeCount = cohort.active[edu];

                // Sum departing pipeline
                let departingTotal = 0;
                const dep = cohort.departing[edu];
                for (let m = 0; m < dep.length; m++) {
                    departingTotal += dep[m];
                }

                // Sum retiring pipeline
                let retiringTotal = 0;
                const ret = cohort.retiring[edu];
                for (let m = 0; m < ret.length; m++) {
                    retiringTotal += ret[m];
                }

                const poolTotal = activeCount + departingTotal + retiringTotal;
                if (poolTotal <= 0) {
                    overflow += wanted;
                    continue;
                }

                // Cap at what's available; excess becomes overflow
                if (wanted > poolTotal) {
                    overflow += wanted - poolTotal;
                    wanted = poolTotal;
                }

                // Split removals proportionally between pools using Hamilton method
                const poolWeights = [activeCount, departingTotal, retiringTotal];
                const poolAlloc = distributeProportionally(wanted, poolWeights);
                let fromActive = poolAlloc[0];
                let fromDeparting = poolAlloc[1];
                let fromRetiring = poolAlloc[2];

                // Clamp to available and shift excess between pools within this cohort
                fromActive = Math.min(fromActive, activeCount);
                fromDeparting = Math.min(fromDeparting, departingTotal);
                fromRetiring = Math.min(fromRetiring, retiringTotal);

                let poolExcess = wanted - fromActive - fromDeparting - fromRetiring;
                while (poolExcess > 0) {
                    let movedExcess = 0;
                    if (fromActive < activeCount) {
                        const take = Math.min(poolExcess, activeCount - fromActive);
                        fromActive += take;
                        poolExcess -= take;
                        movedExcess += take;
                    }
                    if (poolExcess > 0 && fromDeparting < departingTotal) {
                        const take = Math.min(poolExcess, departingTotal - fromDeparting);
                        fromDeparting += take;
                        poolExcess -= take;
                        movedExcess += take;
                    }
                    if (poolExcess > 0 && fromRetiring < retiringTotal) {
                        const take = Math.min(poolExcess, retiringTotal - fromRetiring);
                        fromRetiring += take;
                        poolExcess -= take;
                        movedExcess += take;
                    }
                    if (movedExcess === 0) {
                        break;
                    }
                }

                const actuallyRemoved = fromActive + fromDeparting + fromRetiring;
                removedThisPass += actuallyRemoved;

                // --- Remove from active ---
                if (fromActive > 0) {
                    cohort.active[edu] -= fromActive;
                    if (cohort.active[edu] === 0) {
                        cohort.ageMoments[edu] = { mean: DEFAULT_HIRE_AGE_MEAN, variance: 0 };
                    }
                }

                // --- Remove from departing pipeline (proportional across slots) ---
                if (fromDeparting > 0 && departingTotal > 0) {
                    let toRemoveFromDep = fromDeparting;
                    // Distribute across departing slots proportionally
                    for (let m = 0; m < dep.length && toRemoveFromDep > 0; m++) {
                        const slotShare = Math.round((dep[m] / departingTotal) * fromDeparting);
                        const take = Math.min(slotShare, dep[m], toRemoveFromDep);
                        dep[m] -= take;
                        toRemoveFromDep -= take;
                    }
                    // Sweep any remaining from slots with workers
                    for (let m = 0; m < dep.length && toRemoveFromDep > 0; m++) {
                        const take = Math.min(toRemoveFromDep, dep[m]);
                        dep[m] -= take;
                        toRemoveFromDep -= take;
                    }
                    // Clamp departingFired so it never exceeds departing per slot
                    const fired = cohort.departingFired[edu];
                    for (let m = 0; m < fired.length; m++) {
                        if (fired[m] > dep[m]) {
                            fired[m] = dep[m];
                        }
                    }
                }

                // --- Remove from retiring pipeline (proportional across slots) ---
                if (fromRetiring > 0 && retiringTotal > 0) {
                    let toRemoveFromRet = fromRetiring;
                    for (let m = 0; m < ret.length && toRemoveFromRet > 0; m++) {
                        const slotShare = Math.round((ret[m] / retiringTotal) * fromRetiring);
                        const take = Math.min(slotShare, ret[m], toRemoveFromRet);
                        ret[m] -= take;
                        toRemoveFromRet -= take;
                    }
                    // Sweep remaining
                    for (let m = 0; m < ret.length && toRemoveFromRet > 0; m++) {
                        const take = Math.min(toRemoveFromRet, ret[m]);
                        ret[m] -= take;
                        toRemoveFromRet -= take;
                    }
                }
            }

            totalPending -= removedThisPass;

            if (overflow <= 0 || removedThisPass === 0) {
                break; // no overflow or no capacity left anywhere
            }

            // Redistribute overflow proportionally across remaining cohorts
            let remainingTotal = 0;
            for (let ci = 0; ci < wf.length; ci++) {
                remainingTotal += totalWorkersInCohort(wf[ci], edu);
            }
            if (remainingTotal <= 0) {
                break;
            }
            // Use Hamilton method for overflow redistribution
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
 * For **deaths**: workers in `company` / `government` occupations that died
 * this tick are removed from the corresponding workforce active slots.
 *
 * For **disabilities**: workers in `company` / `government` occupations that
 * transitioned to `unableToWork` this tick are likewise removed from the
 * workforce active slots.  (The population demography already moved them to
 * `unableToWork`; this step keeps the workforce side in sync.)
 *
 * **IMPORTANT**: Deaths/disabilities for a given occupation are distributed
 * only to agents of that same occupation.  Company-occupation deaths go to
 * company agents; government-occupation deaths go to the government agent.
 * Mixing them would cause cross-contamination where one agent absorbs
 * removals meant for the other, leading to workforce > population drift.
 *
 * Distribution is **age-weighted**: each tenure cohort's share of removals
 * is proportional to `headcount × expectedRate(ageMoments)` rather than
 * headcount alone.
 *
 * @param planet      The planet (used to determine which agent is government).
 * @param population  The authoritative population (for starvation level).
 * @param environment The planet's environment (pollution, disasters).
 */
export function syncWorkforceWithPopulation(
    agents: Map<string, Agent>,
    planetId: string,
    population: Population,
    environment: Environment,
    planet?: Planet,
): void {
    const { tickDeaths, tickNewDisabilities, tickNewRetirements, starvationLevel } = population;

    // --- Build agent occupation lookup ---
    // If we have the planet reference, use it to correctly filter agents by
    // occupation.  Otherwise fall back to passing all agents (legacy path).
    const governmentId = planet?.governmentId;
    const allAgents = [...agents.values()];

    function agentsForOcc(occ: Occupation): Agent[] {
        if (!governmentId) {
            return allAgents; // legacy fallback — no planet reference
        }
        if (occ === 'government') {
            const gov = agents.get(governmentId);
            return gov ? [gov] : [];
        }
        // 'company' — every agent that is NOT the government
        return allAgents.filter((a) => a.id !== governmentId);
    }

    // --- Build age-dependent rate functions for this tick's conditions ---

    // Mortality rate function: same formula as applyMortality uses
    const envMort = computeEnvironmentalMortality(environment);
    const extraAnnualMort = computeExtraAnnualMortality(envMort);
    const mortalityRateFn = (age: number): number => perTickMortality(age, starvationLevel, extraAnnualMort);

    // Disability rate function: same formula as applyDisability uses
    const envDisab = computeEnvironmentalDisability(environment);
    const starvDisabProb = STARVATION_DISABILITY_COEFFICIENT * Math.pow(starvationLevel, 2);
    const totalDisabBase = envDisab.pollutionDisabilityProb + envDisab.disasterDisabilityProb + starvDisabProb;
    const disabilityRateFn = (age: number): number =>
        convertAnnualToPerTick(totalDisabBase + ageDependentBaseDisabilityProb(age));

    for (const edu of educationLevelKeys) {
        for (const occ of WORKFORCE_OCCUPATIONS) {
            const relevantAgents = agentsForOcc(occ);

            // Deaths — remove from workforce, track in deathsThisMonth
            const deaths = tickDeaths?.[edu]?.[occ] ?? 0;

            // Disabilities — remove from workforce (already moved to unableToWork in demography)
            const disabilities = tickNewDisabilities?.[edu]?.[occ] ?? 0;

            if (deaths > 0) {
                distributeWorkforceRemovals(
                    relevantAgents,
                    planetId,
                    edu,
                    deaths,
                    /* trackDeaths */ true,
                    mortalityRateFn,
                );
            }

            if (disabilities > 0) {
                distributeWorkforceRemovals(
                    relevantAgents,
                    planetId,
                    edu,
                    disabilities,
                    /* trackDeaths */ false,
                    disabilityRateFn,
                );
            }

            // Retirements — remove from workforce (already moved to unableToWork in demography)
            const retirements = tickNewRetirements?.[edu]?.[occ] ?? 0;

            if (retirements > 0) {
                distributeWorkforceRemovals(
                    relevantAgents,
                    planetId,
                    edu,
                    retirements,
                    /* trackDeaths */ false,
                    perTickRetirement,
                );
            }
        }
    }
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
