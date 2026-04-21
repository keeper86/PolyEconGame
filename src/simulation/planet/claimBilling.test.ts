import { beforeEach, describe, expect, it } from 'vitest';
import { TICKS_PER_MONTH } from '../constants';
import { makeWorld } from '../utils/testHelper';
import { claimBillingTick } from './claimBilling';
import { arableLandResourceType, ironOreDepositResourceType } from './landBoundResources';
import type { Agent, Planet } from './planet';

function makeRenewableClaim(
    overrides?: Partial<{
        id: string;
        tenantAgentId: string | null;
        quantity: number;
        regenerationRate: number;
        maximumCapacity: number;
        costPerTick: number;
        claimStatus: 'active' | 'paused';
        noticePeriodEndsAtTick: number | null;
        pausedTicksThisYear: number;
    }>,
) {
    return {
        id: 'claim-1',
        resource: arableLandResourceType,
        quantity: 1000,
        regenerationRate: 1000,
        maximumCapacity: 1000,
        tenantAgentId: 'company-1',
        tenantCostInCoins: 0,
        costPerTick: 10,
        claimStatus: 'active' as const,
        noticePeriodEndsAtTick: null,
        pausedTicksThisYear: 0,
        ...overrides,
    };
}

function makeNonRenewableClaim(overrides?: Partial<{ tenantAgentId: string | null }>) {
    return {
        id: 'mine-1',
        resource: ironOreDepositResourceType,
        quantity: 5000,
        regenerationRate: 0,
        maximumCapacity: 5000,
        tenantAgentId: 'company-1',
        tenantCostInCoins: 50,
        costPerTick: 0,
        claimStatus: 'active' as const,
        noticePeriodEndsAtTick: null,
        pausedTicksThisYear: 0,
        ...overrides,
    };
}

describe('claimBillingTick', () => {
    let planet: Planet;
    let gov: Agent;
    let company: Agent;

    beforeEach(() => {
        const world = makeWorld({ companyIds: ['company-1'] });
        planet = world.planet;
        gov = world.gov;
        company = world.agents.find((a) => a.id === 'company-1')!;
        company.assets[planet.id].deposits = 1000;
        gov.assets[planet.id].deposits = 0;
    });

    describe('active renewable claim', () => {
        it('deducts costPerTick from tenant deposits', () => {
            planet.resources[arableLandResourceType.name] = [makeRenewableClaim()];
            const agents = new Map([
                [gov.id, gov],
                [company.id, company],
            ]);

            claimBillingTick(agents, planet, 1);

            expect(company.assets[planet.id].deposits).toBe(990);
        });

        it('credits costPerTick to government deposits', () => {
            planet.resources[arableLandResourceType.name] = [makeRenewableClaim()];
            const agents = new Map([
                [gov.id, gov],
                [company.id, company],
            ]);

            claimBillingTick(agents, planet, 1);

            expect(gov.assets[planet.id].deposits).toBe(10);
        });

        it('deducts the correct amount per tick across multiple ticks', () => {
            planet.resources[arableLandResourceType.name] = [makeRenewableClaim()];
            const agents = new Map([
                [gov.id, gov],
                [company.id, company],
            ]);

            claimBillingTick(agents, planet, 1);
            claimBillingTick(agents, planet, 2);
            claimBillingTick(agents, planet, 3);

            expect(company.assets[planet.id].deposits).toBe(970);
            expect(gov.assets[planet.id].deposits).toBe(30);
        });

        it('claim remains active when payment succeeds', () => {
            planet.resources[arableLandResourceType.name] = [makeRenewableClaim()];
            const agents = new Map([
                [gov.id, gov],
                [company.id, company],
            ]);

            claimBillingTick(agents, planet, 1);

            expect(planet.resources[arableLandResourceType.name][0].claimStatus).toBe('active');
        });
    });

    describe('pausing on insufficient funds', () => {
        it('sets claimStatus to paused when agent cannot afford costPerTick', () => {
            company.assets[planet.id].deposits = 5;
            company.automated = false;
            planet.resources[arableLandResourceType.name] = [makeRenewableClaim({ costPerTick: 10 })];
            const agents = new Map([
                [gov.id, gov],
                [company.id, company],
            ]);

            claimBillingTick(agents, planet, 1);

            expect(planet.resources[arableLandResourceType.name][0].claimStatus).toBe('paused');
        });

        it('does not deduct or credit when claim is paused due to insufficient funds', () => {
            company.assets[planet.id].deposits = 5;
            company.automated = false;
            planet.resources[arableLandResourceType.name] = [makeRenewableClaim({ costPerTick: 10 })];
            const agents = new Map([
                [gov.id, gov],
                [company.id, company],
            ]);

            claimBillingTick(agents, planet, 1);

            expect(company.assets[planet.id].deposits).toBe(5);
            expect(gov.assets[planet.id].deposits).toBe(0);
        });

        it('resumes active and deducts when paused claim has sufficient funds again', () => {
            company.assets[planet.id].deposits = 5;
            planet.resources[arableLandResourceType.name] = [
                makeRenewableClaim({ claimStatus: 'paused', costPerTick: 10 }),
            ];
            company.assets[planet.id].deposits = 100;
            const agents = new Map([
                [gov.id, gov],
                [company.id, company],
            ]);

            claimBillingTick(agents, planet, 1);

            expect(planet.resources[arableLandResourceType.name][0].claimStatus).toBe('active');
            expect(company.assets[planet.id].deposits).toBe(90);
            expect(gov.assets[planet.id].deposits).toBe(10);
        });

        it('stays paused when paused claim still cannot afford payment', () => {
            company.assets[planet.id].deposits = 5;
            company.automated = false;
            planet.resources[arableLandResourceType.name] = [
                makeRenewableClaim({ claimStatus: 'paused', costPerTick: 10 }),
            ];
            const agents = new Map([
                [gov.id, gov],
                [company.id, company],
            ]);

            claimBillingTick(agents, planet, 1);

            expect(planet.resources[arableLandResourceType.name][0].claimStatus).toBe('paused');
            expect(company.assets[planet.id].deposits).toBe(5);
        });
    });

    describe('notice / termination', () => {
        it('continues billing during notice period', () => {
            planet.resources[arableLandResourceType.name] = [
                makeRenewableClaim({ noticePeriodEndsAtTick: 100, costPerTick: 10 }),
            ];
            const agents = new Map([
                [gov.id, gov],
                [company.id, company],
            ]);

            claimBillingTick(agents, planet, 50);

            expect(company.assets[planet.id].deposits).toBe(990);
            expect(gov.assets[planet.id].deposits).toBe(10);
        });

        it('releases claim back to pool when notice period expires', () => {
            planet.resources[arableLandResourceType.name] = [makeRenewableClaim({ noticePeriodEndsAtTick: 100 })];
            const agents = new Map([
                [gov.id, gov],
                [company.id, company],
            ]);

            claimBillingTick(agents, planet, 100);

            const entries = planet.resources[arableLandResourceType.name];
            const tenanted = entries.filter((e) => e.tenantAgentId === company.id);
            expect(tenanted).toHaveLength(0);
        });

        it('merges released claim into untenanted pool', () => {
            planet.resources[arableLandResourceType.name] = [
                makeRenewableClaim({
                    noticePeriodEndsAtTick: 100,
                    quantity: 500,
                    maximumCapacity: 500,
                    regenerationRate: 500,
                }),
                {
                    id: 'pool',
                    resource: arableLandResourceType,
                    quantity: 200,
                    regenerationRate: 200,
                    maximumCapacity: 200,
                    tenantAgentId: null,
                    tenantCostInCoins: 0,
                    costPerTick: 0,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ];
            const agents = new Map([
                [gov.id, gov],
                [company.id, company],
            ]);

            claimBillingTick(agents, planet, 100);

            const entries = planet.resources[arableLandResourceType.name];
            expect(entries).toHaveLength(1);
            expect(entries[0].tenantAgentId).toBeNull();
            expect(entries[0].maximumCapacity).toBe(700);
        });

        it('does not release before notice period ends', () => {
            planet.resources[arableLandResourceType.name] = [makeRenewableClaim({ noticePeriodEndsAtTick: 100 })];
            const agents = new Map([
                [gov.id, gov],
                [company.id, company],
            ]);

            claimBillingTick(agents, planet, 99);

            const entries = planet.resources[arableLandResourceType.name];
            const tenanted = entries.filter((e) => e.tenantAgentId === company.id);
            expect(tenanted).toHaveLength(1);
        });

        it('does not set claimStatus to paused when agent cannot afford billing during notice period', () => {
            planet.resources[arableLandResourceType.name] = [
                makeRenewableClaim({ noticePeriodEndsAtTick: 100, costPerTick: 10 }),
            ];
            company.assets[planet.id]!.deposits = 0;
            const agents = new Map([
                [gov.id, gov],
                [company.id, company],
            ]);

            claimBillingTick(agents, planet, 50);

            const entry = planet.resources[arableLandResourceType.name][0];
            expect(entry!.claimStatus).toBe('active');
            expect(entry!.noticePeriodEndsAtTick).toBe(100);
        });
    });

    describe('auto-termination after 31 accumulated paused days in a year', () => {
        it('increments pausedTicksThisYear when claim becomes paused', () => {
            company.assets[planet.id].deposits = 5;
            company.automated = false;
            planet.resources[arableLandResourceType.name] = [makeRenewableClaim({ costPerTick: 10 })];
            const agents = new Map([
                [gov.id, gov],
                [company.id, company],
            ]);

            claimBillingTick(agents, planet, 42);

            const entry = planet.resources[arableLandResourceType.name][0];
            expect(entry!.claimStatus).toBe('paused');
            expect(entry!.pausedTicksThisYear).toBe(1);
        });

        it('accumulates pausedTicksThisYear across consecutive paused ticks', () => {
            company.assets[planet.id].deposits = 5;
            company.automated = false;
            planet.resources[arableLandResourceType.name] = [
                makeRenewableClaim({ claimStatus: 'paused', pausedTicksThisYear: 10, costPerTick: 10 }),
            ];
            const agents = new Map([
                [gov.id, gov],
                [company.id, company],
            ]);

            claimBillingTick(agents, planet, 20);

            expect(planet.resources[arableLandResourceType.name][0]!.pausedTicksThisYear).toBe(11);
        });

        it('does not reset pausedTicksThisYear when claim resumes', () => {
            company.assets[planet.id].deposits = 1000;
            planet.resources[arableLandResourceType.name] = [
                makeRenewableClaim({ claimStatus: 'paused', pausedTicksThisYear: 10, costPerTick: 10 }),
            ];
            const agents = new Map([
                [gov.id, gov],
                [company.id, company],
            ]);

            claimBillingTick(agents, planet, 20);

            const entry = planet.resources[arableLandResourceType.name][0];
            expect(entry!.claimStatus).toBe('active');
            expect(entry!.pausedTicksThisYear).toBe(10);
        });

        it('triggers notice of termination when pausedTicksThisYear reaches 31', () => {
            company.assets[planet.id].deposits = 5;
            company.automated = false;
            planet.resources[arableLandResourceType.name] = [
                makeRenewableClaim({ claimStatus: 'paused', pausedTicksThisYear: 30, costPerTick: 10 }),
            ];
            const agents = new Map([
                [gov.id, gov],
                [company.id, company],
            ]);

            claimBillingTick(agents, planet, 100);

            const entry = planet.resources[arableLandResourceType.name].find((e) => e.tenantAgentId === company.id)!;
            expect(entry.noticePeriodEndsAtTick).toBe(100 + TICKS_PER_MONTH);
        });

        it('does not trigger notice before 31 accumulated paused ticks', () => {
            company.assets[planet.id].deposits = 5;
            company.automated = false;
            planet.resources[arableLandResourceType.name] = [
                makeRenewableClaim({ claimStatus: 'paused', pausedTicksThisYear: 29, costPerTick: 10 }),
            ];
            const agents = new Map([
                [gov.id, gov],
                [company.id, company],
            ]);

            claimBillingTick(agents, planet, 100);

            const entry = planet.resources[arableLandResourceType.name].find((e) => e.tenantAgentId === company.id)!;
            expect(entry.noticePeriodEndsAtTick).toBeNull();
        });

        it('merges auto-terminated claim back into untenanted pool', () => {
            company.assets[planet.id].deposits = 5;
            planet.resources[arableLandResourceType.name] = [
                makeRenewableClaim({
                    claimStatus: 'paused',
                    noticePeriodEndsAtTick: TICKS_PER_MONTH,
                    costPerTick: 10,
                    quantity: 500,
                    maximumCapacity: 500,
                    regenerationRate: 500,
                }),
                {
                    id: 'pool',
                    resource: arableLandResourceType,
                    quantity: 200,
                    regenerationRate: 200,
                    maximumCapacity: 200,
                    tenantAgentId: null,
                    tenantCostInCoins: 0,
                    costPerTick: 0,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ];
            const agents = new Map([
                [gov.id, gov],
                [company.id, company],
            ]);

            claimBillingTick(agents, planet, TICKS_PER_MONTH);

            const entries = planet.resources[arableLandResourceType.name];
            expect(entries).toHaveLength(1);
            expect(entries[0].tenantAgentId).toBeNull();
            expect(entries[0].maximumCapacity).toBe(700);
        });
    });

    describe('non-renewable claims', () => {
        it('skips billing for non-renewable claims (regenerationRate = 0)', () => {
            planet.resources[ironOreDepositResourceType.name] = [makeNonRenewableClaim()];
            const agents = new Map([
                [gov.id, gov],
                [company.id, company],
            ]);

            claimBillingTick(agents, planet, 1);

            expect(company.assets[planet.id].deposits).toBe(1000);
            expect(gov.assets[planet.id].deposits).toBe(0);
        });

        it('skips untenanted entries', () => {
            planet.resources[arableLandResourceType.name] = [makeRenewableClaim({ tenantAgentId: null })];
            const agents = new Map([
                [gov.id, gov],
                [company.id, company],
            ]);

            claimBillingTick(agents, planet, 1);

            expect(company.assets[planet.id].deposits).toBe(1000);
        });
    });
});
