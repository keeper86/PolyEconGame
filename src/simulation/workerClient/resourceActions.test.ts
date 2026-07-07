import { describe, expect, it, vi } from 'vitest';
import { TICKS_PER_MONTH } from '../constants';
import { arableLandResourceType, ironOreDepositResourceType } from '../planet/landBoundResources';
import type { GameState } from '../planet/planet';
import { makeWorld } from '../utils/testHelper';
import type { OutboundMessage } from './messages';
import { makePool } from '../initialUniverse/resourceClaimFactory';
import { handleLeaseClaim, handleQuitClaim } from './resourceActions';

function makeMessages() {
    const messages: OutboundMessage[] = [];
    const post = vi.fn((msg: OutboundMessage) => messages.push(msg));
    return { messages, post };
}

function setupWorld(tick = 0) {
    const world = makeWorld({ companyIds: ['company-1'], tick });
    const { gameState, planet, gov, agents } = world;
    const company = agents.find((a) => a.id === 'company-1')!;
    company.assets[planet.id].deposits = 100_000;
    return { gameState, planet, gov, company };
}

function addRenewablePool(gameState: GameState, planetId: string, quantity = 10_000) {
    const planet = gameState.planets.get(planetId)!;
    planet.resources[arableLandResourceType.name] = {
        pool: makePool({ type: arableLandResourceType, quantity: quantity, renewable: true }),
        claims: [],
    };
}

function addNonRenewablePool(gameState: GameState, planetId: string, quantity = 10_000) {
    const planet = gameState.planets.get(planetId)!;
    planet.resources[ironOreDepositResourceType.name] = {
        pool: makePool({ type: ironOreDepositResourceType, quantity: quantity, renewable: false }),
        claims: [],
    };
}

describe('handleLeaseClaim', () => {
    describe('renewable resource (Arable Land)', () => {
        it('sets costPerTick based on quantity × cost-per-unit', () => {
            const { gameState, planet, company } = setupWorld();
            addRenewablePool(gameState, planet.id, 10_000);
            const { post } = makeMessages();

            handleLeaseClaim(
                gameState,
                {
                    type: 'leaseClaim',
                    requestId: 'r1',
                    agentId: company.id,
                    planetId: planet.id,
                    resourceName: arableLandResourceType.name,
                    quantity: 2000,
                },
                post,
            );

            const claim = planet.resources[arableLandResourceType.name].claims.find(
                (e) => e.tenantAgentId === company.id,
            );
            expect(claim).toBeDefined();
            expect(claim!.costPerTick).toBe(Math.floor(2000 * 1));
        });

        it('sets tenantCostInCoins to 0 for renewables', () => {
            const { gameState, planet, company } = setupWorld();
            addRenewablePool(gameState, planet.id, 10_000);
            const { post } = makeMessages();

            handleLeaseClaim(
                gameState,
                {
                    type: 'leaseClaim',
                    requestId: 'r1',
                    agentId: company.id,
                    planetId: planet.id,
                    resourceName: arableLandResourceType.name,
                    quantity: 2000,
                },
                post,
            );

            const claim = planet.resources[arableLandResourceType.name].claims.find(
                (e) => e.tenantAgentId === company.id,
            );
            expect(claim!.tenantCostInCoins).toBe(0);
        });

        it('sets claimStatus to active and noticePeriodEndsAtTick to null', () => {
            const { gameState, planet, company } = setupWorld();
            addRenewablePool(gameState, planet.id, 10_000);
            const { post } = makeMessages();

            handleLeaseClaim(
                gameState,
                {
                    type: 'leaseClaim',
                    requestId: 'r1',
                    agentId: company.id,
                    planetId: planet.id,
                    resourceName: arableLandResourceType.name,
                    quantity: 2000,
                },
                post,
            );

            const claim = planet.resources[arableLandResourceType.name].claims.find(
                (e) => e.tenantAgentId === company.id,
            );
            expect(claim!.claimStatus).toBe('active');
            expect(claim!.noticePeriodEndsAtTick).toBeNull();
        });

        it('emits claimLeased message on success', () => {
            const { gameState, planet, company } = setupWorld();
            addRenewablePool(gameState, planet.id, 10_000);
            const { messages, post } = makeMessages();

            handleLeaseClaim(
                gameState,
                {
                    type: 'leaseClaim',
                    requestId: 'r1',
                    agentId: company.id,
                    planetId: planet.id,
                    resourceName: arableLandResourceType.name,
                    quantity: 2000,
                },
                post,
            );

            expect(messages.find((m) => m.type === 'claimLeased')).toBeDefined();
        });

        it('reduces pool capacity by leased quantity', () => {
            const { gameState, planet, company } = setupWorld();
            addRenewablePool(gameState, planet.id, 10_000);
            const { post } = makeMessages();

            handleLeaseClaim(
                gameState,
                {
                    type: 'leaseClaim',
                    requestId: 'r1',
                    agentId: company.id,
                    planetId: planet.id,
                    resourceName: arableLandResourceType.name,
                    quantity: 2000,
                },
                post,
            );

            const pool = planet.resources[arableLandResourceType.name].pool;
            expect(pool.maximumCapacity).toBe(8000);
        });

        it('emits claimLeaseFailed when requested quantity exceeds available', () => {
            const { gameState, planet, company } = setupWorld();
            addRenewablePool(gameState, planet.id, 1000);
            const { messages, post } = makeMessages();

            handleLeaseClaim(
                gameState,
                {
                    type: 'leaseClaim',
                    requestId: 'r1',
                    agentId: company.id,
                    planetId: planet.id,
                    resourceName: arableLandResourceType.name,
                    quantity: 2000,
                },
                post,
            );

            expect(messages.find((m) => m.type === 'claimLeaseFailed')).toBeDefined();
        });

        it('deducts upfront cost of 1 month from agent deposits on lease', () => {
            const { gameState, planet, company } = setupWorld();
            addRenewablePool(gameState, planet.id, 10_000);
            const { post } = makeMessages();
            const initialDeposits = company.assets[planet.id].deposits;
            const quantity = 2000;
            const costPerTick = Math.floor(quantity * 1);
            const expectedUpfront = costPerTick * TICKS_PER_MONTH;

            handleLeaseClaim(
                gameState,
                {
                    type: 'leaseClaim',
                    requestId: 'r1',
                    agentId: company.id,
                    planetId: planet.id,
                    resourceName: arableLandResourceType.name,
                    quantity,
                },
                post,
            );

            expect(company.assets[planet.id].deposits).toBe(initialDeposits - expectedUpfront);
        });

        it('credits upfront cost to government deposits on lease', () => {
            const { gameState, planet, company, gov } = setupWorld();
            addRenewablePool(gameState, planet.id, 10_000);
            const { post } = makeMessages();
            const quantity = 2000;
            const costPerTick = Math.floor(quantity * 1);
            const expectedUpfront = costPerTick * TICKS_PER_MONTH;

            handleLeaseClaim(
                gameState,
                {
                    type: 'leaseClaim',
                    requestId: 'r1',
                    agentId: company.id,
                    planetId: planet.id,
                    resourceName: arableLandResourceType.name,
                    quantity,
                },
                post,
            );

            expect(gov.assets[planet.id].deposits).toBe(expectedUpfront);
        });

        it('emits claimLeaseFailed when agent cannot afford upfront cost', () => {
            const { gameState, planet, company } = setupWorld();
            addRenewablePool(gameState, planet.id, 10_000);
            company.assets[planet.id].deposits = 0;
            const { messages, post } = makeMessages();

            handleLeaseClaim(
                gameState,
                {
                    type: 'leaseClaim',
                    requestId: 'r1',
                    agentId: company.id,
                    planetId: planet.id,
                    resourceName: arableLandResourceType.name,
                    quantity: 2000,
                },
                post,
            );

            expect(messages.find((m) => m.type === 'claimLeaseFailed')).toBeDefined();
        });
    });

    describe('non-renewable resource (Iron Ore Deposit)', () => {
        it('sets tenantCostInCoins based on quantity × cost-per-unit', () => {
            const { gameState, planet, company } = setupWorld();
            addNonRenewablePool(gameState, planet.id, 10_000);
            const { post } = makeMessages();

            handleLeaseClaim(
                gameState,
                {
                    type: 'leaseClaim',
                    requestId: 'r1',
                    agentId: company.id,
                    planetId: planet.id,
                    resourceName: ironOreDepositResourceType.name,
                    quantity: 3000,
                },
                post,
            );

            const claim = planet.resources[ironOreDepositResourceType.name].claims.find(
                (e) => e.tenantAgentId === company.id,
            );
            expect(claim!.tenantCostInCoins).toBe(Math.floor(3000 * 1));
        });

        it('sets costPerTick to 0 for non-renewables', () => {
            const { gameState, planet, company } = setupWorld();
            addNonRenewablePool(gameState, planet.id, 10_000);
            const { post } = makeMessages();

            handleLeaseClaim(
                gameState,
                {
                    type: 'leaseClaim',
                    requestId: 'r1',
                    agentId: company.id,
                    planetId: planet.id,
                    resourceName: ironOreDepositResourceType.name,
                    quantity: 3000,
                },
                post,
            );

            const claim = planet.resources[ironOreDepositResourceType.name].claims.find(
                (e) => e.tenantAgentId === company.id,
            );
            expect(claim!.costPerTick).toBe(0);
        });
    });
});

describe('handleQuitClaim', () => {
    describe('renewable claim', () => {
        it('sets noticePeriodEndsAtTick and does not release immediately', () => {
            const { gameState, planet, company } = setupWorld(0);
            planet.resources[arableLandResourceType.name] = {
                pool: makePool({ type: arableLandResourceType, quantity: 0, renewable: true }),
                claims: [
                    {
                        id: 'arable-claim',
                        resource: arableLandResourceType,
                        quantity: 2000,
                        regenerationRate: 2000,
                        maximumCapacity: 2000,
                        tenantAgentId: company.id,
                        tenantCostInCoins: 0,
                        costPerTick: 20,
                        claimStatus: 'active' as const,
                        noticePeriodEndsAtTick: null,
                        pausedTicksThisYear: 0,
                    },
                ],
            };
            const { post } = makeMessages();

            handleQuitClaim(
                gameState,
                {
                    type: 'quitClaim',
                    requestId: 'r1',
                    agentId: company.id,
                    planetId: planet.id,
                    claimId: 'arable-claim',
                },
                post,
            );

            const claim = planet.resources[arableLandResourceType.name].claims.find((e) => e.id === 'arable-claim');
            expect(claim!.noticePeriodEndsAtTick).not.toBeNull();
            expect(claim!.tenantAgentId).toBe(company.id);
        });

        it('sets noticePeriodEndsAtTick to currentTick + TICKS_PER_MONTH', () => {
            const { gameState, planet, company } = setupWorld(50);
            planet.resources[arableLandResourceType.name] = {
                pool: makePool({ type: arableLandResourceType, quantity: 0, renewable: true }),
                claims: [
                    {
                        id: 'arable-claim',
                        resource: arableLandResourceType,
                        quantity: 2000,
                        regenerationRate: 2000,
                        maximumCapacity: 2000,
                        tenantAgentId: company.id,
                        tenantCostInCoins: 0,
                        costPerTick: 20,
                        claimStatus: 'active' as const,
                        noticePeriodEndsAtTick: null,
                        pausedTicksThisYear: 0,
                    },
                ],
            };
            const { post } = makeMessages();

            handleQuitClaim(
                gameState,
                {
                    type: 'quitClaim',
                    requestId: 'r1',
                    agentId: company.id,
                    planetId: planet.id,
                    claimId: 'arable-claim',
                },
                post,
            );

            const claim = planet.resources[arableLandResourceType.name].claims[0];
            expect(claim.noticePeriodEndsAtTick).toBe(50 + TICKS_PER_MONTH);
        });

        it('emits claimQuit message', () => {
            const { gameState, planet, company } = setupWorld(0);
            planet.resources[arableLandResourceType.name] = {
                pool: makePool({ type: arableLandResourceType, quantity: 0, renewable: true }),
                claims: [
                    {
                        id: 'arable-claim',
                        resource: arableLandResourceType,
                        quantity: 2000,
                        regenerationRate: 2000,
                        maximumCapacity: 2000,
                        tenantAgentId: company.id,
                        tenantCostInCoins: 0,
                        costPerTick: 20,
                        claimStatus: 'active' as const,
                        noticePeriodEndsAtTick: null,
                        pausedTicksThisYear: 0,
                    },
                ],
            };
            const { messages, post } = makeMessages();

            handleQuitClaim(
                gameState,
                {
                    type: 'quitClaim',
                    requestId: 'r1',
                    agentId: company.id,
                    planetId: planet.id,
                    claimId: 'arable-claim',
                },
                post,
            );

            expect(messages.find((m) => m.type === 'claimQuit')).toBeDefined();
        });
    });

    describe('non-renewable claim', () => {
        it('releases claim immediately (removed from claims array, merged back to pool)', () => {
            const { gameState, planet, company } = setupWorld(0);
            planet.resources[ironOreDepositResourceType.name] = {
                pool: makePool({ type: ironOreDepositResourceType, quantity: 0, renewable: false }),
                claims: [
                    {
                        id: 'iron-claim',
                        resource: ironOreDepositResourceType,
                        quantity: 5000,
                        regenerationRate: 0,
                        maximumCapacity: 5000,
                        tenantAgentId: company.id,
                        tenantCostInCoins: 50,
                        costPerTick: 0,
                        claimStatus: 'active' as const,
                        noticePeriodEndsAtTick: null,
                        pausedTicksThisYear: 0,
                    },
                ],
            };
            const { post } = makeMessages();

            handleQuitClaim(
                gameState,
                { type: 'quitClaim', requestId: 'r1', agentId: company.id, planetId: planet.id, claimId: 'iron-claim' },
                post,
            );

            const entries = planet.resources[ironOreDepositResourceType.name];
            expect(entries.claims).toHaveLength(0);
            expect(entries.pool.quantity).toBe(5000);
            expect(entries.pool.maximumCapacity).toBe(5000);
        });

        it('releases claim and merges quantity back into pool', () => {
            const { gameState, planet, company } = setupWorld(0);
            planet.resources[ironOreDepositResourceType.name] = {
                pool: makePool({ type: ironOreDepositResourceType, quantity: 0, renewable: false }),
                claims: [
                    {
                        id: 'iron-claim',
                        resource: ironOreDepositResourceType,
                        quantity: 5000,
                        regenerationRate: 0,
                        maximumCapacity: 5000,
                        tenantAgentId: company.id,
                        tenantCostInCoins: 50,
                        costPerTick: 0,
                        claimStatus: 'active' as const,
                        noticePeriodEndsAtTick: null,
                        pausedTicksThisYear: 0,
                    },
                ],
            };
            const { post } = makeMessages();

            handleQuitClaim(
                gameState,
                { type: 'quitClaim', requestId: 'r1', agentId: company.id, planetId: planet.id, claimId: 'iron-claim' },
                post,
            );

            const entry = planet.resources[ironOreDepositResourceType.name];
            expect(entry.claims).toHaveLength(0);
            expect(entry.pool.quantity).toBe(5000);
            expect(entry.pool.maximumCapacity).toBe(5000);
        });
    });

    it('emits claimQuitFailed when claim is not found', () => {
        const { gameState, planet, company } = setupWorld(0);
        const { messages, post } = makeMessages();

        handleQuitClaim(
            gameState,
            { type: 'quitClaim', requestId: 'r1', agentId: company.id, planetId: planet.id, claimId: 'nonexistent' },
            post,
        );

        expect(messages.find((m) => m.type === 'claimQuitFailed')).toBeDefined();
    });
});

describe('handleLeaseClaim auto-expand (claim already exists)', () => {
    it('recalculates costPerTick for renewable expansion', () => {
        const { gameState, planet, company } = setupWorld();
        const claimId = `${planet.id}-${arableLandResourceType.name}-${company.id}`;
        planet.resources[arableLandResourceType.name] = {
            pool: makePool({ type: arableLandResourceType, quantity: 8000, renewable: true }),
            claims: [
                {
                    id: claimId,
                    resource: arableLandResourceType,
                    quantity: 2000,
                    regenerationRate: 2000,
                    maximumCapacity: 2000,
                    tenantAgentId: company.id,
                    tenantCostInCoins: 0,
                    costPerTick: 2000,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };
        const { post } = makeMessages();

        handleLeaseClaim(
            gameState,
            {
                type: 'leaseClaim',
                requestId: 'r1',
                agentId: company.id,
                planetId: planet.id,
                resourceName: arableLandResourceType.name,
                quantity: 1000,
            },
            post,
        );

        const claim = planet.resources[arableLandResourceType.name].claims.find((e) => e.tenantAgentId === company.id);
        expect(claim!.maximumCapacity).toBe(3000);
        expect(claim!.costPerTick).toBe(Math.floor(3000 * 1));
        expect(claim!.tenantCostInCoins).toBe(0);
    });

    it('recalculates tenantCostInCoins for non-renewable expansion', () => {
        const { gameState, planet, company } = setupWorld();
        const claimId = `${planet.id}-${ironOreDepositResourceType.name}-${company.id}`;
        planet.resources[ironOreDepositResourceType.name] = {
            pool: makePool({ type: ironOreDepositResourceType, quantity: 7000, renewable: false }),
            claims: [
                {
                    id: claimId,
                    resource: ironOreDepositResourceType,
                    quantity: 3000,
                    regenerationRate: 0,
                    maximumCapacity: 3000,
                    tenantAgentId: company.id,
                    tenantCostInCoins: Math.floor(3000 * 1),
                    costPerTick: 0,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };
        const { post } = makeMessages();

        handleLeaseClaim(
            gameState,
            {
                type: 'leaseClaim',
                requestId: 'r1',
                agentId: company.id,
                planetId: planet.id,
                resourceName: ironOreDepositResourceType.name,
                quantity: 2000,
            },
            post,
        );

        const claim = planet.resources[ironOreDepositResourceType.name].claims.find(
            (e) => e.tenantAgentId === company.id,
        );
        expect(claim!.tenantCostInCoins).toBe(Math.floor(5000 * 1));
        expect(claim!.costPerTick).toBe(0);
    });

    it('emits claimLeaseFailed when pool has insufficient capacity', () => {
        const { gameState, planet, company } = setupWorld();
        const claimId = `${planet.id}-${arableLandResourceType.name}-${company.id}`;
        planet.resources[arableLandResourceType.name] = {
            pool: makePool({ type: arableLandResourceType, quantity: 500, renewable: true }),
            claims: [
                {
                    id: claimId,
                    resource: arableLandResourceType,
                    quantity: 2000,
                    regenerationRate: 2000,
                    maximumCapacity: 2000,
                    tenantAgentId: company.id,
                    tenantCostInCoins: 0,
                    costPerTick: 2000,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };
        const { messages, post } = makeMessages();

        handleLeaseClaim(
            gameState,
            {
                type: 'leaseClaim',
                requestId: 'r1',
                agentId: company.id,
                planetId: planet.id,
                resourceName: arableLandResourceType.name,
                quantity: 1000,
            },
            post,
        );

        expect(messages.find((m) => m.type === 'claimLeaseFailed')).toBeDefined();
    });

    it('deducts upfront cost (1 month) for renewable expansion', () => {
        const { gameState, planet, company } = setupWorld();
        const additionalQuantity = 1000;
        const costPerTick = Math.floor(additionalQuantity * 1);
        const expectedUpfront = costPerTick * TICKS_PER_MONTH;
        const initialDeposits = company.assets[planet.id].deposits;
        const claimId = `${planet.id}-${arableLandResourceType.name}-${company.id}`;
        planet.resources[arableLandResourceType.name] = {
            pool: makePool({ type: arableLandResourceType, quantity: 8000, renewable: true }),
            claims: [
                {
                    id: claimId,
                    resource: arableLandResourceType,
                    quantity: 2000,
                    regenerationRate: 2000,
                    maximumCapacity: 2000,
                    tenantAgentId: company.id,
                    tenantCostInCoins: 0,
                    costPerTick: 2000,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };
        const { post } = makeMessages();

        handleLeaseClaim(
            gameState,
            {
                type: 'leaseClaim',
                requestId: 'r1',
                agentId: company.id,
                planetId: planet.id,
                resourceName: arableLandResourceType.name,
                quantity: additionalQuantity,
            },
            post,
        );

        expect(company.assets[planet.id].deposits).toBe(initialDeposits - expectedUpfront);
    });

    it('emits claimLeaseFailed when agent cannot afford upfront cost for renewable expansion', () => {
        const { gameState, planet, company } = setupWorld();
        company.assets[planet.id].deposits = 0;
        const claimId = `${planet.id}-${arableLandResourceType.name}-${company.id}`;
        planet.resources[arableLandResourceType.name] = {
            pool: makePool({ type: arableLandResourceType, quantity: 8000, renewable: true }),
            claims: [
                {
                    id: claimId,
                    resource: arableLandResourceType,
                    quantity: 2000,
                    regenerationRate: 2000,
                    maximumCapacity: 2000,
                    tenantAgentId: company.id,
                    tenantCostInCoins: 0,
                    costPerTick: 2000,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };
        const { messages, post } = makeMessages();

        handleLeaseClaim(
            gameState,
            {
                type: 'leaseClaim',
                requestId: 'r1',
                agentId: company.id,
                planetId: planet.id,
                resourceName: arableLandResourceType.name,
                quantity: 1000,
            },
            post,
        );

        expect(messages.find((m) => m.type === 'claimLeaseFailed')).toBeDefined();
    });

    it('does not create a duplicate entry when leasing an already-leased resource', () => {
        const { gameState, planet, company } = setupWorld();
        const claimId = `${planet.id}-${arableLandResourceType.name}-${company.id}`;
        planet.resources[arableLandResourceType.name] = {
            pool: makePool({ type: arableLandResourceType, quantity: 8000, renewable: true }),
            claims: [
                {
                    id: claimId,
                    resource: arableLandResourceType,
                    quantity: 2000,
                    regenerationRate: 2000,
                    maximumCapacity: 2000,
                    tenantAgentId: company.id,
                    tenantCostInCoins: 0,
                    costPerTick: 2000,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };
        const { messages, post } = makeMessages();

        handleLeaseClaim(
            gameState,
            {
                type: 'leaseClaim',
                requestId: 'r1',
                agentId: company.id,
                planetId: planet.id,
                resourceName: arableLandResourceType.name,
                quantity: 1000,
            },
            post,
        );

        expect(messages.find((m) => m.type === 'claimLeased')).toBeDefined();
        const tenantEntries = planet.resources[arableLandResourceType.name].claims.filter(
            (e) => e.tenantAgentId === company.id,
        );
        expect(tenantEntries).toHaveLength(1);
        expect(tenantEntries[0]!.id).toBe(claimId);
    });
});
