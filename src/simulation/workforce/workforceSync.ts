/**
 * workforce/workforceSync.ts
 *
 * Synchronisation between the authoritative population demography and
 * agents' WorkforceDemography after mortality, disability, and retirement
 * transitions.
 *
 * Both structures are age-resolved arrays, so sync is trivially exact:
 * for each (age, edu) cell with deaths/disabilities/retirements recorded
 * in the PopulationCategory, we subtract the corresponding count from
 * agents' workforce age slots.  No Gaussian approximation, no drift.
 *
 * The population pipeline writes per-cell event counts into
 * `PopulationCategory.deaths.countThisTick`, `.disabilities.countThisTick`,
 * and `.retirements.countThisTick`.  This module reads those fields and
 * distributes the removals across agents proportionally.
 */

import { distributeProportionally } from '../utils/distributeProportionally';
import type { Agent, Environment, PerEducation } from '../planet/planet';
import {
    type EducationLevelType,
    type DemographicEventType,
    type Population,
    type PopulationCategory,
    SKILL,
    forEachPopulationCohortWithOccupation,
} from '../population/population';
import { educationLevelKeys } from '../population/education';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Total workers (active + entire departing pipeline) at a given age
 * for a **specific education level**, summed across skills, for one agent.
 *
 * This must be edu-specific so that `distributeAgeCellRemovals` weights
 * agent shares by their actual headcount in the affected education level,
 * not by their total headcount across all education levels.  Using an
 * all-edu total would mis-allocate removals to agents that have many
 * workers in *other* education levels but few/none in the target level,
 * causing silent removal shortfalls and population↔workforce drift.
 */
function totalWorkersAtAgeForEdu(agent: Agent, planetId: string, age: number, edu: EducationLevelType): number {
    const wf = agent.assets[planetId]?.workforceDemography;
    if (!wf || !wf[age]) {
        return 0;
    }
    let total = 0;
    for (const skill of SKILL) {
        const cell = wf[age][edu][skill];
        total += cell.active;
        total += cell.departing.reduce((s: number, d: number) => s + d, 0);
    }
    return total;
}

/**
 * Initialise a zero-filled per-education record for event tracking on
 * agent assets.
 */
function initEduRecord(): PerEducation {
    const rec = {} as PerEducation;
    for (const e of educationLevelKeys) {
        rec[e] = 0;
    }
    return rec;
}

/**
 * Track a demographic event on the agent's per-planet assets so the UI
 * can display "deaths this month" / "disabilities this month" etc.
 */
function trackEventOnAgent(
    agent: Agent,
    planetId: string,
    edu: EducationLevelType,
    count: number,
    eventType: DemographicEventType,
): void {
    const assets = agent.assets[planetId];
    if (!assets) {
        return;
    }
    if (eventType === 'death') {
        if (!assets.deaths) {
            assets.deaths = { thisMonth: initEduRecord(), prevMonth: initEduRecord() };
        }
        assets.deaths.thisMonth[edu] += count;
    } else if (eventType === 'disability') {
        if (!assets.disabilities) {
            assets.disabilities = { thisMonth: initEduRecord(), prevMonth: initEduRecord() };
        }
        assets.disabilities.thisMonth[edu] += count;
    } else if (eventType === 'retirement') {
        if (!assets.retirements) {
            assets.retirements = { thisMonth: initEduRecord(), prevMonth: initEduRecord() };
        }
        assets.retirements.thisMonth[edu] += count;
    }
}

/**
 * Remove `count` workers at a specific (age, edu) from an agent's
 * workforce, distributing removals across skill levels, then across
 * active and departing pools proportionally to their sizes.
 */
function removeWorkersAtAge(
    agent: Agent,
    planetId: string,
    edu: EducationLevelType,
    age: number,
    count: number,
    eventType: DemographicEventType,
): void {
    const assets = agent.assets[planetId];
    if (!assets?.workforceDemography) {
        return;
    }

    const wf = assets.workforceDemography;
    if (!wf[age]) {
        return;
    }

    trackEventOnAgent(agent, planetId, edu, count, eventType);

    const cohort = wf[age]; // CohortByOccupation<WorkforceCategory>  ->  [edu][skill]

    // Collect pool weights across all skills: active + each departing slot
    const pools: number[] = [];

    // Pool 0: sum of active across all skills for this edu
    let totalActive = 0;
    for (const skill of SKILL) {
        totalActive += cohort[edu][skill].active;
    }
    pools.push(totalActive);

    // Pools 1..N: departing slots (merged across skills per month index)
    const depLengths = SKILL.map((s) => cohort[edu][s].departing.length);
    const maxDepLength = Math.max(0, ...depLengths);
    for (let m = 0; m < maxDepLength; m++) {
        let slotTotal = 0;
        for (const skill of SKILL) {
            slotTotal += cohort[edu][skill].departing[m] ?? 0;
        }
        pools.push(slotTotal);
    }

    const totalAvailable = pools.reduce((s, v) => s + v, 0);
    if (totalAvailable <= 0) {
        return;
    }

    const toRemove = Math.min(count, totalAvailable);
    const allocated = distributeProportionally(toRemove, pools);

    // Apply removals to the active pool, distributed across skills proportionally
    if (allocated[0] > 0) {
        const skillWeights = SKILL.map((s) => cohort[edu][s].active);
        const perSkill = distributeProportionally(allocated[0], skillWeights);
        for (let si = 0; si < SKILL.length; si++) {
            cohort[edu][SKILL[si]].active = Math.max(0, cohort[edu][SKILL[si]].active - perSkill[si]);
        }
    }

    // Apply removals to departing slots, distributed across skills proportionally
    for (let m = 0; m < maxDepLength; m++) {
        const remove = allocated[m + 1] ?? 0;
        if (remove <= 0) {
            continue;
        }
        const skillWeights = SKILL.map((s) => cohort[edu][s].departing[m] ?? 0);
        const perSkill = distributeProportionally(remove, skillWeights);
        for (let si = 0; si < SKILL.length; si++) {
            const skill = SKILL[si];
            const wc = cohort[edu][skill];
            wc.departing[m] = Math.max(0, wc.departing[m] - perSkill[si]);
            // Clamp departingFired so it never exceeds departing
            if (wc.departingFired[m] > wc.departing[m]) {
                wc.departingFired[m] = wc.departing[m];
            }
        }
    }
}

/**
 * Distribute `count` removals for a single (age, edu) cell across
 * agents, proportionally to each agent's workforce at that exact age.
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

    const agentEntries: { agent: Agent; headcount: number }[] = [];
    let totalHeadcount = 0;

    for (const agent of agents) {
        const headcount = totalWorkersAtAgeForEdu(agent, planetId, age, edu);
        if (headcount > 0) {
            agentEntries.push({ agent, headcount });
            totalHeadcount += headcount;
        }
    }

    if (totalHeadcount === 0) {
        return;
    }

    const weights = agentEntries.map((a) => a.headcount);
    const agentRemovals = distributeProportionally(count, weights);

    for (let i = 0; i < agentEntries.length; i++) {
        const toRemove = agentRemovals[i] ?? 0;
        if (toRemove > 0) {
            removeWorkersAtAge(agentEntries[i].agent, planetId, edu, age, toRemove, eventType);
        }
    }
}

/**
 * Read the countThisTick value for a given DemographicEventType from a
 * PopulationCategory cell.
 */
function eventCount(cat: PopulationCategory, eventType: DemographicEventType): number {
    switch (eventType) {
        case 'death':
            return cat.deaths.countThisTick;
        case 'disability':
            return cat.disabilities.countThisTick;
        case 'retirement':
            return cat.retirements.countThisTick;
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** The event types that affect the workforce (employed -> removed). */
const WORKFORCE_EVENT_TYPES: DemographicEventType[] = ['death', 'disability', 'retirement'];

/**
 * syncWorkforceWithPopulation - apply deaths, new disabilities, and
 * retirements computed by the population pipeline to agents'
 * WorkforceDemography so both representations remain consistent.
 *
 * Reads per-cell event counts directly from `PopulationCategory.deaths`,
 * `.disabilities`, and `.retirements` (`.countThisTick`).  Only the
 * `'employed'` occupation is relevant for workforce sync.
 *
 * With age-resolved workforce cohorts, removals are exact per-age
 * subtractions - zero drift.
 */
export function syncWorkforceWithPopulation(
    agents: Map<string, Agent>,
    planetId: string,
    population: Population,
    _environment: Environment,
): void {
    const relevantAgents = Array.from(agents.values()).filter((a) => a.assets[planetId]);
    if (relevantAgents.length === 0) {
        return;
    }

    const { demography } = population;

    for (let age = 0; age < demography.length; age++) {
        const ageCohort = demography[age];
        if (!ageCohort) {
            continue;
        }

        // We only care about the 'employed' occupation for workforce sync.
        forEachPopulationCohortWithOccupation(ageCohort, (cat, occ, edu, _skill) => {
            if (occ !== 'employed') {
                return;
            }

            for (const evt of WORKFORCE_EVENT_TYPES) {
                const count = eventCount(cat, evt);
                if (count > 0) {
                    distributeAgeCellRemovals(relevantAgents, planetId, edu, age, count, evt);
                }
            }
        });
    }
}
