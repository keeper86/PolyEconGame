import { beforeEach, describe, expect, it } from 'vitest';

import type { Agent, AgentPlanetAssets, Planet } from '../planet/planet';
import { bankEquity } from '../planet/planet';
import { automaticLoanRepayment, maturesLoans, preProductionFinancialTick } from './financialTick';

import { checkMonetaryConservation } from '../invariants';
import { coalDepositResourceType } from '../planet/landBoundResources';
import { ironOreResourceType } from '../planet/resources';
import type { EducationLevelType } from '../population/education';
import {
    agentMap,
    makeAgent,
    makeGameState,
    makePlanet,
    makePlanetWithPopulation,
    makeProductionFacility,
} from '../utils/testHelper';
import { terminateAndRefound } from './bankruptcy';
import { grantLoan, hasOutstandingEmergencyLoan, makeLoan, totalOutstandingLoans } from './loanTypes';

function addWorker(assets: AgentPlanetAssets, age: number, edu: EducationLevelType, count: number): void {
    const wf = assets.workforceDemography!;
    wf[age][edu].active += count;
}

function addEmployed(planet: Planet, age: number, edu: EducationLevelType, count: number): void {
    planet.population.demography[age].employed[edu].total += count;
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
        preProductionFinancialTick(agentMap(agent), planet, 1, makeGameState());
        expect(agent.assets[planet.id]?.deposits ?? 0).toBe(0);
        expect(planet.bank!.loans).toBe(0);
    });

    it('continues past a workerless first agent and still pays wages + updates the planet wage', () => {
        const workerless = makeAgent('workerless', 'p', 'Workerless');
        const workerAgent = makeAgent('workerful', 'p', 'Workerful');
        const result = makePlanetWithPopulation({ none: 1000 });
        const planet = result.planet;
        planet.wagePerEdu = { none: 10.0, primary: 10.0, secondary: 10.0, tertiary: 10.0 };
        workerless.assets[planet.id]!.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };

        const assets = workerAgent.assets[planet.id]!;
        assets.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
        assets.deposits = 10_000;
        addWorker(assets, 25, 'none', 100);
        addEmployed(planet, 25, 'none', 100);

        preProductionFinancialTick(agentMap(workerless, workerAgent), planet, 1, makeGameState());

        expect(assets.deposits).toBe(9_900);
        expect(planet.wagePerEdu.none).toBeCloseTo(1.0, 6);
    });

    it('deducts wages from deposits when agent has sufficient funds', () => {
        const assets = agent.assets[planet.id]!;
        assets.deposits = 10_000;
        agent.automated = false;

        addWorker(assets, 25, 'none', 10);

        preProductionFinancialTick(agentMap(agent), planet, 1, makeGameState());

        expect(assets.deposits).toBe(9_990);
        expect(planet.bank!.loans).toBe(0);
    });

    it('grants a wage coverage loan when deposits are insufficient for wages', () => {
        const assets = agent.assets[planet.id]!;
        assets.deposits = 1_000;
        agent.automated = false;

        addWorker(assets, 25, 'none', 2000);

        preProductionFinancialTick(agentMap(agent), planet, 1, makeGameState());

        expect(planet.bank!.loans).toBeCloseTo(119_000, -1);
        expect(assets.deposits).toBeCloseTo(118_000, -1);
        expect(assets.activeLoans.length).toBeGreaterThanOrEqual(1);
        expect(assets.activeLoans[0]!.type).toBe('wageCoverage');
        expect(planet.bank!.emergencyLoansGranted).toBe(0);
    });

    it('does not grant wage coverage loan when deposits exactly cover wages', () => {
        const assets = agent.assets[planet.id]!;
        assets.deposits = 500;

        addWorker(assets, 25, 'none', 500);

        preProductionFinancialTick(agentMap(agent), planet, 1, makeGameState());

        expect(planet.bank!.loans).toBe(0);
        expect(assets.deposits).toBe(0);
    });

    it('credits wage income to employed population categories', () => {
        const assets = agent.assets[planet.id]!;
        assets.deposits = 10_000;

        addWorker(assets, 30, 'none', 1);

        addEmployed(planet, 30, 'none', 1);

        const initialHouseholdDeposits = planet.bank!.householdDeposits;

        preProductionFinancialTick(agentMap(agent), planet, 1, makeGameState());

        expect(planet.bank!.householdDeposits).toBeCloseTo(initialHouseholdDeposits + 1, -6);
    });

    it('credits wages proportionally when agent workers are fewer than population in cell', () => {
        const assets = agent.assets[planet.id]!;
        assets.deposits = 10_000;

        addWorker(assets, 30, 'none', 3);

        addEmployed(planet, 30, 'none', 10);

        const initialHouseholdDeposits = planet.bank!.householdDeposits;
        const initialPopWealth = planet.population.demography[30].employed.none.wealth.mean;

        preProductionFinancialTick(agentMap(agent), planet, 1, makeGameState());

        expect(planet.bank!.householdDeposits).toBeCloseTo(initialHouseholdDeposits + 3, -6);
        expect(planet.population.demography[30].employed.none.wealth.mean).toBeCloseTo(initialPopWealth + 0.3, -6);
    });

    it('credits a uniform per-capita wage across education levels', () => {
        const assets = agent.assets[planet.id]!;
        assets.deposits = 10_000;
        agent.automated = false;
        assets.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 3.0 };

        addWorker(assets, 30, 'none', 10);
        addEmployed(planet, 30, 'none', 10);

        addWorker(assets, 30, 'tertiary', 5);
        addEmployed(planet, 30, 'tertiary', 5);

        const initialHouseholdDeposits = planet.bank!.householdDeposits;
        const noneWealthBefore = planet.population.demography[30].employed.none.wealth.mean;
        const tertiaryWealthBefore = planet.population.demography[30].employed.tertiary.wealth.mean;

        preProductionFinancialTick(agentMap(agent), planet, 1, makeGameState());

        const perCapitaWage = 25 / 15;
        expect(planet.bank!.householdDeposits).toBeCloseTo(initialHouseholdDeposits + 25, -6);
        expect(planet.population.demography[30].employed.none.wealth.mean).toBeCloseTo(
            noneWealthBefore + perCapitaWage,
            -6,
        );
        expect(planet.population.demography[30].employed.tertiary.wealth.mean).toBeCloseTo(
            tertiaryWealthBefore + perCapitaWage,
            -6,
        );
        expect(assets.deposits).toBe(10_000 - 25);
    });

    it('grants buffer coverage loan when automated agent needs working capital for input buffer', () => {
        const assets = agent.assets[planet.id]!;
        assets.deposits = 1_000;

        addWorker(assets, 25, 'none', 10);

        const facility = makeProductionFacility();
        facility.needs = [
            {
                resource: ironOreResourceType,
                quantity: 5,
            },
        ];
        facility.scale = 2;
        assets.productionFacilities = [facility];

        planet.marketPrices[ironOreResourceType.name] = 10;

        preProductionFinancialTick(agentMap(agent), planet, 1, makeGameState());

        const bufferLoan = assets.activeLoans.find((l) => l.type === 'bufferCoverage');
        expect(bufferLoan).toBeDefined();
        expect(bufferLoan!.remainingPrincipal).toBeCloseTo(2_010, -1);
    });

    it('does not grant buffer loan when agent is not automated', () => {
        agent.automated = false;
        const assets = agent.assets[planet.id]!;
        assets.deposits = 1_000;

        addWorker(assets, 25, 'none', 10);

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

        preProductionFinancialTick(agentMap(agent), planet, 1, makeGameState());

        const bufferLoan = assets.activeLoans.find((l) => l.type === 'bufferCoverage');
        expect(bufferLoan).toBeUndefined();
    });

    it('excludes landBoundResource needs from buffer cost estimation', () => {
        const assets = agent.assets[planet.id]!;
        assets.deposits = 1_000;

        addWorker(assets, 25, 'none', 10);

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

        preProductionFinancialTick(agentMap(agent), planet, 1, makeGameState());

        const bufferLoan = assets.activeLoans.find((l) => l.type === 'bufferCoverage');
        expect(bufferLoan).toBeUndefined();
    });

    it('computes weighted average planet wagePerEdu across all agents', () => {
        const agent2 = makeAgent('agent-2', planet.id, 'Agent 2');
        agent2.assets[planet.id]!.wagePerEdu = { none: 2.0, primary: 2.0, secondary: 2.0, tertiary: 2.0 };

        addWorker(agent.assets[planet.id]!, 25, 'none', 1);
        agent.assets[planet.id]!.deposits = 1_000;

        addWorker(agent2.assets[planet.id]!, 25, 'none', 3);
        agent2.assets[planet.id]!.deposits = 1_000;

        preProductionFinancialTick(agentMap(agent, agent2), planet, 1, makeGameState());

        expect(planet.wagePerEdu.none).toBeCloseTo(1.75, -6);
    });

    it('skips agents without assets on the planet', () => {
        const assets = agent.assets[planet.id]!;
        assets.deposits = 1_000;
        addWorker(assets, 25, 'none', 10);

        const agent2 = makeAgent('agent-2', 'other-planet', 'Agent 2');

        preProductionFinancialTick(agentMap(agent, agent2), planet, 1, makeGameState());

        expect(planet.bank!.loans).toBe(0);
    });

    it('accumulates wages and worker ticks in monthAcc', () => {
        const assets = agent.assets[planet.id]!;
        assets.deposits = 10_000;

        addWorker(assets, 25, 'none', 5);
        addWorker(assets, 25, 'primary', 3);

        preProductionFinancialTick(agentMap(agent), planet, 1, makeGameState());

        expect(assets.monthAcc.wages).toBe(8);

        expect(assets.monthAcc.totalWorkersTicks).toBe(8);
    });

    it('keeps bank equity consistent after wages and emergency loans', () => {
        const assets = agent.assets[planet.id]!;
        grantLoan(assets, planet.bank!, 10_000, 'starter', 0);
        addWorker(assets, 25, 'none', 10);

        preProductionFinancialTick(agentMap(agent), planet, 1, makeGameState());

        expect(bankEquity(planet.bank!)).toBe(planet.bank!.loans - planet.bank!.deposits);
        expect(bankEquity(planet.bank!)).toBe(planet.bank!.profit - planet.bank!.writeOffs);
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

    it('bank equity stays consistent after repayment', () => {
        planet.bank!.loans = 50;
        planet.bank!.deposits = 10_050;
        agent.assets[planet.id]!.deposits = 10_050;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];
        agent.assets[planet.id]!.lastMonthAcc.wages = 1;

        automaticLoanRepayment(agentMap(agent), planet);

        expect(bankEquity(planet.bank!)).toBe(planet.bank!.loans - planet.bank!.deposits);
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

    it('keeps bank equity consistent after automatic repayment', () => {
        planet.bank!.loans = 50;
        planet.bank!.deposits = 10_050;
        agent.assets[planet.id]!.deposits = 10_050;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];
        agent.assets[planet.id]!.lastMonthAcc.wages = 1;

        automaticLoanRepayment(agentMap(agent), planet);

        expect(bankEquity(planet.bank!)).toBe(planet.bank!.loans - planet.bank!.deposits);
    });
});

describe('enforceLoanMaturities', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        const result = makePlanetWithPopulation({ none: 1000 });
        planet = result.planet;
        planet.bank!.loanRatePerYear = 0;
    });

    it('does nothing when there are no matured loans', () => {
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0, 1, 361, true)];
        agent.assets[planet.id]!.deposits = 1000;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 1000;

        maturesLoans(agentMap(agent), planet, 100);

        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(100);
        expect(planet.bank!.loans).toBe(100);
    });

    it('repays matured loan from deposits when sufficient funds are available', () => {
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0, 1, 50, true)];
        agent.assets[planet.id]!.deposits = 1000;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 1000;

        maturesLoans(agentMap(agent), planet, 100);

        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(0);
        expect(agent.assets[planet.id]!.deposits).toBe(900);
        expect(planet.bank!.loans).toBe(0);
        expect(planet.bank!.deposits).toBe(900);
    });

    it('rolls over matured loan when deposits are insufficient', () => {
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0, 1, 50, true)];
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
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0, 1, 50, true)];
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
            makeLoan('wageCoverage', 50, 0, 1, 50, true),
            makeLoan('bufferCoverage', 30, 0, 10, 60, true),
            makeLoan('claimCoverage', 20, 0, 20, 200, true),
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
            makeLoan('wageCoverage', 50, 0, 1, 50, true),
            makeLoan('bufferCoverage', 30, 0, 10, 60, true),
            makeLoan('claimCoverage', 20, 0, 20, 200, true),
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
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0, 1, 0, true)];
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

        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0, 1, 50, true)];
        agent.assets[planet.id]!.deposits = 1000;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 1000;

        maturesLoans(agentMap(agent, agent2), planet, 100);

        expect(planet.bank!.loans).toBe(0);
    });

    it('handles no matured loans among multiple agents', () => {
        const agent2 = makeAgent('agent-2', planet.id, 'Agent 2');
        agent2.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 200, 0, 1, 200, true)];
        agent2.assets[planet.id]!.deposits = 2000;

        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0, 1, 200, true)];
        agent.assets[planet.id]!.deposits = 1000;

        planet.bank!.loans = 300;
        planet.bank!.deposits = 3000;

        maturesLoans(agentMap(agent, agent2), planet, 50);

        expect(planet.bank!.loans).toBe(300);
    });

    it('keeps bank equity consistent after loan maturing', () => {
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0, 1, 50, true)];
        agent.assets[planet.id]!.deposits = 1000;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 1000;

        maturesLoans(agentMap(agent), planet, 100);

        expect(bankEquity(planet.bank!)).toBe(planet.bank!.loans - planet.bank!.deposits);
    });
});

describe('loan interest and bankruptcy', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        const result = makePlanetWithPopulation({ none: 1000 });
        planet = result.planet;
        planet.bank!.loanRatePerYear = 0.05;
    });

    it('collects loan interest and accumulates bank profit', () => {
        grantLoan(agent.assets[planet.id]!, planet.bank!, 3600, 'wageCoverage', 1);
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 3600, 0.05, 1, 1000, true)];
        agent.assets[planet.id]!.deposits = 3600;
        planet.bank!.deposits = 3600;

        maturesLoans(agentMap(agent), planet, 1);

        expect(agent.assets[planet.id]!.deposits).toBe(3599.5);
        expect(agent.assets[planet.id]!.monthAcc.interestPaid).toBeCloseTo(0.5, 6);
        expect(planet.bank!.deposits).toBe(3599.5);
        expect(bankEquity(planet.bank!)).toBeCloseTo(0.5, 6);
        expect(planet.bank!.interestCollected).toBeCloseTo(0.5, 6);
        expect(planet.bank!.profit).toBeCloseTo(0.5, 6);
        expect(bankEquity(planet.bank!)).toBe(planet.bank!.profit - planet.bank!.writeOffs);
    });

    it('collects each loan at its own rate', () => {
        agent.assets[planet.id]!.activeLoans = [
            makeLoan('wageCoverage', 3600, 0.05, 1, 1000, true),
            makeLoan('bufferCoverage', 3600, 0.1, 2, 2000, true),
        ];
        agent.assets[planet.id]!.deposits = 1000;
        planet.bank!.loans = 7200;
        planet.bank!.deposits = 1000;

        maturesLoans(agentMap(agent), planet, 1);

        expect(planet.bank!.interestCollected).toBeCloseTo(1.5, 6);
        expect(agent.assets[planet.id]!.deposits).toBe(998.5);
    });

    it('capitalizes uncovered interest as a rollover loan at the current rate', () => {
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 3600, 0.05, 1, 1000, true)];
        agent.assets[planet.id]!.deposits = 0;
        planet.bank!.loans = 3600;
        planet.bank!.deposits = 0;

        maturesLoans(agentMap(agent), planet, 1);

        expect(planet.bank!.interestCollected).toBeCloseTo(0.5, 6);
        const rollover = agent.assets[planet.id]!.activeLoans.find((l) => l.type === 'rollover');
        expect(rollover).toBeDefined();
        expect(rollover!.remainingPrincipal).toBeCloseTo(0.5, 6);
        expect(rollover!.annualInterestRate).toBe(planet.bank!.loanRatePerYear);
    });

    it('does not collect loan interest from the government (0% starter loan)', () => {
        const gov = makeAgent('gov');
        const govPlanet = makePlanetWithPopulation({ none: 1000 }).planet;
        govPlanet.governmentId = gov.id;
        gov.assets[govPlanet.id]!.activeLoans = [makeLoan('starter', 5_000_000_000, 0, 1, 1000, true)];
        gov.assets[govPlanet.id]!.deposits = 5_000_000_000;
        govPlanet.bank!.loans = 5_000_000_000;
        govPlanet.bank!.deposits = 5_000_000_000;

        maturesLoans(agentMap(gov), govPlanet, 1);

        expect(gov.assets[govPlanet.id]!.deposits).toBe(5_000_000_000);
        expect(govPlanet.bank!.deposits).toBe(5_000_000_000);
        expect(govPlanet.bank!.interestCollected).toBe(0);
    });

    it('keeps a wage loan within loan conditions as wageCoverage', () => {
        addWorker(agent.assets[planet.id]!, 25, 'none', 10);
        addEmployed(planet, 25, 'none', 10);
        agent.assets[planet.id]!.wagePerEdu.none = 1;
        agent.assets[planet.id]!.deposits = 1;
        agent.assets[planet.id]!.activeLoans = [makeLoan('emergency', 500_000, 0.05, 1, 361, true)];
        planet.wagePerEdu.none = 1;
        planet.bank!.loans = 500_000;
        planet.bank!.deposits = 1000;
        const gameState = makeGameState([planet], [agent]);

        preProductionFinancialTick(gameState.agents, planet, 1, gameState);

        expect(hasOutstandingEmergencyLoan(agent.assets[planet.id]!.activeLoans)).toBe(true);
        expect(agent.assets[planet.id]!.activeLoans.find((l) => l.type === 'wageCoverage')).toBeDefined();
        expect(planet.bank!.emergencyLoansGranted).toBe(0);
        expect(planet.bank!.bankruptcies).toBe(0);
    });

    it('classifies a wage loan beyond loan conditions as emergency without bankruptcy', () => {
        addWorker(agent.assets[planet.id]!, 25, 'none', 7000);
        addEmployed(planet, 25, 'none', 7000);
        agent.assets[planet.id]!.wagePerEdu.none = 1;
        agent.assets[planet.id]!.deposits = 1;
        agent.assets[planet.id]!.activeLoans = [makeLoan('emergency', 600_000, 0.05, 1, 361, true)];
        planet.wagePerEdu.none = 1;
        planet.bank!.loans = 600_000;
        planet.bank!.deposits = 1;
        const gameState = makeGameState([planet], [agent]);

        preProductionFinancialTick(gameState.agents, planet, 1, gameState);

        expect(hasOutstandingEmergencyLoan(agent.assets[planet.id]!.activeLoans)).toBe(true);
        expect(planet.bank!.emergencyLoansGranted).toBe(1);
        expect(planet.bank!.bankruptcies).toBe(0);
    });

    it('terminates and refounds the company when an emergency wage loan would breach the bankruptcy trigger', () => {
        addWorker(agent.assets[planet.id]!, 25, 'none', 10);
        addEmployed(planet, 25, 'none', 10);
        agent.assets[planet.id]!.wagePerEdu.none = 2000;
        agent.assets[planet.id]!.deposits = 1;
        agent.assets[planet.id]!.activeLoans = [makeLoan('emergency', 20_000_000, 0.05, 1, 361, true)];
        planet.wagePerEdu.none = 2000;
        planet.bank!.loans = 20_000_000;
        planet.bank!.deposits = 1;
        const gameState = makeGameState([planet], [agent]);

        preProductionFinancialTick(gameState.agents, planet, 1, gameState);

        expect(planet.bank!.bankruptcies).toBe(1);
        expect(planet.bank!.writeOffs).toBeGreaterThan(0);
        const refound = [...gameState.agents.values()].find((a) => a.id !== agent.id);
        expect(refound).toBeDefined();
        expect(totalOutstandingLoans(refound!.assets[planet.id]!.activeLoans)).toBe(0);
    });

    it('terminates and refounds the company when the first emergency wage loan breaches the bankruptcy trigger', () => {
        addWorker(agent.assets[planet.id]!, 25, 'none', 10);
        addEmployed(planet, 25, 'none', 10);
        agent.assets[planet.id]!.wagePerEdu.none = 1;
        agent.assets[planet.id]!.deposits = 1;
        agent.assets[planet.id]!.activeLoans = [makeLoan('emergency', 20_000_000, 0.05, 1, 361, true)];
        planet.wagePerEdu.none = 1;
        planet.bank!.deposits = 1000;
        planet.bank!.loans = 20_000_000;
        const gameState = makeGameState([planet], [agent]);

        preProductionFinancialTick(gameState.agents, planet, 1, gameState);

        expect(planet.bank!.bankruptcies).toBe(1);
        expect(planet.bank!.writeOffs).toBeGreaterThan(0);
        const refound = [...gameState.agents.values()].find((a) => a.id !== agent.id);
        expect(refound).toBeDefined();
        expect(refound!.id).toBe('agent-1_lastRefounded_2200');
        expect(refound!.name).toBe('Agent 1 ♻1');
        expect(totalOutstandingLoans(refound!.assets[planet.id]!.activeLoans)).toBe(0);
        expect(refound!.assets[planet.id]!.deposits).toBeCloseTo(1 * 0.975, 6);
        expect(refound!.assets[planet.id]!.workforceDemography[25].none.active).toBe(10);
    });

    it('continues processing remaining agents after a bankruptcy refound', () => {
        const bankrupt = makeAgent('bankrupt', planet.id, 'Bankrupt');
        const healthy = makeAgent('healthy', planet.id, 'Healthy');
        const bankruptAssets = bankrupt.assets[planet.id]!;
        const healthyAssets = healthy.assets[planet.id]!;
        bankruptAssets.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
        healthyAssets.wagePerEdu = { none: 2.0, primary: 2.0, secondary: 2.0, tertiary: 2.0 };
        bankruptAssets.deposits = 1;
        bankruptAssets.activeLoans = [makeLoan('emergency', 20_000_000, 0.05, 1, 361, true)];
        healthyAssets.deposits = 10_000;
        addWorker(bankruptAssets, 25, 'none', 10);
        addWorker(healthyAssets, 25, 'none', 100);
        addEmployed(planet, 25, 'none', 110);
        planet.bank!.deposits = 1000;
        planet.bank!.loans = 20_000_100;
        const gameState = makeGameState([planet], [bankrupt, healthy], 1);

        preProductionFinancialTick(gameState.agents, planet, 1, gameState);

        expect(gameState.agents.has('bankrupt')).toBe(false);
        expect(gameState.agents.has('bankrupt_lastRefounded_2200')).toBe(true);
        expect(gameState.agents.get('bankrupt_lastRefounded_2200')!.name).toBe('Bankrupt ♻1');
        expect(planet.bank!.bankruptcies).toBe(1);
        expect(healthyAssets.deposits).toBe(9_800);
        expect(planet.wagePerEdu.none).toBeCloseTo(210 / 110, 6);
        expect(bankEquity(planet.bank!)).toBe(planet.bank!.loans - planet.bank!.deposits);
    });

    it('re-points resource claims to the re-founded company', () => {
        addWorker(agent.assets[planet.id]!, 25, 'none', 10);
        addEmployed(planet, 25, 'none', 10);
        agent.assets[planet.id]!.wagePerEdu.none = 1;
        agent.assets[planet.id]!.deposits = 1;
        agent.assets[planet.id]!.activeLoans = [makeLoan('emergency', 20_000_000, 0.05, 1, 361, true)];
        planet.wagePerEdu.none = 1;
        planet.bank!.deposits = 1000;
        planet.bank!.loans = 20_000_000;
        planet.resources[ironOreResourceType.name] = {
            pool: { resource: ironOreResourceType, quantity: 100, regenerationRate: 1, maximumCapacity: 100 },
            claims: [
                {
                    resource: ironOreResourceType,
                    quantity: 100,
                    regenerationRate: 1,
                    maximumCapacity: 100,
                    id: 'claim-1',
                    tenantAgentId: agent.id,
                    tenantCostInCoins: 0,
                    costPerTick: 1,
                    claimStatus: 'active',
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };
        const gameState = makeGameState([planet], [agent]);

        preProductionFinancialTick(gameState.agents, planet, 1, gameState);
        agent.assets[planet.id]!.deposits = 1;
        preProductionFinancialTick(gameState.agents, planet, 2, gameState);

        const refound = [...gameState.agents.values()].find((a) => a.id !== agent.id);
        const claim = planet.resources[ironOreResourceType.name]!.claims[0]!;
        expect(claim.tenantAgentId).toBe(refound!.id);
        expect(planet.resources[ironOreResourceType.name]!.claims.some((c) => c.tenantAgentId === agent.id)).toBe(
            false,
        );
    });

    it('repaying the emergency loan clears the warning', () => {
        agent.assets[planet.id]!.activeLoans = [makeLoan('emergency', 100, 0.05, 1, 361, true)];
        agent.assets[planet.id]!.deposits = 10_050;
        agent.assets[planet.id]!.lastMonthAcc.wages = 1;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 10_050;

        automaticLoanRepayment(agentMap(agent), planet);

        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(0);
        expect(hasOutstandingEmergencyLoan(agent.assets[planet.id]!.activeLoans)).toBe(false);
    });

    it('rolls a matured emergency loan over as an emergency loan so the warning persists', () => {
        agent.assets[planet.id]!.activeLoans = [makeLoan('emergency', 100, 0.05, 1, 50, true)];
        agent.assets[planet.id]!.deposits = 30;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 30;

        maturesLoans(agentMap(agent), planet, 100);

        expect(hasOutstandingEmergencyLoan(agent.assets[planet.id]!.activeLoans)).toBe(true);
        expect(planet.bank!.bankruptcies).toBe(0);
    });

    it('rolls over a matured loan at the current planet rate', () => {
        planet.bank!.loanRatePerYear = 0.08;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0.01, 1, 50, true)];
        agent.assets[planet.id]!.deposits = 0;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 0;

        maturesLoans(agentMap(agent), planet, 100);

        const rollover = agent.assets[planet.id]!.activeLoans.find((l) => l.type === 'rollover');
        expect(rollover).toBeDefined();
        expect(rollover!.annualInterestRate).toBe(0.08);
    });
});

describe('money conservation', () => {
    /**
     * The fundamental money conservation invariant is:
     * Σ(agentDeposits) + bank.householdDeposits = bank.deposits
     * and bank.loans = Σ(agent loans), with
     * bank.equity = bank.loans - bank.deposits = bank.profit - bank.writeOffs.
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
        addWorker(assets1, 25, 'none', 100);

        const assets2 = agent2.assets[planet.id]!;
        assets2.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
        assets2.deposits = 5_000;
        addWorker(assets2, 30, 'primary', 50);

        const agents = agentMap(agent1, agent2);
        const before = totalMoney(agents, planet);

        preProductionFinancialTick(agents, planet, 1, makeGameState());

        const after = totalMoney(agents, planet);
        expect(after).toBeCloseTo(before, -6);
    });

    function assertConserved(gameState: ReturnType<typeof makeGameState>, planet: Planet, tolerance = 1e-9): void {
        const issues = checkMonetaryConservation(gameState.agents, new Map([[planet.id, planet]]), tolerance);
        expect(issues).toEqual([]);
    }

    it('conserves money across bankruptcy (debt write-off and retained deposits)', () => {
        const planet = makePlanet();
        const gov = makeAgent('gov', planet.id, 'Gov');
        const agent = makeAgent('a1', planet.id, 'A1');
        const assets = agent.assets[planet.id]!;
        assets.deposits = 1000;
        assets.activeLoans = [makeLoan('emergency', 1000, 0.05, 1, 361, true)];
        planet.governmentId = gov.id;
        planet.bank.deposits = 1000;
        planet.bank.loans = 1000;
        const gameState = makeGameState([planet], [gov, agent, planet.recycler], 2);

        assertConserved(gameState, planet);

        terminateAndRefound(gameState, planet, agent, 2);

        expect(planet.bank.bankruptcies).toBe(1);
        expect(planet.bank.writeOffs).toBe(1000);
        expect(planet.bank.profit).toBeCloseTo(1000 * (1 - 0.975), 6);
        assertConserved(gameState, planet);
    });

    it('conserves money across bankruptcy including a facility sale to the recycler', () => {
        const planet = makePlanet();
        const gov = makeAgent('gov', planet.id, 'Gov');
        const agent = makeAgent('a1', planet.id, 'A1');
        const assets = agent.assets[planet.id]!;
        assets.deposits = 5000;
        assets.activeLoans = [makeLoan('emergency', 5000, 0.05, 1, 361, true)];
        assets.productionFacilities = [
            makeProductionFacility(
                { none: 0, primary: 0, secondary: 0, tertiary: 0 },
                { planetId: planet.id, id: 'fac-1', name: 'Fac 1', scale: 100, maxScale: 100 },
            ),
        ];
        planet.governmentId = gov.id;
        planet.bank.deposits = 5000;
        planet.bank.loans = 5000;
        const gameState = makeGameState([planet], [gov, agent, planet.recycler], 2);

        assertConserved(gameState, planet);

        terminateAndRefound(gameState, planet, agent, 2);

        expect(planet.bank.bankruptcies).toBe(1);
        expect(planet.bank.writeOffs).toBe(5000);
        assertConserved(gameState, planet);
    });

    it('conserves money through interest collection and a subsequent bankruptcy', () => {
        const planet = makePlanet();
        const gov = makeAgent('gov', planet.id, 'Gov');
        const agent = makeAgent('a1', planet.id, 'A1');
        const assets = agent.assets[planet.id]!;
        assets.deposits = 3600;
        assets.activeLoans = [makeLoan('wageCoverage', 3600, 0.05, 1, 50, true)];
        planet.governmentId = gov.id;
        planet.bank.deposits = 3600;
        planet.bank.loans = 3600;
        const gameState = makeGameState([planet], [gov, agent, planet.recycler], 2);

        assertConserved(gameState, planet);

        maturesLoans(agentMap(agent), planet, 50);

        expect(planet.bank.interestCollected).toBeGreaterThan(0);
        assertConserved(gameState, planet);

        terminateAndRefound(gameState, planet, agent, 51);

        expect(planet.bank.bankruptcies).toBe(1);
        expect(planet.bank.writeOffs).toBeGreaterThan(0);
        assertConserved(gameState, planet);
    });
});
