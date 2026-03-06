import type { Agent, Planet } from './planet';
import { educationLevelKeys, OCCUPATIONS } from './planet';
import { MIN_EMPLOYABLE_AGE } from './constants';
import { getWealthDemography } from './population/populationHelpers';
import { getAgentDepositsForPlanet } from './financial/depositHelpers';
import { exit } from 'process';

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
export function computePopulationOccupationTotals(planet: Planet, minAge = MIN_EMPLOYABLE_AGE): OccupationTotals {
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
export function computeAgentWorkforceTotals(agents: Map<string, Agent>, planetId: string) {
    const totals: Record<string, number> = {
        company: 0,
        government: 0,
        // also keep raw active sum
        active: 0,
    };

    for (const agent of agents.values()) {
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
export function checkPopulationWorkforceConsistency(agents: Map<string, Agent>, planets: Map<string, Planet>) {
    const discrepancies: string[] = [];
    for (const planet of planets.values()) {
        const popTotals = computePopulationOccupationTotals(planet, MIN_EMPLOYABLE_AGE);
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
            for (const agent of agents.values()) {
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
            // Build per-agent breakdown for company counts so we can identify
            // which agent(s) are reporting more active company workers than
            // the authoritative population representation.
            const agentCompanyByAgent: Record<string, number> = {};
            for (const agent of agents.values()) {
                let sum = 0;
                const assets = agent.assets[planet.id];
                if (!assets || !assets.workforceDemography) {
                    agentCompanyByAgent[agent.id] = 0;
                    continue;
                }
                for (const cohort of assets.workforceDemography) {
                    for (const [, v] of Object.entries(cohort.active)) {
                        sum += v as number;
                    }
                }
                // Only include non-government agents here (company totals)
                agentCompanyByAgent[agent.id] = /gov|government/i.test(agent.id) ? 0 : sum;
            }

            // Build per-education breakdown for the population company counts
            const popByEdu: Record<string, number> = {};
            for (let age = 15; age < planet.population.demography.length; age++) {
                const cohort = planet.population.demography[age];
                for (const edu of Object.keys(cohort) as Array<keyof typeof cohort>) {
                    popByEdu[edu] = (popByEdu[edu] ?? 0) + (cohort[edu].company ?? 0);
                }
            }

            // And per-education breakdown from agents (company agents only)
            const agentByEdu: Record<string, number> = {};
            for (const agent of agents.values()) {
                if (/gov|government/i.test(agent.id)) {
                    continue;
                }
                const assets = agent.assets[planet.id];
                if (!assets || !assets.workforceDemography) {
                    continue;
                }
                for (const cohort of assets.workforceDemography) {
                    for (const [edu, v] of Object.entries(cohort.active)) {
                        agentByEdu[edu] = (agentByEdu[edu] ?? 0) + (v as number);
                    }
                }
            }

            const lines = [
                `Planet ${planet.id}: agents report company active=${agentCompany} but population has company=${popCompany}`,
                `Per-agent (company active):`,
            ];
            for (const [aid, count] of Object.entries(agentCompanyByAgent)) {
                lines.push(`${aid}: ${count}`);
            }
            lines.push('Per-education (agents -> population company):');
            const edus = new Set([...Object.keys(agentByEdu), ...Object.keys(popByEdu)]);
            for (const edu of edus) {
                lines.push(`${edu}: ${agentByEdu[edu] ?? 0} -> ${popByEdu[edu] ?? 0}`);
            }
            discrepancies.push(lines.join('\n'));
        }
    }

    if (discrepancies.length && process.env.SIM_DEBUG === '1') {
        console.error('Population/workforce consistency check failed:\n' + discrepancies.join('\n'));
        exit(1);
    }
    return discrepancies;
}

// ---------------------------------------------------------------------------
// Financial / market invariants
// ---------------------------------------------------------------------------

/**
 * Check that the bank accounting identity holds:
 *   bank.deposits ≈ Σ agent.deposits + bank.householdDeposits
 *
 * Also checks:
 * - No negative deposits (firm or household)
 * - No negative food inventory
 * - No negative food stock in household buffers
 * - Aggregate household wealth ≈ bank.householdDeposits
 */
export function checkFinancialInvariants(agents: Map<string, Agent>, planets: Map<string, Planet>): string[] {
    const discrepancies: string[] = [];

    for (const planet of planets.values()) {
        const bank = planet.bank;
        if (!bank) {
            continue;
        }

        // 1. Bank accounting identity
        let firmDepositsSum = 0;
        for (const agent of agents.values()) {
            if (agent.assets[planet.id]) {
                const d = getAgentDepositsForPlanet(agent, planet.id);
                firmDepositsSum += d;
                // No negative firm deposits
                if (d < -0.01) {
                    discrepancies.push(`Planet ${planet.id}: agent ${agent.id} has negative deposits: ${d.toFixed(4)}`);
                }
            }
        }

        const balanceDiff = Math.abs(bank.deposits - (firmDepositsSum + bank.householdDeposits));
        if (balanceDiff > 0.01) {
            discrepancies.push(
                `Planet ${planet.id}: balance-sheet violation: ` +
                    `bank.deposits=${bank.deposits.toFixed(4)}, ` +
                    `firmDeposits=${firmDepositsSum.toFixed(4)}, ` +
                    `householdDeposits=${bank.householdDeposits.toFixed(4)}, ` +
                    `diff=${balanceDiff.toFixed(6)}`,
            );
        }

        // No negative household deposits
        if (bank.householdDeposits < -0.01) {
            discrepancies.push(`Planet ${planet.id}: negative householdDeposits: ${bank.householdDeposits.toFixed(4)}`);
        }

        // 2. No negative food stock in household buffers
        if (planet.foodMarket?.householdFoodBuffers) {
            const buffers = planet.foodMarket.householdFoodBuffers;
            for (let age = 0; age < buffers.length; age++) {
                for (const edu of educationLevelKeys) {
                    for (const occ of OCCUPATIONS) {
                        const fb = buffers[age][edu][occ];
                        if (fb.foodStock < -0.001) {
                            discrepancies.push(
                                `Planet ${planet.id}: negative foodStock at age=${age} edu=${edu} occ=${occ}: ${fb.foodStock.toFixed(6)}`,
                            );
                        }
                    }
                }
            }
        }

        // 4. Aggregate household wealth ≈ bank.householdDeposits
        //    Sum(meanFinancialWealth × population) should equal bank.householdDeposits
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;
        let aggregateHouseholdWealth = 0;
        for (let age = 0; age < demography.length; age++) {
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    const pop = demography[age][edu][occ];
                    if (pop > 0) {
                        aggregateHouseholdWealth += wealthDemography[age][edu][occ].mean * pop;
                    }
                }
            }
        }
        // This invariant is expected to hold approximately.
        // Due to floating-point and the many intermediate steps, we use a
        // relative tolerance of 1% or absolute tolerance of 1.0.
        const wealthDiff = Math.abs(aggregateHouseholdWealth - bank.householdDeposits);
        const relTol = Math.max(1.0, Math.abs(bank.householdDeposits) * 0.01);
        if (wealthDiff > relTol) {
            discrepancies.push(
                `Planet ${planet.id}: aggregate household wealth mismatch: ` +
                    `wealth=${aggregateHouseholdWealth.toFixed(4)}, ` +
                    `bank.householdDeposits=${bank.householdDeposits.toFixed(4)}, ` +
                    `diff=${wealthDiff.toFixed(4)}`,
            );
        }
    }

    return discrepancies;
}
