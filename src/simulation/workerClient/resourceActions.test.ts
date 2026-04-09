import { describe, expect, it, vi } from 'vitest';
import { LAND_CLAIM_COST_PER_UNIT, TICKS_PER_MONTH } from '../constants';
import { arableLandResourceType, ironOreDepositResourceType } from '../planet/landBoundResources';
import type { GameState } from '../planet/planet';
import { makeWorld } from '../utils/testHelper';
import type { OutboundMessage } from './messages';
import { handleExpandClaim, handleLeaseClaim, handleQuitClaim } from './resourceActions';

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
    planet.resources[arableLandResourceType.name] = [
        {
            id: `${planetId}-arable-unclaimed`,
            type: arableLandResourceType,
            quantity,
            regenerationRate: quantity,
            maximumCapacity: quantity,
            tenantAgentId: null,
            tenantCostInCoins: 0,
            costPerTick: 0,
            claimStatus: 'active' as const,
            noticePeriodEndsAtTick: null,
        },
    ];
}

function addNonRenewablePool(gameState: GameState, planetId: string, quantity = 10_000) {
    const planet = gameState.planets.get(planetId)!;
    planet.resources[ironOreDepositResourceType.name] = [
        {
            id: `${planetId}-iron-unclaimed`,
            type: ironOreDepositResourceType,
            quantity,
            regenerationRate: 0,
            maximumCapacity: quantity,
            tenantAgentId: null,
            tenantCostInCoins: 0,
            costPerTick: 0,
            claimStatus: 'active' as const,
            noticePeriodEndsAtTick: null,
        },
    ];
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

            const claim = planet.resources[arableLandResourceType.name].find((e) => e.tenantAgentId === company.id);
            expect(claim).toBeDefined();
            expect(claim!.costPerTick).toBe(
                Math.floor(2000 * (LAND_CLAIM_COST_PER_UNIT[arableLandResourceType.name] ?? 1)),
            );
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

            const claim = planet.resources[arableLandResourceType.name].find((e) => e.tenantAgentId === company.id);
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

            const claim = planet.resources[arableLandResourceType.name].find((e) => e.tenantAgentId === company.id);
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

            const pool = planet.resources[arableLandResourceType.name].find((e) => e.tenantAgentId === null);
            expect(pool!.maximumCapacity).toBe(8000);
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

            const claim = planet.resources[ironOreDepositResourceType.name].find((e) => e.tenantAgentId === company.id);
            expect(claim!.tenantCostInCoins).toBe(
                Math.floor(3000 * (LAND_CLAIM_COST_PER_UNIT[ironOreDepositResourceType.name] ?? 1)),
            );
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

            const claim = planet.resources[ironOreDepositResourceType.name].find((e) => e.tenantAgentId === company.id);
            expect(claim!.costPerTick).toBe(0);
        });
    });
});

// ============================================================================
// handleQuitClaim
// ============================================================================

describe('handleQuitClaim', () => {
    describe('renewable claim', () => {
        it('sets noticePeriodEndsAtTick and does not release immediately', () => {
            const { gameState, planet, company } = setupWorld(0);
            planet.resources[arableLandResourceType.name] = [
                {
                    id: 'arable-claim',
                    type: arableLandResourceType,
                    quantity: 2000,
                    regenerationRate: 2000,
                    maximumCapacity: 2000,
                    tenantAgentId: company.id,
                    tenantCostInCoins: 0,
                    costPerTick: 20,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                },
            ];
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

            const claim = planet.resources[arableLandResourceType.name].find((e) => e.id === 'arable-claim');
            expect(claim!.noticePeriodEndsAtTick).not.toBeNull();
            expect(claim!.tenantAgentId).toBe(company.id);
        });

        it('sets noticePeriodEndsAtTick to currentTick + TICKS_PER_MONTH', () => {
            const { gameState, planet, company } = setupWorld(50);
            planet.resources[arableLandResourceType.name] = [
                {
                    id: 'arable-claim',
                    type: arableLandResourceType,
                    quantity: 2000,
                    regenerationRate: 2000,
                    maximumCapacity: 2000,
                    tenantAgentId: company.id,
                    tenantCostInCoins: 0,
                    costPerTick: 20,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                },
            ];
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

            const claim = planet.resources[arableLandResourceType.name][0];
            expect(claim.noticePeriodEndsAtTick).toBe(50 + TICKS_PER_MONTH);
        });

        it('emits claimQuit message', () => {
            const { gameState, planet, company } = setupWorld(0);
            planet.resources[arableLandResourceType.name] = [
                {
                    id: 'arable-claim',
                    type: arableLandResourceType,
                    quantity: 2000,
                    regenerationRate: 2000,
                    maximumCapacity: 2000,
                    tenantAgentId: company.id,
                    tenantCostInCoins: 0,
                    costPerTick: 20,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                },
            ];
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
        it('releases claim immediately (tenantAgentId set to null)', () => {
            const { gameState, planet, company } = setupWorld(0);
            planet.resources[ironOreDepositResourceType.name] = [
                {
                    id: 'iron-claim',
                    type: ironOreDepositResourceType,
                    quantity: 5000,
                    regenerationRate: 0,
                    maximumCapacity: 5000,
                    tenantAgentId: company.id,
                    tenantCostInCoins: 50,
                    costPerTick: 0,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                },
            ];
            const { post } = makeMessages();

            handleQuitClaim(
                gameState,
                { type: 'quitClaim', requestId: 'r1', agentId: company.id, planetId: planet.id, claimId: 'iron-claim' },
                post,
            );

            const entries = planet.resources[ironOreDepositResourceType.name];
            expect(entries.every((e) => e.tenantAgentId === null)).toBe(true);
        });

        it('resets tenantCostInCoins to 0 on immediate release', () => {
            const { gameState, planet, company } = setupWorld(0);
            planet.resources[ironOreDepositResourceType.name] = [
                {
                    id: 'iron-claim',
                    type: ironOreDepositResourceType,
                    quantity: 5000,
                    regenerationRate: 0,
                    maximumCapacity: 5000,
                    tenantAgentId: company.id,
                    tenantCostInCoins: 50,
                    costPerTick: 0,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                },
            ];
            const { post } = makeMessages();

            handleQuitClaim(
                gameState,
                { type: 'quitClaim', requestId: 'r1', agentId: company.id, planetId: planet.id, claimId: 'iron-claim' },
                post,
            );

            const pool = planet.resources[ironOreDepositResourceType.name][0];
            expect(pool.tenantCostInCoins).toBe(0);
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

// ============================================================================
// handleExpandClaim
// ============================================================================

describe('handleExpandClaim', () => {
    it('recalculates costPerTick for renewable expansion', () => {
        const { gameState, planet, company } = setupWorld();
        planet.resources[arableLandResourceType.name] = [
            {
                id: 'arable-claim',
                type: arableLandResourceType,
                quantity: 2000,
                regenerationRate: 2000,
                maximumCapacity: 2000,
                tenantAgentId: company.id,
                tenantCostInCoins: 0,
                costPerTick: 2000,
                claimStatus: 'active' as const,
                noticePeriodEndsAtTick: null,
            },
            {
                id: 'arable-pool',
                type: arableLandResourceType,
                quantity: 8000,
                regenerationRate: 8000,
                maximumCapacity: 8000,
                tenantAgentId: null,
                tenantCostInCoins: 0,
                costPerTick: 0,
                claimStatus: 'active' as const,
                noticePeriodEndsAtTick: null,
            },
        ];
        const { post } = makeMessages();

        handleExpandClaim(
            gameState,
            {
                type: 'expandClaim',
                requestId: 'r1',
                agentId: company.id,
                planetId: planet.id,
                claimId: 'arable-claim',
                additionalQuantity: 1000,
            },
            post,
        );

        const claim = planet.resources[arableLandResourceType.name].find((e) => e.tenantAgentId === company.id);
        expect(claim!.maximumCapacity).toBe(3000);
        expect(claim!.costPerTick).toBe(
            Math.floor(3000 * (LAND_CLAIM_COST_PER_UNIT[arableLandResourceType.name] ?? 1)),
        );
        expect(claim!.tenantCostInCoins).toBe(0);
    });

    it('recalculates tenantCostInCoins for non-renewable expansion', () => {
        const { gameState, planet, company } = setupWorld();
        planet.resources[ironOreDepositResourceType.name] = [
            {
                id: 'iron-claim',
                type: ironOreDepositResourceType,
                quantity: 3000,
                regenerationRate: 0,
                maximumCapacity: 3000,
                tenantAgentId: company.id,
                tenantCostInCoins: Math.floor(3000 * (LAND_CLAIM_COST_PER_UNIT[ironOreDepositResourceType.name] ?? 1)),
                costPerTick: 0,
                claimStatus: 'active' as const,
                noticePeriodEndsAtTick: null,
            },
            {
                id: 'iron-pool',
                type: ironOreDepositResourceType,
                quantity: 7000,
                regenerationRate: 0,
                maximumCapacity: 7000,
                tenantAgentId: null,
                tenantCostInCoins: 0,
                costPerTick: 0,
                claimStatus: 'active' as const,
                noticePeriodEndsAtTick: null,
            },
        ];
        const { post } = makeMessages();

        handleExpandClaim(
            gameState,
            {
                type: 'expandClaim',
                requestId: 'r1',
                agentId: company.id,
                planetId: planet.id,
                claimId: 'iron-claim',
                additionalQuantity: 2000,
            },
            post,
        );

        const claim = planet.resources[ironOreDepositResourceType.name].find((e) => e.tenantAgentId === company.id);
        expect(claim!.tenantCostInCoins).toBe(
            Math.floor(5000 * (LAND_CLAIM_COST_PER_UNIT[ironOreDepositResourceType.name] ?? 1)),
        );
        expect(claim!.costPerTick).toBe(0);
    });

    it('emits claimExpandFailed when pool has insufficient capacity', () => {
        const { gameState, planet, company } = setupWorld();
        planet.resources[arableLandResourceType.name] = [
            {
                id: 'arable-claim',
                type: arableLandResourceType,
                quantity: 2000,
                regenerationRate: 2000,
                maximumCapacity: 2000,
                tenantAgentId: company.id,
                tenantCostInCoins: 0,
                costPerTick: 2000,
                claimStatus: 'active' as const,
                noticePeriodEndsAtTick: null,
            },
            {
                id: 'arable-pool',
                type: arableLandResourceType,
                quantity: 500,
                regenerationRate: 500,
                maximumCapacity: 500,
                tenantAgentId: null,
                tenantCostInCoins: 0,
                costPerTick: 0,
                claimStatus: 'active' as const,
                noticePeriodEndsAtTick: null,
            },
        ];
        const { messages, post } = makeMessages();

        handleExpandClaim(
            gameState,
            {
                type: 'expandClaim',
                requestId: 'r1',
                agentId: company.id,
                planetId: planet.id,
                claimId: 'arable-claim',
                additionalQuantity: 1000,
            },
            post,
        );

        expect(messages.find((m) => m.type === 'claimExpandFailed')).toBeDefined();
    });
});
