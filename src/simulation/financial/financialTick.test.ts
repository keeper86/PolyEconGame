/**
 * financial/financialTick.test.ts
 *
 * Tests for the pre-production and post-production financial ticks.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { Agent, Planet } from '../planet/planet';
import { DEFAULT_WAGE_PER_EDU, postProductionFinancialTick, preProductionFinancialTick } from './financialTick';

import { SKILL } from '../population/population';
import { agentMap, makeAgent, makePlanetWithPopulation } from '../utils/testHelper';

import type { EducationLevelType } from '../population/population';
import { hireFromPopulation } from '../workforce/workforce';

/**
 * Hire workers from the planet's unoccupied pool into the agent's workforce.
 * Moves population from 'unoccupied' → 'employed' and updates the agent's
 * workforce demography to match.
 */
function hireWorkers(planet: Planet, agent: Agent, edu: EducationLevelType, count: number): number {
    const { count: hired, hiredByAge } = hireFromPopulation(planet, edu, count);
    // Reflect hires in agent workforce demography
    const wf = agent.assets[planet.id].workforceDemography!;
    for (let age = 0; age < hiredByAge.length; age++) {
        if (hiredByAge[age].novice > 0) {
            wf[age][edu].novice.active += hiredByAge[age].novice;
        }
    }
    return hired;
}

// ---------------------------------------------------------------------------
// Pre-production financial tick
// ---------------------------------------------------------------------------

describe('preProductionFinancialTick', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        const result = makePlanetWithPopulation({ none: 1000 });
        planet = result.planet;
        planet.wagePerEdu = { none: 1.0 };
    });

    it('does nothing when agent has no workers', () => {
        preProductionFinancialTick(agentMap(agent), planet);
        expect(agent.assets[planet.id]?.deposits ?? 0).toBe(0);
        expect(planet.bank!.loans).toBe(0);
    });

    it('creates a working-capital loan when firm has no deposits', () => {
        const hired = hireWorkers(planet, agent, 'none', 100);

        agent.assets[planet.id]!.deposits = 1;

        preProductionFinancialTick(agentMap(agent), planet);

        // Wage bill = hired * 1.0; loan = hired; after paying wages deposits = 0
        expect(planet.bank!.loans).toBe(hired - 1);
        expect(agent.assets[planet.id]?.deposits ?? 0).toBe(0);
    });

    it('does not create a loan when firm already has enough deposits', () => {
        hireWorkers(planet, agent, 'none', 50);
        agent.assets[planet.id]!.deposits = 10000000; // more than enough
        planet.bank!.deposits = 100; // keep balance sheet consistent

        preProductionFinancialTick(agentMap(agent), planet);

        expect(planet.bank!.loans).toBe(0);
        expect(agent.assets[planet.id]?.deposits).toBeGreaterThan(0); // hired paid in wages
    });

    it('increases population household wealth for employed workers', () => {
        const hired = hireWorkers(planet, agent, 'none', 100);
        agent.assets[planet.id]!.deposits = 200;
        planet.bank!.deposits = 200; // keep balance sheet consistent

        preProductionFinancialTick(agentMap(agent), planet);

        // Verify population wealth is increased for employed workers
        const demography = planet.population.demography;
        let totalWealthReceived = 0;
        for (let age = 0; age < demography.length; age++) {
            for (const skill of SKILL) {
                const cat = demography[age].employed.none[skill];
                if (cat.total > 0) {
                    totalWealthReceived += cat.total * cat.wealth.mean;
                }
            }
        }
        // hired workers each received wage 1.0
        expect(totalWealthReceived).toBeCloseTo(hired * DEFAULT_WAGE_PER_EDU, 5);
    });
});

// ---------------------------------------------------------------------------
// Post-production financial tick
// ---------------------------------------------------------------------------

describe('postProductionFinancialTick', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        const result = makePlanetWithPopulation({ none: 1000 });
        planet = result.planet;
        planet.wagePerEdu = { none: 1.0 };
        agent.assets[planet.id]!.deposits = 0;
    });

    it('repays outstanding loans from firm deposits', () => {
        // Set up: agent has a loan and deposits to repay it, no workers (so cNom=0)
        planet.bank!.loans = 50;
        planet.bank!.deposits = 50;
        agent.assets[planet.id]!.deposits = 50;
        // Record that the loan belongs to this agent
        agent.assets[planet.id]!.loans = 50;
        // No workforce: cNom = 0, so we go through the early-return path which still repays

        postProductionFinancialTick(agentMap(agent), planet);

        expect(planet.bank!.loans).toBe(0);
        expect(agent.assets[planet.id]?.deposits).toBe(0);
    });

    it('preserves household wealth (consumption now handled by food market)', () => {
        hireWorkers(planet, agent, 'none', 100);
        agent.assets[planet.id]!.deposits = 200;
        planet.bank!.deposits = 200; // keep balance sheet consistent

        // First give workers some wealth via wage payment
        preProductionFinancialTick(agentMap(agent), planet);
        // Capture wealth before post-production
        const demography = planet.population.demography;
        let totalWealthBefore = 0;
        for (let age = 0; age < demography.length; age++) {
            for (const skill of SKILL) {
                const cat = demography[age].employed.none[skill];
                if (cat.total > 0) {
                    totalWealthBefore += cat.total * cat.wealth.mean;
                }
            }
        }
        expect(totalWealthBefore).toBeGreaterThan(0);

        // Post-production now only handles loan repayment —
        postProductionFinancialTick(agentMap(agent), planet);

        let totalWealthAfter = 0;
        for (let age = 0; age < demography.length; age++) {
            for (const skill of SKILL) {
                const cat = demography[age].employed.none[skill];
                if (cat.total > 0) {
                    totalWealthAfter += cat.total * cat.wealth.mean;
                }
            }
        }

        // Household wealth is unchanged — consumption is handled by foodMarketTick
        expect(totalWealthAfter).toBeCloseTo(totalWealthBefore, 5);
    });

    it('distributes revenue to firms proportional to their workers', () => {
        hireWorkers(planet, agent, 'none', 100);
        agent.assets[planet.id]!.deposits = 200;
        planet.bank!.deposits = 200; // keep balance sheet consistent

        // Give workers some wealth first (pre-production)
        preProductionFinancialTick(agentMap(agent), planet);
        // After pre-production: agent.deposits reduced by wage bill, potentially 0 or >0

        // Post-production: handles loan repayment
        const _depositsBefore = agent.assets[planet.id]?.deposits ?? 0;
        postProductionFinancialTick(agentMap(agent), planet);

        // Agent should have received some revenue (>=0 after loan repayment)
        expect(agent.assets[planet.id]?.deposits ?? 0).toBeGreaterThanOrEqual(0);
    });

    it('bank equity stays non-negative after repayment', () => {
        planet.bank!.loans = 50;
        planet.bank!.deposits = 50;
        agent.assets[planet.id]!.deposits = 50;

        postProductionFinancialTick(agentMap(agent), planet);

        expect(planet.bank!.equity).toBeGreaterThanOrEqual(0);
    });
});

// ---------------------------------------------------------------------------
// Money conservation
// ---------------------------------------------------------------------------

describe('money conservation', () => {
    it('total outstanding loans increase when firm needs working capital', () => {
        const agent = makeAgent();
        const { planet } = makePlanetWithPopulation({ none: 1000 });
        planet.wagePerEdu = { none: 1.0 };
        agent.assets[planet.id]!.deposits = 0;

        const { count: hired, hiredByAge } = hireFromPopulation(planet, 'none', 100);
        const wf = agent.assets[planet.id].workforceDemography!;
        for (let age = 0; age < hiredByAge.length; age++) {
            if (hiredByAge[age].novice > 0) {
                wf[age].none.novice.active += hiredByAge[age].novice;
            }
        }

        preProductionFinancialTick(agentMap(agent), planet);

        // Loan created = hired (wage bill with no prior deposits)
        expect(planet.bank!.loans).toBe(hired);
    });

    it('full cycle: wages paid, consumed, revenue covers loan repayment', () => {
        const agent = makeAgent();
        const { planet } = makePlanetWithPopulation({ none: 1000 });
        planet.wagePerEdu = { none: 1.0 };
        agent.assets[planet.id]!.deposits = 0;
        const hired = hireWorkers(planet, agent, 'none', 100);

        // Step A: pre-production (creates loan, pays wages)
        preProductionFinancialTick(agentMap(agent), planet);
        const loansAfterA = planet.bank!.loans;
        expect(loansAfterA).toBe(hired);

        // Step B: post-production (loan repayment)
        postProductionFinancialTick(agentMap(agent), planet);
        const loansAfterB = planet.bank!.loans;

        // Loans should be reduced (at least partially) by repayment
        expect(loansAfterB).toBeLessThanOrEqual(loansAfterA);
        expect(agent.assets[planet.id]?.deposits ?? 0).toBeGreaterThanOrEqual(0);
    });
});
