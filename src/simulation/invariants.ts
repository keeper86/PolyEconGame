import type { Agent, Planet } from './planet';

type OccupationTotals = {
    company: number;
    government: number;
    education: number;
    unoccupied: number;
    unableToWork: number;
    totalOver14: number;
};

/**
 * Compute population occupation totals for ages > MIN_AGE (default 14)
 */
export function computePopulationOccupationTotals(planet: Planet, minAge = 15): OccupationTotals {
    const totals: OccupationTotals = {
        company: 0,
        government: 0,
        education: 0,
        unoccupied: 0,
        unableToWork: 0,
        totalOver14: 0,
    };

    for (let age = minAge; age < planet.population.demography.length; age++) {
        const cohort = planet.population.demography[age];
        for (const edu of Object.keys(cohort) as Array<keyof typeof cohort>) {
            const ed = edu as keyof typeof cohort;
            totals.company += cohort[ed].company ?? 0;
            totals.government += cohort[ed].government ?? 0;
            totals.education += cohort[ed].education ?? 0;
            totals.unoccupied += cohort[ed].unoccupied ?? 0;
            totals.unableToWork += cohort[ed].unableToWork ?? 0;
            totals.totalOver14 += Object.values(cohort[ed]).reduce((s, v) => s + v, 0);
        }
    }
    return totals;
}

/**
 * Compute active workforce across all agents for a planet (active workers only).
 */
export function computeAgentWorkforceTotals(agents: Agent[], planetId: string) {
    const totals: Record<string, number> = {
        company: 0,
        government: 0,
        // also keep raw active sum
        active: 0,
    };

    for (const agent of agents) {
        const assets = agent.assets[planetId];
        if (!assets || !assets.workforceDemography) {
            continue;
        }
        for (const cohort of assets.workforceDemography) {
            for (const [, count] of Object.entries(cohort.active)) {
                totals.active += count as number;
            }
        }

        // Simple heuristic: if agent.id contains 'gov' or 'government' treat all actives as government
        const isGov = /gov|government/i.test(agent.id);
        if (assets && assets.workforceDemography) {
            let sum = 0;
            for (const cohort of assets.workforceDemography) {
                for (const v of Object.values(cohort.active)) {
                    sum += v;
                }
            }
            if (isGov) {
                totals.government += sum;
            } else {
                totals.company += sum;
            }
        }
    }
    return totals;
}

/**
 * Run basic consistency checks between population cohorts and agent workforces.
 * When SIM_DEBUG=1 is set, this will throw an Error with details on the first
 * mismatch discovered. Otherwise it returns an array of discrepancy messages.
 */
export function checkPopulationWorkforceConsistency(agents: Agent[], planets: Planet[]) {
    const discrepancies: string[] = [];
    for (const planet of planets) {
        const popTotals = computePopulationOccupationTotals(planet, 15);
        const agentTotals = computeAgentWorkforceTotals(agents, planet.id);

        // Provide a detailed breakdown when discrepancies occur
        const popGov = popTotals.government;
        const agentGov = agentTotals.government;
        if (agentGov > popGov) {
            // Build per-education breakdowns for the planet population
            const popByEdu: Record<string, number> = {};
            for (let age = 15; age < planet.population.demography.length; age++) {
                const cohort = planet.population.demography[age];
                for (const edu of Object.keys(cohort) as Array<keyof typeof cohort>) {
                    popByEdu[edu] = (popByEdu[edu] ?? 0) + (cohort[edu].government ?? 0);
                }
            }

            // Build per-education breakdown from agent workforce (government agent only)
            const agentGovByEdu: Record<string, number> = {};
            for (const agent of agents) {
                if (!/gov|government/i.test(agent.id)) {
                    continue;
                }
                const assets = agent.assets[planet.id];
                if (!assets || !assets.workforceDemography) {
                    continue;
                }
                for (const cohort of assets.workforceDemography) {
                    for (const [edu, v] of Object.entries(cohort.active)) {
                        agentGovByEdu[edu] = (agentGovByEdu[edu] ?? 0) + (v as number);
                    }
                }
            }

            const lines = [
                `Planet ${planet.id}: agents report government active=${agentGov} but population has government=${popGov}`,
                `Per-education (agent gov -> population gov):`,
            ];
            const edus = new Set([...Object.keys(agentGovByEdu), ...Object.keys(popByEdu)]);
            for (const edu of edus) {
                lines.push(`${edu}: ${agentGovByEdu[edu] ?? 0} -> ${popByEdu[edu] ?? 0}`);
            }
            discrepancies.push(lines.join('\n'));
        }

        const popCompany = popTotals.company;
        const agentCompany = agentTotals.company;
        if (agentCompany > popCompany) {
            discrepancies.push(
                `Planet ${planet.id}: agents report company active=${agentCompany} but population has company=${popCompany}`,
            );
        }
    }

    if (discrepancies.length && process.env.SIM_DEBUG === '1') {
        throw new Error('Population/workforce consistency check failed:\n' + discrepancies.join('\n'));
    }
    return discrepancies;
}
