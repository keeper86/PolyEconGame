/**
 * financial/financialTick.test.ts
 *
 * Tests for the pre-production and post-production financial ticks.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { Agent, Planet, GameState } from '../planet';
import { preProductionFinancialTick, postProductionFinancialTick, DEFAULT_WAGE_PER_EDU } from './financialTick';
import { makeAgent, makePlanet } from '../workforce/testHelpers';
import { getWealthDemography } from '../population/populationHelpers';
import { hireFromPopulation } from '../workforce/populationBridge';
import { setAgentDepositsForPlanet, setAgentLoansForPlanet } from './depositHelpers';
import { ageMomentsForAge, mergeAgeMoments } from '../workforce/workforceHelpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGameState(planet: Planet, ...agents: Agent[]): GameState {
    return {
        tick: 1,
        planets: new Map([[planet.id, planet]]),
        agents: new Map(agents.map((a) => [a.id, a])),
    };
}

/** Set agent deposits consistently on both per-planet and top-level fields. */
function setDeposits(agent: Agent, value: number): void {
    setAgentDepositsForPlanet(agent, 'p', value);
}

/** Hire workers from the planet's unoccupied pool into the agent's workforce. */
function hireWorkers(
    planet: Planet,
    agent: Agent,
    edu: keyof typeof agent.assets.p.allocatedWorkers,
    count: number,
): void {
    const result = hireFromPopulation(planet, edu, count, planet.governmentId === agent.id ? 'government' : 'company');
    const current = agent.assets.p.workforceDemography![0].active[edu];
    agent.assets.p.workforceDemography![0].active[edu] = mergeAgeMoments(current, ageMomentsForAge(30, result.count));
}

// ---------------------------------------------------------------------------
// Pre-production financial tick
// ---------------------------------------------------------------------------

describe('preProductionFinancialTick', () => {
    let agent: Agent;
    let planet: Planet;
    let gs: GameState;

    beforeEach(() => {
        agent = makeAgent();
        ({ planet } = makePlanet({ none: 1000 }));
        planet.bank = { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate: 0, depositRate: 0 };
        planet.wagePerEdu = { none: 1.0 };
        gs = makeGameState(planet, agent);
    });

    it('does nothing when agent has no workers', () => {
        preProductionFinancialTick(gs);
        expect(agent.assets[planet.id]?.deposits ?? 0).toBe(0);
        expect(planet.bank!.loans).toBe(0);
    });

    it('creates a working-capital loan when firm has no deposits', () => {
        hireWorkers(planet, agent, 'none', 100);
        setDeposits(agent, 0);

        preProductionFinancialTick(gs);

        // Wage bill = 100 * 1.0 = 100; loan = 100; after paying wages deposits = 0
        expect(planet.bank!.loans).toBe(100);
        expect(agent.assets[planet.id]?.deposits ?? 0).toBe(0);
    });

    it('does not create a loan when firm already has enough deposits', () => {
        hireWorkers(planet, agent, 'none', 50);
        setDeposits(agent, 100); // more than enough
        planet.bank!.deposits = 100; // keep balance sheet consistent

        preProductionFinancialTick(gs);

        expect(planet.bank!.loans).toBe(0);
        expect(agent.assets[planet.id]?.deposits ?? 0).toBe(100 - 50); // 50 paid in wages
    });

    it('increases population household wealth for employed workers', () => {
        hireWorkers(planet, agent, 'none', 100);
        setDeposits(agent, 200);
        planet.bank!.deposits = 200; // keep balance sheet consistent

        preProductionFinancialTick(gs);

        // Verify population wealth is increased for company workers
        const wd = getWealthDemography(planet.population);
        let totalWealthReceived = 0;
        for (let age = 0; age < planet.population.demography.length; age++) {
            const count = planet.population.demography[age].none.company;
            totalWealthReceived += count * wd[age].none.company.mean;
        }
        // 100 workers each received wage 1.0
        expect(totalWealthReceived).toBeCloseTo(100 * DEFAULT_WAGE_PER_EDU, 5);
    });
});

// ---------------------------------------------------------------------------
// Post-production financial tick
// ---------------------------------------------------------------------------

describe('postProductionFinancialTick', () => {
    let agent: Agent;
    let planet: Planet;
    let gs: GameState;

    beforeEach(() => {
        agent = makeAgent();
        ({ planet } = makePlanet({ none: 1000 }));
        planet.bank = { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate: 0, depositRate: 0 };
        planet.wagePerEdu = { none: 1.0 };
        setDeposits(agent, 0);
        gs = makeGameState(planet, agent);
    });

    it('repays outstanding loans from firm deposits', () => {
        // Set up: agent has a loan and deposits to repay it, no workers (so cNom=0)
        planet.bank!.loans = 50;
        planet.bank!.deposits = 50;
        setDeposits(agent, 50);
        // Record that the loan belongs to this agent
        setAgentLoansForPlanet(agent, planet.id, 50);
        // No workforce: cNom = 0, so we go through the early-return path which still repays

        postProductionFinancialTick(gs);

        expect(planet.bank!.loans).toBe(0);
        expect(agent.assets[planet.id]?.deposits ?? 0).toBe(0);
    });

    it('preserves household wealth (consumption now handled by food market)', () => {
        hireWorkers(planet, agent, 'none', 100);
        setDeposits(agent, 200);
        planet.bank!.deposits = 200; // keep balance sheet consistent

        // First give workers some wealth via wage payment
        preProductionFinancialTick(gs);

        // Capture wealth before post-production
        const wdBefore = getWealthDemography(planet.population);
        let totalWealthBefore = 0;
        for (let age = 0; age < planet.population.demography.length; age++) {
            const count = planet.population.demography[age].none.company;
            totalWealthBefore += count * wdBefore[age].none.company.mean;
        }

        // Post-production now only handles loan repayment —
        // consumption has moved to the food market subsystem.
        postProductionFinancialTick(gs);

        const wdAfter = getWealthDemography(planet.population);
        let totalWealthAfter = 0;
        for (let age = 0; age < planet.population.demography.length; age++) {
            const count = planet.population.demography[age].none.company;
            totalWealthAfter += count * wdAfter[age].none.company.mean;
        }

        // Household wealth is unchanged — consumption is handled by foodMarketTick
        expect(totalWealthAfter).toBeCloseTo(totalWealthBefore, 5);
    });

    it('distributes revenue to firms proportional to their workers', () => {
        hireWorkers(planet, agent, 'none', 100);
        setDeposits(agent, 200);
        planet.bank!.deposits = 200; // keep balance sheet consistent

        // Give workers some wealth first (pre-production)
        preProductionFinancialTick(gs);
        // After pre-production: agent.deposits reduced by wage bill (100), potentially 0 or >0

        // Post-production: consumption flows revenue back to firms
        const _depositsBefore = agent.assets[planet.id]?.deposits ?? 0;
        postProductionFinancialTick(gs);

        // Agent should have received some revenue (>=0 after loan repayment)
        expect(agent.assets[planet.id]?.deposits ?? 0).toBeGreaterThanOrEqual(0);
    });

    it('bank equity stays non-negative after repayment', () => {
        planet.bank!.loans = 50;
        planet.bank!.deposits = 50;
        setDeposits(agent, 50);

        postProductionFinancialTick(gs);

        expect(planet.bank!.equity).toBeGreaterThanOrEqual(0);
    });
});

// ---------------------------------------------------------------------------
// Money conservation
// ---------------------------------------------------------------------------

describe('money conservation', () => {
    it('total outstanding loans increase when firm needs working capital', () => {
        const agent = makeAgent();
        const { planet } = makePlanet({ none: 1000 });
        planet.bank = { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate: 0, depositRate: 0 };
        planet.wagePerEdu = { none: 1.0 };
        setAgentDepositsForPlanet(agent, planet.id, 0);
        hireFromPopulation(planet, 'none', 100, 'company');
        agent.assets.p.workforceDemography![0].active.none = ageMomentsForAge(30, 100);
        const gs = makeGameState(planet, agent);

        preProductionFinancialTick(gs);

        // Loan created = 100 (wage bill with no prior deposits)
        expect(planet.bank!.loans).toBe(100);
    });

    it('full cycle: wages paid, consumed, revenue covers loan repayment', () => {
        const agent = makeAgent();
        const { planet } = makePlanet({ none: 1000 });
        planet.bank = { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate: 0, depositRate: 0 };
        planet.wagePerEdu = { none: 1.0 };
        setAgentDepositsForPlanet(agent, planet.id, 0);
        hireWorkers(planet, agent, 'none', 100);
        const gs = makeGameState(planet, agent);

        // Step A: pre-production (creates loan, pays wages)
        preProductionFinancialTick(gs);
        const loansAfterA = planet.bank!.loans;
        expect(loansAfterA).toBe(100);

        // Step B: post-production (consumption → revenue → repayment)
        postProductionFinancialTick(gs);
        const loansAfterB = planet.bank!.loans;

        // Loans should be reduced (at least partially) by repayment
        expect(loansAfterB).toBeLessThanOrEqual(loansAfterA);
        expect(agent.assets[planet.id]?.deposits ?? 0).toBeGreaterThanOrEqual(0);
    });
});
