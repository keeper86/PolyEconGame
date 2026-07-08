import { describe, expect, it } from 'vitest';
import { makePool } from '../initialUniverse/resourceClaimFactory';
import { makeAgent, makeGameState, makeGovernmentAgent, makePlanet, makeProductionFacility } from '../utils/testHelper';
import { updateAgentClaims } from './automaticClaimManagement';
import { arableLandResourceType, coalDepositResourceType } from './landBoundResources';
import { produceResourceType } from './resources';
import { TICKS_PER_MONTH } from '../constants';

describe('updateAgentClaims', () => {
    it('leases renewable claim when facility needs exceed current capacity', () => {
        const gov = makeGovernmentAgent('gov-1', 'test-p');
        const planet = makePlanet({ id: 'test-p', governmentId: gov.id });

        planet.resources[arableLandResourceType.name] = {
            pool: makePool({ type: arableLandResourceType, quantity: 10_000, renewable: true }),
            claims: [],
        };

        const agent = makeAgent('auto-1', 'test-p', 'Auto Agent');
        agent.automated = true;
        agent.assets['test-p'].deposits = 1_000_000;

        const amountPerTick = 100;
        const scale = 10;
        const facility = makeProductionFacility(undefined, {
            planetId: 'test-p',
            id: 'farm-1',
            name: 'Test Farm',
            maxScale: scale,
            scale,
            needs: [{ resource: arableLandResourceType, quantity: amountPerTick }],
            produces: [{ resource: produceResourceType, quantity: 0 }],
        });
        agent.assets['test-p'].productionFacilities = [facility];

        const gameState = makeGameState([planet], [gov, agent]);

        const claimBefore = planet.resources[arableLandResourceType.name].claims.find(
            (c) => c.tenantAgentId === agent.id,
        );
        expect(claimBefore).not.toBeDefined();

        updateAgentClaims(gameState, planet);

        const claim = planet.resources[arableLandResourceType.name].claims.find((c) => c.tenantAgentId === agent.id);
        expect(claim).toBeDefined();
        expect(claim!.maximumCapacity).toBe(amountPerTick * scale);
        expect(claim!.costPerTick).toBe(amountPerTick * scale);
    });

    it('expands existing renewable claim when facility needs exceed', () => {
        const gov = makeGovernmentAgent('gov-1', 'test-p');
        const planet = makePlanet({ id: 'test-p', governmentId: gov.id });

        const claimId = 'test-p-Arable Land-auto-1';
        const originalCapacity = 500;
        planet.resources[arableLandResourceType.name] = {
            pool: makePool({ type: arableLandResourceType, quantity: 9500, renewable: true }),
            claims: [
                {
                    id: claimId,
                    resource: arableLandResourceType,
                    quantity: originalCapacity,
                    regenerationRate: originalCapacity,
                    maximumCapacity: originalCapacity,
                    tenantAgentId: 'auto-1',
                    tenantCostInCoins: 0,
                    costPerTick: originalCapacity,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };

        const agent = makeAgent('auto-1', 'test-p', 'Auto Agent');
        agent.automated = true;
        agent.assets['test-p'].deposits = 1_000_000;

        const amountPerTick = 100;
        const scale = 10;
        const facility = makeProductionFacility(undefined, {
            planetId: 'test-p',
            id: 'farm-1',
            name: 'Test Farm',
            maxScale: scale,
            scale,
            needs: [{ resource: arableLandResourceType, quantity: amountPerTick }],
            produces: [{ resource: arableLandResourceType, quantity: 0 }],
        });
        agent.assets['test-p'].productionFacilities = [facility];

        const gameState = makeGameState([planet], [gov, agent]);

        const claimBefore = planet.resources[arableLandResourceType.name].claims.find(
            (c) => c.tenantAgentId === agent.id,
        );
        expect(claimBefore).toBeDefined();
        expect(claimBefore!.maximumCapacity).toBe(originalCapacity);
        expect(claimBefore!.costPerTick).toBe(originalCapacity);

        updateAgentClaims(gameState, planet);

        const claim = planet.resources[arableLandResourceType.name].claims.find((c) => c.tenantAgentId === agent.id);
        expect(claim).toBeDefined();
        expect(claim!.maximumCapacity).toBe(amountPerTick * scale);
        expect(claim!.costPerTick).toBe(amountPerTick * scale);
    });

    it('leases non-renewable claim when facility needs exceed', () => {
        const gov = makeGovernmentAgent('gov-1', 'test-p');
        const planet = makePlanet({ id: 'test-p', governmentId: gov.id });

        const poolQuantity = 10_000;
        planet.resources[coalDepositResourceType.name] = {
            pool: makePool({ type: coalDepositResourceType, quantity: poolQuantity, renewable: false }),
            claims: [],
        };

        const agent = makeAgent('auto-1', 'test-p', 'Auto Agent');
        agent.automated = true;
        agent.assets['test-p'].deposits = 1_000_000;

        const amountPerTick = 100;
        const scale = 5;
        const required = amountPerTick * scale; // 500
        const shortfall = TICKS_PER_MONTH * required; // 30 * 500 = 15000
        const expectedToAcquire = Math.min(shortfall, poolQuantity); // 10000

        const facility = makeProductionFacility(undefined, {
            planetId: 'test-p',
            id: 'mine-1',
            name: 'Test Mine',
            maxScale: scale,
            scale,
            needs: [{ resource: coalDepositResourceType, quantity: amountPerTick }],
            produces: [{ resource: coalDepositResourceType, quantity: 0 }],
        });
        agent.assets['test-p'].productionFacilities = [facility];

        const gameState = makeGameState([planet], [gov, agent]);

        const claimBefore = planet.resources[coalDepositResourceType.name].claims.find(
            (c) => c.tenantAgentId === agent.id,
        );
        expect(claimBefore).not.toBeDefined();

        updateAgentClaims(gameState, planet);

        const claim = planet.resources[coalDepositResourceType.name].claims.find((c) => c.tenantAgentId === agent.id);
        expect(claim).toBeDefined();
        expect(claim!.quantity).toBe(expectedToAcquire);
        expect(claim!.maximumCapacity).toBe(expectedToAcquire);
    });

    it('expands existing non-renewable claim when facility needs exceed', () => {
        const gov = makeGovernmentAgent('gov-1', 'test-p');
        const planet = makePlanet({ id: 'test-p', governmentId: gov.id });

        const poolQuantity = 10_000;
        const existingClaimQuantity = 3000;
        const amountPerTick = 100;
        const scale = 5;
        const required = amountPerTick * scale; // 500
        // currentCapacityInTicks = 3000 / 500 = 6
        const currentCapacityInTicks = existingClaimQuantity / required;
        // shortfall = (30 - 6) * 500 = 12000
        const shortfall = (TICKS_PER_MONTH - currentCapacityInTicks) * required;

        // Create existing claim (simulates a claim already taken from pool)
        const claimId = 'test-p-Coal Deposit-auto-1';
        planet.resources[coalDepositResourceType.name] = {
            pool: makePool({ type: coalDepositResourceType, quantity: poolQuantity, renewable: false }),
            claims: [
                {
                    id: claimId,
                    resource: coalDepositResourceType,
                    quantity: existingClaimQuantity,
                    regenerationRate: 0,
                    maximumCapacity: existingClaimQuantity,
                    tenantAgentId: 'auto-1',
                    tenantCostInCoins: existingClaimQuantity,
                    costPerTick: 0,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };

        const agent = makeAgent('auto-1', 'test-p', 'Auto Agent');
        agent.automated = true;
        agent.assets['test-p'].deposits = 1_000_000;

        // shortfall = 12000, available = 10000, toAcquire = 10000
        const expectedToAcquire = Math.min(shortfall, poolQuantity); // 10000
        const expectedTotalQuantity = existingClaimQuantity + expectedToAcquire; // 13000

        const facility = makeProductionFacility(undefined, {
            planetId: 'test-p',
            id: 'mine-1',
            name: 'Test Mine',
            maxScale: scale,
            scale,
            needs: [{ resource: coalDepositResourceType, quantity: amountPerTick }],
            produces: [{ resource: coalDepositResourceType, quantity: 0 }],
        });
        agent.assets['test-p'].productionFacilities = [facility];

        const gameState = makeGameState([planet], [gov, agent]);

        const claimBefore = planet.resources[coalDepositResourceType.name].claims.find(
            (c) => c.tenantAgentId === agent.id,
        );
        expect(claimBefore).toBeDefined();
        expect(claimBefore!.quantity).toBe(existingClaimQuantity);

        updateAgentClaims(gameState, planet);

        const claim = planet.resources[coalDepositResourceType.name].claims.find((c) => c.tenantAgentId === agent.id);
        expect(claim).toBeDefined();
        expect(claim!.quantity).toBe(expectedTotalQuantity);
        expect(claim!.maximumCapacity).toBe(expectedTotalQuantity);
        // Pool should have been reduced accordingly
        expect(planet.resources[coalDepositResourceType.name].pool.quantity).toBe(poolQuantity - expectedToAcquire);
    });

    it('skips non-automated agents', () => {
        const gov = makeGovernmentAgent('gov-1', 'test-p');
        const planet = makePlanet({ id: 'test-p', governmentId: gov.id });

        planet.resources[arableLandResourceType.name] = {
            pool: makePool({ type: arableLandResourceType, quantity: 10_000, renewable: true }),
            claims: [],
        };

        const agent = makeAgent('auto-1', 'test-p', 'Auto Agent');
        agent.automated = false; // NOT automated
        agent.assets['test-p'].deposits = 1_000_000;

        const facility = makeProductionFacility(undefined, {
            planetId: 'test-p',
            id: 'farm-1',
            name: 'Test Farm',
            maxScale: 10,
            scale: 10,
            needs: [{ resource: arableLandResourceType, quantity: 100 }],
            produces: [{ resource: arableLandResourceType, quantity: 0 }],
        });
        agent.assets['test-p'].productionFacilities = [facility];

        const gameState = makeGameState([planet], [gov, agent]);

        updateAgentClaims(gameState, planet);

        const claim = planet.resources[arableLandResourceType.name].claims.find((c) => c.tenantAgentId === agent.id);
        expect(claim).toBeUndefined();
    });

    it('reduces oversupplied renewable claim', () => {
        const gov = makeGovernmentAgent('gov-1', 'test-p');
        const planet = makePlanet({ id: 'test-p', governmentId: gov.id });

        // Agent has a renewable claim that's 2x what's needed
        const amountPerTick = 100;
        const scale = 10;
        const required = amountPerTick * scale; // 1000
        const claimedCapacity = required * 2; // 2000
        const agent = makeAgent('auto-1', 'test-p', 'Auto Agent');
        agent.automated = true;
        agent.assets['test-p'].deposits = 1_000_000;

        const claimId = 'test-p-Arable Land-auto-1';
        planet.resources[arableLandResourceType.name] = {
            pool: makePool({ type: arableLandResourceType, quantity: 10_000, renewable: true }),
            claims: [
                {
                    id: claimId,
                    resource: arableLandResourceType,
                    quantity: claimedCapacity,
                    regenerationRate: claimedCapacity,
                    maximumCapacity: claimedCapacity,
                    tenantAgentId: 'auto-1',
                    tenantCostInCoins: 0,
                    costPerTick: claimedCapacity,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };

        const facility = makeProductionFacility(undefined, {
            planetId: 'test-p',
            id: 'farm-1',
            name: 'Test Farm',
            maxScale: scale,
            scale,
            needs: [{ resource: arableLandResourceType, quantity: amountPerTick }],
            produces: [{ resource: arableLandResourceType, quantity: 0 }],
        });
        agent.assets['test-p'].productionFacilities = [facility];

        const gameState = makeGameState([planet], [gov, agent]);

        updateAgentClaims(gameState, planet);

        // Claim should have been reduced from 2000 to 1000 (1x requirement)
        const claim = planet.resources[arableLandResourceType.name].claims.find((c) => c.tenantAgentId === agent.id);
        expect(claim).toBeDefined();
        expect(claim!.maximumCapacity).toBe(required);
        expect(claim!.regenerationRate).toBe(required);
        // Pool should have received the returned capacity
        expect(planet.resources[arableLandResourceType.name].pool.maximumCapacity).toBe(
            10_000 + claimedCapacity - required,
        );
    });

    it('reduces oversupplied non-renewable claim', () => {
        const gov = makeGovernmentAgent('gov-1', 'test-p');
        const planet = makePlanet({ id: 'test-p', governmentId: gov.id });

        // Agent has a non-renewable claim that's 2x the safety margin
        const amountPerTick = 100;
        const scale = 5;
        const required = amountPerTick * scale; // 500
        const safetyQuantity = TICKS_PER_MONTH * required; // 15000
        const claimedQuantity = safetyQuantity * 2; // 30000 — oversupplied
        const agent = makeAgent('auto-1', 'test-p', 'Auto Agent');
        agent.automated = true;
        agent.assets['test-p'].deposits = 1_000_000;

        const claimId = 'test-p-Coal Deposit-auto-1';
        const poolQuantity = 50_000;
        planet.resources[coalDepositResourceType.name] = {
            pool: makePool({ type: coalDepositResourceType, quantity: poolQuantity, renewable: false }),
            claims: [
                {
                    id: claimId,
                    resource: coalDepositResourceType,
                    quantity: claimedQuantity,
                    regenerationRate: 0,
                    maximumCapacity: claimedQuantity,
                    tenantAgentId: 'auto-1',
                    tenantCostInCoins: claimedQuantity,
                    costPerTick: 0,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };

        const facility = makeProductionFacility(undefined, {
            planetId: 'test-p',
            id: 'mine-1',
            name: 'Test Mine',
            maxScale: scale,
            scale,
            needs: [{ resource: coalDepositResourceType, quantity: amountPerTick }],
            produces: [{ resource: coalDepositResourceType, quantity: 0 }],
        });
        agent.assets['test-p'].productionFacilities = [facility];

        const gameState = makeGameState([planet], [gov, agent]);

        updateAgentClaims(gameState, planet);

        // Claim should have been reduced from 30000 towards safetyQuantity (15000)
        // The excess is safetyQuantity, so claim should be at safetyQuantity
        const claim = planet.resources[coalDepositResourceType.name].claims.find((c) => c.tenantAgentId === agent.id);
        expect(claim).toBeDefined();
        expect(claim!.maximumCapacity).toBe(safetyQuantity);
        // Pool should have received back what was reduced
        expect(planet.resources[coalDepositResourceType.name].pool.quantity).toBe(
            poolQuantity + (claimedQuantity - safetyQuantity),
        );
    });

    it('does not reduce claim when oversupply is below the limit threshold', () => {
        const gov = makeGovernmentAgent('gov-1', 'test-p');
        const planet = makePlanet({ id: 'test-p', governmentId: gov.id });

        // Agent has a claim that's only slightly above requirements (1.2x — below 1.5x limit)
        const amountPerTick = 100;
        const scale = 10;
        const required = amountPerTick * scale; // 1000
        const claimedCapacity = Math.floor(required * 1.2); // 1200
        const agent = makeAgent('auto-1', 'test-p', 'Auto Agent');
        agent.automated = true;
        agent.assets['test-p'].deposits = 1_000_000;

        const claimId = 'test-p-Arable Land-auto-1';
        planet.resources[arableLandResourceType.name] = {
            pool: makePool({ type: arableLandResourceType, quantity: 10_000, renewable: true }),
            claims: [
                {
                    id: claimId,
                    resource: arableLandResourceType,
                    quantity: claimedCapacity,
                    regenerationRate: claimedCapacity,
                    maximumCapacity: claimedCapacity,
                    tenantAgentId: 'auto-1',
                    tenantCostInCoins: 0,
                    costPerTick: claimedCapacity,
                    claimStatus: 'active' as const,
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                },
            ],
        };

        const facility = makeProductionFacility(undefined, {
            planetId: 'test-p',
            id: 'farm-1',
            name: 'Test Farm',
            maxScale: scale,
            scale,
            needs: [{ resource: arableLandResourceType, quantity: amountPerTick }],
            produces: [{ resource: arableLandResourceType, quantity: 0 }],
        });
        agent.assets['test-p'].productionFacilities = [facility];

        const gameState = makeGameState([planet], [gov, agent]);

        updateAgentClaims(gameState, planet);

        // Claim should remain unchanged (1200)
        const claim = planet.resources[arableLandResourceType.name].claims.find((c) => c.tenantAgentId === agent.id);
        expect(claim).toBeDefined();
        expect(claim!.maximumCapacity).toBe(claimedCapacity);
    });

    it('handles agents with no land-bound resource needs', () => {
        const gov = makeGovernmentAgent('gov-1', 'test-p');
        const planet = makePlanet({ id: 'test-p', governmentId: gov.id });

        planet.resources[arableLandResourceType.name] = {
            pool: makePool({ type: arableLandResourceType, quantity: 10_000, renewable: true }),
            claims: [],
        };

        const agent = makeAgent('auto-1', 'test-p', 'Auto Agent');
        agent.automated = true;
        agent.assets['test-p'].deposits = 1_000_000;

        // Facility with no needs at all
        const facility = makeProductionFacility(undefined, {
            planetId: 'test-p',
            id: 'factory-1',
            name: 'Test Factory',
            needs: [],
            produces: [],
        });
        agent.assets['test-p'].productionFacilities = [facility];

        const gameState = makeGameState([planet], [gov, agent]);

        expect(() => updateAgentClaims(gameState, planet)).not.toThrow();
        const claims = planet.resources[arableLandResourceType.name].claims.filter((c) => c.tenantAgentId === agent.id);
        expect(claims).toHaveLength(0);
    });
});
