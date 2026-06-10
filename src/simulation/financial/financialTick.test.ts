import { beforeEach, describe, expect, it } from 'vitest';

import type { Agent, AgentPlanetAssets, Planet } from '../planet/planet';
import { TICKS_PER_MONTH } from '../constants';
import { automaticLoanRepayment, maturesLoans, preProductionFinancialTick } from './financialTick';

import { agentMap, makeAgent, makePlanetWithPopulation, makeProductionFacility } from '../utils/testHelper';
import { makeLoan, totalOutstandingLoans } from './loanTypes';
import type { EducationLevelType } from '../population/education';
import { ironOreResourceType } from '../planet/resources';
import { coalDepositResourceType } from '../planet/landBoundResources';

function addWorker(
    assets: AgentPlanetAssets,
    age: number,
    edu: EducationLevelType,
    skill: string,
    count: number,
): void {
    const wf = assets.workforceDemography!;
    const s = skill as 'novice' | 'professional' | 'expert';
    wf[age][edu][s].active += count;
}

function addEmployed(planet: Planet, age: number, edu: EducationLevelType, skill: string, count: number): void {
    const s = skill as 'novice' | 'professional' | 'expert';
    planet.population.demography[age].employed[edu][s].total += count;
}

function totalFirmDeposits(agents: Map<string, Agent>, planetId: string): number {
    let total = 0;
    for (const agent of agents.values()) {
        total += agent.assets[planetId]?.deposits ?? 0;
    }
    return total;
}

describe('preProductionFinancialTick', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        const result = makePlanetWithPopulation({ none: 1000 });
        planet = result.planet;
        planet.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
        agent.assets[planet.id]!.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
    });

    it('does nothing when agent has no workers', () => {
        preProductionFinancialTick(agentMap(agent), planet);
        expect(agent.assets[planet.id]?.deposits ?? 0).toBe(0);
        expect(planet.bank!.loans).toBe(0);
    });

    it('deducts wages from deposits when agent has sufficient funds', () => {
        const assets = agent.assets[planet.id]!;
        assets.deposits = 10_000;

        addWorker(assets, 25, 'none', 'novice', 10);

        preProductionFinancialTick(agentMap(agent), planet);

        expect(assets.deposits).toBe(9_990);
        expect(planet.bank!.loans).toBe(0);
    });

    it('grants a wage coverage loan when deposits are insufficient for wages', () => {
        const assets = agent.assets[planet.id]!;
        assets.deposits = 1_000;

        addWorker(assets, 25, 'none', 'novice', 2000);

        preProductionFinancialTick(agentMap(agent), planet);

        expect(planet.bank!.loans).toBeCloseTo(359_000, -1);
        expect(assets.deposits).toBeCloseTo(358_000, -1);
        expect(assets.activeLoans.length).toBeGreaterThanOrEqual(1);
        expect(assets.activeLoans[0]!.type).toBe('wageCoverage');
    });

    it('does not grant wage coverage loan when deposits exactly cover wages', () => {
        const assets = agent.assets[planet.id]!;
        assets.deposits = 500;

        addWorker(assets, 25, 'none', 'novice', 500);

        preProductionFinancialTick(agentMap(agent), planet);

        expect(planet.bank!.loans).toBe(0);
        expect(assets.deposits).toBe(0);
    });

    it('credits wage income to employed population categories', () => {
        const assets = agent.assets[planet.id]!;
        assets.deposits = 10_000;

        addWorker(assets, 30, 'none', 'novice', 1);

        addEmployed(planet, 30, 'none', 'novice', 1);

        const initialHouseholdDeposits = planet.bank!.householdDeposits;

        preProductionFinancialTick(agentMap(agent), planet);

        expect(planet.bank!.householdDeposits).toBeCloseTo(initialHouseholdDeposits + 1, -6);
    });

    it('credits wages proportionally when agent workers are fewer than population in cell', () => {
        const assets = agent.assets[planet.id]!;
        assets.deposits = 10_000;

        addWorker(assets, 30, 'none', 'novice', 3);

        addEmployed(planet, 30, 'none', 'novice', 10);

        const initialHouseholdDeposits = planet.bank!.householdDeposits;
        const initialPopWealth = planet.population.demography[30].employed.none.novice.wealth.mean;

        preProductionFinancialTick(agentMap(agent), planet);

        expect(planet.bank!.householdDeposits).toBeCloseTo(initialHouseholdDeposits + 3, -6);
        expect(planet.population.demography[30].employed.none.novice.wealth.mean).toBeCloseTo(
            initialPopWealth + 0.3,
            -6,
        );
    });

    it('grants buffer coverage loan when automated agent needs working capital for input buffer', () => {
        const assets = agent.assets[planet.id]!;
        assets.deposits = 1_000;

        addWorker(assets, 25, 'none', 'novice', 10);

        const facility = makeProductionFacility();
        facility.needs = [
            {
                resource: ironOreResourceType,
                quantity: 5,
            },
        ];
        facility.scale = 2;
        assets.productionFacilities = [facility];

        planet.marketPrices.iron_ore = 10;

        preProductionFinancialTick(agentMap(agent), planet);

        const bufferLoan = assets.activeLoans.find((l) => l.type === 'bufferCoverage');
        expect(bufferLoan).toBeDefined();
        expect(bufferLoan!.remainingPrincipal).toBeCloseTo(59_010, -1);
    });

    it('does not grant buffer loan when agent is not automated', () => {
        agent.automated = false;
        const assets = agent.assets[planet.id]!;
        assets.deposits = 1_000;

        addWorker(assets, 25, 'none', 'novice', 10);

        const facility = makeProductionFacility();
        facility.needs = [
            {
                resource: ironOreResourceType,
                quantity: 5,
            },
        ];
        facility.scale = 2;
        assets.productionFacilities = [facility];
        planet.marketPrices.iron_ore = 10;

        preProductionFinancialTick(agentMap(agent), planet);

        const bufferLoan = assets.activeLoans.find((l) => l.type === 'bufferCoverage');
        expect(bufferLoan).toBeUndefined();
    });

    it('excludes landBoundResource needs from buffer cost estimation', () => {
        const assets = agent.assets[planet.id]!;
        assets.deposits = 1_000;

        addWorker(assets, 25, 'none', 'novice', 10);

        const facility = makeProductionFacility();
        facility.needs = [
            {
                resource: coalDepositResourceType,
                quantity: 100,
            },

            {
                resource: ironOreResourceType,
                quantity: 1,
            },
        ];
        facility.scale = 1;
        assets.productionFacilities = [facility];
        planet.marketPrices.iron_ore = 10;
        planet.marketPrices['Coal Deposit'] = 50;

        preProductionFinancialTick(agentMap(agent), planet);

        const bufferLoan = assets.activeLoans.find((l) => l.type === 'bufferCoverage');
        expect(bufferLoan).toBeUndefined();
    });

    it('computes weighted average planet wagePerEdu across all agents', () => {
        const agent2 = makeAgent('agent-2', planet.id, 'Agent 2');
        agent2.assets[planet.id]!.wagePerEdu = { none: 2.0, primary: 2.0, secondary: 2.0, tertiary: 2.0 };

        addWorker(agent.assets[planet.id]!, 25, 'none', 'novice', 1);
        agent.assets[planet.id]!.deposits = 1_000;

        addWorker(agent2.assets[planet.id]!, 25, 'none', 'novice', 3);
        agent2.assets[planet.id]!.deposits = 1_000;

        preProductionFinancialTick(agentMap(agent, agent2), planet);

        expect(planet.wagePerEdu.none).toBeCloseTo(1.75, -6);
    });

    it('skips agents without assets on the planet', () => {
        const assets = agent.assets[planet.id]!;
        assets.deposits = 1_000;
        addWorker(assets, 25, 'none', 'novice', 10);

        const agent2 = makeAgent('agent-2', 'other-planet', 'Agent 2');

        preProductionFinancialTick(agentMap(agent, agent2), planet);

        expect(planet.bank!.loans).toBe(0);
    });

    it('accumulates wages and worker ticks in monthAcc', () => {
        const assets = agent.assets[planet.id]!;
        assets.deposits = 10_000;

        addWorker(assets, 25, 'none', 'novice', 5);
        addWorker(assets, 25, 'primary', 'novice', 3);

        preProductionFinancialTick(agentMap(agent), planet);

        expect(assets.monthAcc.wages).toBe(8);

        expect(assets.monthAcc.totalWorkersTicks).toBe(8);
    });

    it('updates bank equity at the end', () => {
        const assets = agent.assets[planet.id]!;
        assets.deposits = 10_000;
        addWorker(assets, 25, 'none', 'novice', 10);
        planet.bank!.equity = 0;

        preProductionFinancialTick(agentMap(agent), planet);

        expect(planet.bank!.equity).toBe(planet.bank!.deposits - planet.bank!.loans);
    });
});

describe('automaticLoanRepayment', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        const result = makePlanetWithPopulation({ none: 1000 });
        planet = result.planet;
        planet.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
        agent.assets[planet.id]!.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
        agent.assets[planet.id]!.deposits = 0;
    });

    it('does nothing when bank has no loans', () => {
        planet.bank!.loans = 0;
        agent.assets[planet.id]!.deposits = 10_000;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];
        agent.assets[planet.id]!.lastMonthAcc.wages = 1;

        automaticLoanRepayment(agentMap(agent), planet);

        expect(planet.bank!.loans).toBe(0);
        expect(agent.assets[planet.id]!.deposits).toBe(10_000);
    });

    it('repays outstanding loans from excess firm deposits', () => {
        planet.bank!.loans = 50;
        planet.bank!.deposits = 10_050;
        agent.assets[planet.id]!.deposits = 10_050;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];
        agent.assets[planet.id]!.lastMonthAcc.wages = 1;

        automaticLoanRepayment(agentMap(agent), planet);

        expect(planet.bank!.loans).toBe(0);
        expect(agent.assets[planet.id]?.deposits).toBe(10_000);
    });

    it('bank equity stays non-negative after repayment', () => {
        planet.bank!.loans = 50;
        planet.bank!.deposits = 10_050;
        agent.assets[planet.id]!.deposits = 10_050;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];
        agent.assets[planet.id]!.lastMonthAcc.wages = 1;

        automaticLoanRepayment(agentMap(agent), planet);

        expect(planet.bank!.equity).toBeGreaterThanOrEqual(0);
    });

    it('skips non-automated agents', () => {
        agent.automated = false;
        planet.bank!.loans = 50;
        planet.bank!.deposits = 10_050;
        agent.assets[planet.id]!.deposits = 10_050;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];
        agent.assets[planet.id]!.lastMonthAcc.wages = 1;

        automaticLoanRepayment(agentMap(agent), planet);

        expect(planet.bank!.loans).toBe(50);
        expect(agent.assets[planet.id]!.deposits).toBe(10_050);
    });

    it('skips arbitrage_trader agents', () => {
        agent.agentRole = 'arbitrage_trader';
        planet.bank!.loans = 50;
        planet.bank!.deposits = 10_050;
        agent.assets[planet.id]!.deposits = 10_050;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];
        agent.assets[planet.id]!.lastMonthAcc.wages = 1;

        automaticLoanRepayment(agentMap(agent), planet);

        expect(planet.bank!.loans).toBe(50);
    });

    it('skips shipbuilder agents', () => {
        agent.agentRole = 'shipbuilder';
        planet.bank!.loans = 50;
        planet.bank!.deposits = 10_050;
        agent.assets[planet.id]!.deposits = 10_050;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];
        agent.assets[planet.id]!.lastMonthAcc.wages = 1;

        automaticLoanRepayment(agentMap(agent), planet);

        expect(planet.bank!.loans).toBe(50);
    });

    it('does not repay when excess deposits (above retained threshold) are zero', () => {
        planet.bank!.loans = 50;
        planet.bank!.deposits = 1200;
        agent.assets[planet.id]!.deposits = 1200;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];
        agent.assets[planet.id]!.lastMonthAcc.wages = 100;

        automaticLoanRepayment(agentMap(agent), planet);

        expect(planet.bank!.loans).toBe(50);
        expect(agent.assets[planet.id]!.deposits).toBe(1200);
    });

    it('repays only excess above retained threshold', () => {
        planet.bank!.loans = 50;
        planet.bank!.deposits = 1300;
        agent.assets[planet.id]!.deposits = 1300;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];
        agent.assets[planet.id]!.lastMonthAcc.wages = 100;

        automaticLoanRepayment(agentMap(agent), planet);

        expect(planet.bank!.loans).toBe(0);
        expect(agent.assets[planet.id]!.deposits).toBe(1250);
    });

    it('repays only up to the outstanding loan amount', () => {
        planet.bank!.loans = 50;
        planet.bank!.deposits = 2000;
        agent.assets[planet.id]!.deposits = 2000;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];
        agent.assets[planet.id]!.lastMonthAcc.wages = 1;

        automaticLoanRepayment(agentMap(agent), planet);

        expect(planet.bank!.loans).toBe(0);
        expect(agent.assets[planet.id]!.deposits).toBe(1950);
    });

    it('repays oldest loans first', () => {
        planet.bank!.loans = 80;
        planet.bank!.deposits = 2030;
        agent.assets[planet.id]!.deposits = 2030;

        agent.assets[planet.id]!.activeLoans = [
            makeLoan('wageCoverage', 50, 0, 10, 361, true),
            makeLoan('wageCoverage', 30, 0, 1, 361, true),
        ];
        agent.assets[planet.id]!.lastMonthAcc.wages = 1;

        automaticLoanRepayment(agentMap(agent), planet);

        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(0);
        expect(agent.assets[planet.id]!.deposits).toBe(1950);
        expect(planet.bank!.loans).toBe(0);
    });

    it('throws if bank loans are less than agent loan total (invariant violation)', () => {
        planet.bank!.loans = 30;
        planet.bank!.deposits = 10_030;
        agent.assets[planet.id]!.deposits = 10_030;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];
        agent.assets[planet.id]!.lastMonthAcc.wages = 1;

        expect(() => automaticLoanRepayment(agentMap(agent), planet)).toThrow(/Bank loan balance.*is less than agent/);
    });

    it('handles multiple agents: only automated ones repay', () => {
        const agent2 = makeAgent('agent-2', planet.id, 'Agent 2');
        agent2.automated = false;
        agent2.assets[planet.id]!.deposits = 10_050;
        agent2.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];
        agent2.assets[planet.id]!.lastMonthAcc.wages = 1;

        agent.assets[planet.id]!.deposits = 10_050;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];
        agent.assets[planet.id]!.lastMonthAcc.wages = 1;

        planet.bank!.loans = 100;
        planet.bank!.deposits = 20_100;

        automaticLoanRepayment(agentMap(agent, agent2), planet);

        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(0);
        expect(totalOutstandingLoans(agent2.assets[planet.id]!.activeLoans)).toBe(50);
        expect(planet.bank!.loans).toBe(50);
    });

    it('skips agents without assets on this planet', () => {
        planet.bank!.loans = 50;
        planet.bank!.deposits = 10_050;

        agent.assets[planet.id]!.deposits = 10_050;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];
        agent.assets[planet.id]!.lastMonthAcc.wages = 1;

        const agent2 = makeAgent('agent-2', 'other-planet', 'No assets here');

        automaticLoanRepayment(agentMap(agent, agent2), planet);

        expect(planet.bank!.loans).toBe(0);
    });

    it('updates bank equity at the end', () => {
        planet.bank!.loans = 50;
        planet.bank!.deposits = 10_050;
        agent.assets[planet.id]!.deposits = 10_050;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];
        agent.assets[planet.id]!.lastMonthAcc.wages = 1;
        planet.bank!.equity = 0;

        automaticLoanRepayment(agentMap(agent), planet);

        expect(planet.bank!.equity).toBe(planet.bank!.deposits - planet.bank!.loans);
    });
});

describe('enforceLoanMaturities', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        const result = makePlanetWithPopulation({ none: 1000 });
        planet = result.planet;
        planet.bank!.loanRate = 0.05 / 360;
    });

    it('does nothing when there are no matured loans', () => {
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0.05, 1, 361, true)];
        agent.assets[planet.id]!.deposits = 1000;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 1000;

        maturesLoans(agentMap(agent), planet, 100);

        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(100);
        expect(planet.bank!.loans).toBe(100);
    });

    it('repays matured loan from deposits when sufficient funds are available', () => {
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0.05, 1, 50, true)];
        agent.assets[planet.id]!.deposits = 1000;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 1000;

        maturesLoans(agentMap(agent), planet, 100);

        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(0);
        expect(agent.assets[planet.id]!.deposits).toBe(900);
        expect(planet.bank!.loans).toBe(0);
        expect(planet.bank!.deposits).toBe(900);
    });

    it('rolls over matured loan when deposits are insufficient (with 5% ROLLOVER_FEE_RATE)', () => {
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0.05, 1, 50, true)];
        agent.assets[planet.id]!.deposits = 30;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 30;

        maturesLoans(agentMap(agent), planet, 100);

        expect(agent.assets[planet.id]!.deposits).toBe(0);
        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(70);
        expect(planet.bank!.loans).toBe(70);
        expect(planet.bank!.deposits).toBe(0);
    });

    it('preserves monetary conservation invariant after rollover with shortfall', () => {
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0.05, 1, 50, true)];
        agent.assets[planet.id]!.deposits = 30;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 100;
        planet.bank!.householdDeposits = 70;

        maturesLoans(agentMap(agent), planet, 100);

        const firmDeposits = agent.assets[planet.id]!.deposits;
        const residual = planet.bank!.householdDeposits + firmDeposits - planet.bank!.loans;
        expect(Math.abs(residual)).toBeLessThan(1e-6);
    });

    it('handles multiple matured loans at once', () => {
        agent.assets[planet.id]!.activeLoans = [
            makeLoan('wageCoverage', 50, 0.05, 1, 50, true),
            makeLoan('bufferCoverage', 30, 0.05, 10, 60, true),
            makeLoan('claimCoverage', 20, 0.05, 20, 200, true),
        ];
        agent.assets[planet.id]!.deposits = 100;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 100;

        maturesLoans(agentMap(agent), planet, 100);

        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(20);
        expect(agent.assets[planet.id]!.deposits).toBe(20);
        expect(planet.bank!.loans).toBe(20);
        expect(planet.bank!.deposits).toBe(20);
    });

    it('partially repays and rolls over when deposits partially cover matured loans', () => {
        agent.assets[planet.id]!.activeLoans = [
            makeLoan('wageCoverage', 50, 0.05, 1, 50, true),
            makeLoan('bufferCoverage', 30, 0.05, 10, 60, true),
            makeLoan('claimCoverage', 20, 0.05, 20, 200, true),
        ];
        agent.assets[planet.id]!.deposits = 30;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 100;

        maturesLoans(agentMap(agent), planet, 100);

        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(70);
        expect(agent.assets[planet.id]!.deposits).toBe(0);
        expect(planet.bank!.loans).toBe(70);
    });

    it('ignores loans with maturityTick = 0 (no fixed maturity)', () => {
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0.05, 1, 0, true)];
        agent.assets[planet.id]!.deposits = 1000;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 1000;

        maturesLoans(agentMap(agent), planet, 1000);

        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(100);
        expect(planet.bank!.loans).toBe(100);
    });

    it('skips agents without assets on the planet', () => {
        const agent2 = makeAgent('agent-2', 'other-planet', 'No assets');
        agent2.assets[planet.id] = undefined as unknown as AgentPlanetAssets;

        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0.05, 1, 50, true)];
        agent.assets[planet.id]!.deposits = 1000;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 1000;

        maturesLoans(agentMap(agent, agent2), planet, 100);

        expect(planet.bank!.loans).toBe(0);
    });

    it('handles no matured loans among multiple agents', () => {
        const agent2 = makeAgent('agent-2', planet.id, 'Agent 2');
        agent2.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 200, 0.05, 1, 200, true)];
        agent2.assets[planet.id]!.deposits = 2000;

        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0.05, 1, 200, true)];
        agent.assets[planet.id]!.deposits = 1000;

        planet.bank!.loans = 300;
        planet.bank!.deposits = 3000;

        maturesLoans(agentMap(agent, agent2), planet, 50);

        expect(planet.bank!.loans).toBe(300);
    });

    it('updates bank equity at the end', () => {
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0.05, 1, 50, true)];
        agent.assets[planet.id]!.deposits = 1000;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 1000;
        planet.bank!.equity = 0;

        maturesLoans(agentMap(agent), planet, 100);

        expect(planet.bank!.equity).toBe(planet.bank!.deposits - planet.bank!.loans);
    });
});

describe('money conservation', () => {
    /**
     * The fundamental money conservation invariant is:
     * Σ(agentDeposits) + bank.householdDeposits - bank.loans = bank.equity
     * This should be preserved across operations.
     */
    function totalMoney(agents: Map<string, Agent>, planet: Planet): number {
        let firmDeposits = 0;
        for (const a of agents.values()) {
            firmDeposits += a.assets[planet.id]?.deposits ?? 0;
        }
        return firmDeposits + planet.bank!.householdDeposits;
    }

    it('preProductionFinancialTick conserves total money in the system', () => {
        const agent1 = makeAgent('agent-1', 'p', 'Agent 1');
        const agent2 = makeAgent('agent-2', 'p', 'Agent 2');
        const result = makePlanetWithPopulation({ none: 1000 });
        const planet = result.planet;
        planet.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };

        const assets1 = agent1.assets[planet.id]!;
        assets1.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
        assets1.deposits = 10_000;
        addWorker(assets1, 25, 'none', 'novice', 100);

        const assets2 = agent2.assets[planet.id]!;
        assets2.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
        assets2.deposits = 5_000;
        addWorker(assets2, 30, 'primary', 'professional', 50);

        const agents = agentMap(agent1, agent2);
        const before = totalMoney(agents, planet);

        preProductionFinancialTick(agents, planet);

        const after = totalMoney(agents, planet);
        expect(after).toBeCloseTo(before, -6);
    });
});
