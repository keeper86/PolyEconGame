import { beforeEach, describe, expect, it } from 'vitest';

import type { Agent, Planet } from '../planet/planet';
import { agentMap, makeAgent, makePlanetWithPopulation } from '../utils/testHelper';

import { seedRng } from '../utils/stochasticRound';
import { automaticLoanRepayment } from './financialTick';
import {
    consolidateLoans,
    grantLoan,
    hasOutstandingEmergencyLoan,
    makeLoan,
    repayLoansEmergencyFirst,
    totalOutstandingLoans,
} from './loanTypes';

describe('loan consolidation', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        planet = makePlanetWithPopulation({ none: 1000 }).planet;
        agent.assets[planet.id]!.deposits = 100_000;
        planet.bank = {
            loans: 0,
            deposits: 100_000,
            householdDeposits: 0,
            loanRatePerYear: 0.05,
            depositRatePerYear: 0.02,
            profit: 0,
            interestCollected: 0,
            writeOffs: 0,
            bankruptcies: 0,
            emergencyLoansGranted: 0,
            policyEquityEma: 0,
        };
    });

    it('consolidates multiple loans into one preserving total principal', () => {
        const assets = agent.assets[planet.id]!;
        assets.activeLoans = [
            makeLoan('wageCoverage', 100, 0.05, 10, 370, false),
            makeLoan('bufferCoverage', 200, 0.1, 20, 380, false),
            makeLoan('discretionary', 300, 0.15, 30, 390, true),
        ];

        const result = consolidateLoans(assets, planet.bank, 100);
        expect(result).not.toBeNull();
        expect(result!.type).toBe('consolidated');
        expect(result!.remainingPrincipal).toBe(600);
        expect(assets.activeLoans.length).toBe(1);
        expect(assets.activeLoans[0]!.remainingPrincipal).toBe(600);

        // Bank totals unchanged
        expect(planet.bank.loans).toBe(0);
        expect(planet.bank.deposits).toBe(100_000);
    });

    it('computes weighted average interest rate', () => {
        const assets = agent.assets[planet.id]!;
        assets.activeLoans = [
            makeLoan('wageCoverage', 100, 0.05, 10, 370, false),
            makeLoan('bufferCoverage', 300, 0.15, 20, 380, false),
        ];
        // Weighted: (100*0.05 + 300*0.15) / 400 = (5 + 45) / 400 = 0.125
        const result = consolidateLoans(assets, planet.bank, 100);
        expect(result!.annualInterestRate).toBeCloseTo(0.125, 6);
    });

    it('computes weighted average maturity', () => {
        const assets = agent.assets[planet.id]!;
        assets.activeLoans = [
            makeLoan('wageCoverage', 100, 0.05, 10, 400, false),
            makeLoan('bufferCoverage', 300, 0.15, 20, 800, false),
        ];
        // Weighted: (100*400 + 300*800) / 400 = (40000 + 240000) / 400 = 700
        const result = consolidateLoans(assets, planet.bank, 100);
        expect(result!.maturityTick).toBe(700);
    });

    it('handles loans with maturityTick = 0 (no maturity)', () => {
        const assets = agent.assets[planet.id]!;
        assets.activeLoans = [
            makeLoan('forexWorkingCapital', 500, 0.08, 100, 0, false),
            makeLoan('wageCoverage', 500, 0.1, 200, 400, true),
        ];
        const result = consolidateLoans(assets, planet.bank, 100);
        // Only the loan with maturityTick > 0 contributes to weighted maturity
        expect(result!.maturityTick).toBe(400);
        expect(result!.remainingPrincipal).toBe(1000);
    });

    it('returns null when there is 0 or 1 loan', () => {
        const assets = agent.assets[planet.id]!;
        assets.activeLoans = [];
        expect(consolidateLoans(assets, planet.bank, 100)).toBeNull();

        assets.activeLoans = [makeLoan('wageCoverage', 100, 0.05, 10, 370, false)];
        expect(consolidateLoans(assets, planet.bank, 100)).toBeNull();
        expect(assets.activeLoans.length).toBe(1);
    });

    it('grantLoan triggers consolidation when at loan limit', () => {
        const assets = agent.assets[planet.id]!;
        // Fill up to LOAN_LIMIT, so the next grantLoan triggers consolidation
        for (let i = 0; i < 1000; i++) {
            assets.activeLoans.push(makeLoan('wageCoverage', 1, 0.05 + i * 0.001, i, 370 + i, false));
        }
        expect(assets.activeLoans.length).toBe(1000);

        // Granting one more should hit the limit, consolidate all 1000 into 1, then add the new loan → 2 total
        grantLoan(assets, planet.bank, 5000, 'wageCoverage', 100);
        expect(assets.activeLoans.length).toBe(2);
        // One consolidated loan + the just-granted loan
        expect(assets.activeLoans[0]!.type).toBe('consolidated');
        expect(assets.activeLoans[1]!.type).toBe('wageCoverage');

        // Total principal includes all old loans (1000 * 1 = 1000) plus the new loan (5000) = 6000
        expect(totalOutstandingLoans(assets.activeLoans)).toBe(1000 + 5000);
    });
});

describe('per-agent loan bookkeeping', () => {
    let agent: Agent;

    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        planet = makePlanetWithPopulation({ none: 1000 }).planet;
        planet.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
        agent.assets[planet.id]!.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
    });

    it('agent repays only their own loan', () => {
        planet.bank!.loans = 50;
        planet.bank!.deposits = 10_050;
        agent.assets[planet.id]!.deposits = 10_050;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];
        agent.assets[planet.id]!.lastMonthAcc.wages = 1;

        automaticLoanRepayment(agentMap(agent), planet);

        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(0);
        expect(planet.bank!.loans).toBe(0);
        expect(agent.assets[planet.id]?.deposits ?? 0).toBe(10_000);
    });
});

describe('emergency loans', () => {
    it('tracks the warning while an emergency loan is outstanding', () => {
        const loans = [
            makeLoan('wageCoverage', 50, 0.05, 1, 361, false),
            makeLoan('emergency', 100, 0.05, 2, 362, true),
        ];
        expect(hasOutstandingEmergencyLoan(loans)).toBe(true);

        loans[1]!.remainingPrincipal = 0;
        expect(hasOutstandingEmergencyLoan(loans)).toBe(false);
    });

    it('repays emergency loans before all other loans', () => {
        const loans = [
            makeLoan('wageCoverage', 50, 0.05, 1, 361, false),
            makeLoan('emergency', 100, 0.05, 2, 362, true),
            makeLoan('rollover', 30, 0.05, 3, 1000, false),
        ];

        const repaid = repayLoansEmergencyFirst(loans, 120);

        expect(repaid).toBe(120);
        expect(totalOutstandingLoans(loans)).toBe(60);
        expect(loans.some((l) => l.type === 'emergency' && l.remainingPrincipal > 0)).toBe(false);
        expect(loans.some((l) => l.type === 'wageCoverage' && l.remainingPrincipal > 0)).toBe(true);
    });

    it('repays oldest first within the same priority class', () => {
        const loans = [makeLoan('emergency', 100, 0.05, 2, 362, true), makeLoan('emergency', 50, 0.05, 1, 361, true)];

        const repaid = repayLoansEmergencyFirst(loans, 60);

        expect(repaid).toBe(60);
        expect(loans.some((l) => l.remainingPrincipal > 0 && l.takenAtTick === 2)).toBe(true);
        expect(loans.some((l) => l.remainingPrincipal > 0 && l.takenAtTick === 1)).toBe(false);
    });
});

describe('loan ids', () => {
    it('stays unique when loans are created from a reset rng', () => {
        seedRng(42);
        const beforeRecovery = makeLoan('wageCoverage', 100, 0.05, 1, 361, false);
        seedRng(42);
        const afterRecovery = makeLoan('wageCoverage', 100, 0.05, 1, 361, false);

        expect(beforeRecovery.id).not.toBe(afterRecovery.id);
    });

    it('stays unique across many loans', () => {
        const ids = new Set(Array.from({ length: 1000 }, () => makeLoan('wageCoverage', 100, 0.05, 1, 361, false).id));

        expect(ids.size).toBe(1000);
    });
});
