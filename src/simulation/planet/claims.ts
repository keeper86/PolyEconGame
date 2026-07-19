import { TICKS_PER_MONTH } from '../constants';
import type { Agent, GameState, Planet } from './planet';

export type ResourceProcessLevel = 'raw' | 'refined' | 'manufactured' | 'services';

export type Resource = {
    name: string;
    form: 'solid' | 'liquid' | 'gas' | 'landBoundResource' | 'services' | 'currency';
    level: ResourceProcessLevel | 'source' | 'currency';
    volumePerQuantity: number;
    massPerQuantity: number;
};
export type ResourceType = Resource['form'];
export type TransportableResourceType = Exclude<ResourceType, 'services' | 'landBoundResource' | 'currency'>;
export type ResourceQuantity = {
    resource: Resource;
    quantity: number;
};

export type ClaimStatus = 'active' | 'paused';

/** The unleased, publicly-available pool of a resource on a planet. */
export type ResourcePool = {
    resource: Resource;
    quantity: number;
    regenerationRate: number;
    maximumCapacity: number;
};

export type ResourceClaim = ResourcePool & {
    id: string;
    tenantAgentId: string;
    tenantCostInCoins: number;
    costPerTick: number;
    claimStatus: ClaimStatus;
    noticePeriodEndsAtTick: number | null;
    pausedTicksThisYear: number;
};

export type ResourceEntry = {
    pool: ResourcePool;
    claims: ResourceClaim[];
};

export const isRenewableClaim = (claim: ResourceClaim): boolean => claim.regenerationRate > 0;

/** The free (unleased) capacity of a resource entry is simply its pool's maximumCapacity. */
export const getFreeCapacity = (entry: ResourceEntry): number => entry.pool.maximumCapacity;

export const queryClaimedResource = (planet: Planet, agent: Agent, resource: Resource): number => {
    const entry = planet.resources[resource.name];
    if (!entry) {
        console.warn(`Resource ${resource.name} not found on planet ${planet.name}`);
        return 0;
    }
    const tenantEntries = entry.claims.filter((c) => c.tenantAgentId === agent.id);
    if (!tenantEntries.length) {
        console.warn(`Agent ${agent.name} is not tenant of resource ${resource.name} on planet ${planet.name}`);
        return 0;
    }
    return tenantEntries.reduce((sum, c) => sum + c.quantity, 0);
};

export const extractFromClaimedResource = (
    planet: Planet,
    agent: Agent,
    resource: Resource,
    quantity: number,
): number => {
    const entry = planet.resources[resource.name];
    if (!entry) {
        console.warn(`Resource ${resource.name} not found on planet ${planet.name}`);
        return 0;
    }
    const tenantEntries = entry.claims.filter((c) => c.tenantAgentId === agent.id);
    if (!tenantEntries.length) {
        console.warn(`Agent ${agent.name} is not tenant of resource ${resource.name} on planet ${planet.name}`);
        return 0;
    }

    let extracted = 0;
    for (const claim of tenantEntries) {
        const available = claim.quantity;
        const toExtract = Math.min(available, quantity - extracted);
        claim.quantity -= toExtract;
        extracted += toExtract;
        if (extracted >= quantity) {
            break;
        }
    }
    return extracted;
};

export function getLandBoundCostPerUnit(planet: Planet, agentId: string, resourceName: string): number {
    const entry = planet.resources[resourceName];
    if (!entry) {
        return 0;
    }
    let totalCost = 0;
    let totalUnits = 0;
    for (const claim of entry.claims) {
        if (claim.tenantAgentId !== agentId) {
            continue;
        }
        if (claim.regenerationRate > 0) {
            totalCost += claim.costPerTick;
            totalUnits += claim.quantity;
        } else {
            totalCost += claim.tenantCostInCoins;
            totalUnits += claim.maximumCapacity;
        }
    }
    return totalUnits > 0 ? totalCost / totalUnits : 0;
}

export function mergeClaimBackIntoPool(pool: ResourcePool, claim: ResourceClaim): void {
    pool.quantity += claim.quantity;
    pool.regenerationRate += claim.regenerationRate;
    pool.maximumCapacity += claim.maximumCapacity;
}

export function computeLeaseClaimUpfrontCost(pool: ResourcePool, quantity: number): number {
    const costAmount = Math.floor(quantity);
    if (pool.regenerationRate > 0) {
        // Renewable: pay a month's worth upfront (costPerTick = units × 1)
        return costAmount * TICKS_PER_MONTH * 1;
    }
    // Non-renewable: pay one-time cost
    return costAmount * 1;
}

export type LeaseClaimResult = { ok: true; claimId: string } | { ok: false; reason: string };

export function leaseClaim(
    gameState: GameState,
    agentId: string,
    planetId: string,
    resourceName: string,
    quantity: number,
): LeaseClaimResult {
    const planet = gameState.planets.get(planetId);
    if (!planet) {
        return { ok: false, reason: 'Planet not found' };
    }
    const agent = gameState.agents.get(agentId);
    if (!agent) {
        return { ok: false, reason: 'Agent not found' };
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        return { ok: false, reason: `Agent has no assets on planet '${planetId}'` };
    }

    const entry = planet.resources[resourceName];
    if (!entry) {
        return { ok: false, reason: `Resource '${resourceName}' not found on planet` };
    }

    if (quantity <= 0) {
        return { ok: false, reason: 'Quantity must be positive' };
    }

    const { pool } = entry;
    if (pool.maximumCapacity < quantity) {
        return {
            ok: false,
            reason: `Not enough untenanted ${resourceName} — requested ${quantity}, available ${pool.maximumCapacity}`,
        };
    }

    const isRenewable = pool.regenerationRate > 0;
    const costAmount = Math.floor(quantity);
    const upfrontCost = computeLeaseClaimUpfrontCost(pool, quantity);

    if (assets.deposits < upfrontCost) {
        return {
            ok: false,
            reason: `Insufficient deposits — required ${upfrontCost} upfront, available ${assets.deposits}`,
        };
    }
    assets.deposits -= upfrontCost;
    const govAssets = gameState.agents.get(planet.governmentId)?.assets[planet.id];
    if (govAssets) {
        govAssets.deposits += upfrontCost;
    }
    assets.monthAcc.claimPayments += upfrontCost;

    const ratio = quantity / pool.maximumCapacity;
    const claimId = `${planetId}-${resourceName}-${agentId}`;
    const existingClaim = entry.claims.find((c) => c.id === claimId && c.tenantAgentId === agentId);

    if (existingClaim) {
        // Expand existing claim
        existingClaim.quantity += quantity;
        existingClaim.maximumCapacity += quantity;
        existingClaim.regenerationRate += pool.regenerationRate * ratio;
        if (isRenewable) {
            existingClaim.costPerTick = Math.floor(existingClaim.maximumCapacity * 1);
        } else {
            existingClaim.tenantCostInCoins += costAmount * 1;
        }

        // Update pool
        if (isRenewable) {
            pool.maximumCapacity -= quantity;
            pool.quantity -= quantity;
            pool.regenerationRate -= pool.regenerationRate * ratio;
        } else {
            pool.maximumCapacity -= quantity;
            pool.quantity -= quantity;
        }
    } else {
        // Create new claim
        const newClaim: ResourceClaim = {
            id: claimId,
            resource: pool.resource,
            quantity,
            regenerationRate: isRenewable ? pool.regenerationRate * ratio : 0,
            maximumCapacity: quantity,
            tenantAgentId: agentId,
            tenantCostInCoins: isRenewable ? 0 : costAmount,
            costPerTick: isRenewable ? costAmount : 0,
            claimStatus: 'active',
            noticePeriodEndsAtTick: null,
            pausedTicksThisYear: 0,
        };
        pool.quantity -= quantity;
        pool.regenerationRate -= newClaim.regenerationRate;
        pool.maximumCapacity -= quantity;
        entry.claims.push(newClaim);
    }

    return { ok: true, claimId };
}

export function reduceClaim(
    gameState: GameState,
    agentId: string,
    planetId: string,
    resourceName: string,
    quantity: number,
): LeaseClaimResult {
    const planet = gameState.planets.get(planetId);
    if (!planet) {
        return { ok: false, reason: 'Planet not found' };
    }
    const agent = gameState.agents.get(agentId);
    if (!agent) {
        return { ok: false, reason: 'Agent not found' };
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        return { ok: false, reason: `Agent has no assets on planet '${planetId}'` };
    }

    const entry = planet.resources[resourceName];
    if (!entry) {
        return { ok: false, reason: `Resource '${resourceName}' not found on planet` };
    }

    if (quantity <= 0) {
        return { ok: false, reason: 'Quantity must be positive' };
    }

    const claimId = `${planetId}-${resourceName}-${agentId}`;
    const existingClaim = entry.claims.find((c) => c.id === claimId && c.tenantAgentId === agentId);
    if (!existingClaim) {
        return { ok: false, reason: `No claim '${claimId}' found for agent` };
    }

    if (existingClaim.maximumCapacity < quantity) {
        return {
            ok: false,
            reason: `Claim only has ${existingClaim.maximumCapacity} units, cannot reduce by ${quantity}`,
        };
    }

    const { pool } = entry;
    const isRenewable = existingClaim.regenerationRate > 0;
    const ratio = quantity / existingClaim.maximumCapacity;

    // Capture the regen rate being returned before mutating the claim
    const regenToReturn = existingClaim.regenerationRate * ratio;

    // Reduce claim — clamp quantity to prevent going negative (extractFromClaimedResource may have consumed it)
    existingClaim.quantity = Math.max(0, existingClaim.quantity - quantity);
    existingClaim.maximumCapacity -= quantity;
    existingClaim.regenerationRate -= regenToReturn;
    if (isRenewable) {
        existingClaim.costPerTick = Math.floor(existingClaim.maximumCapacity * 1);
    } else {
        existingClaim.tenantCostInCoins = Math.max(0, existingClaim.tenantCostInCoins - quantity);
    }

    // Return to pool — mirror the pool deduction logic in leaseClaim
    if (isRenewable) {
        pool.maximumCapacity += quantity;
        pool.regenerationRate += regenToReturn;
    } else {
        pool.maximumCapacity += quantity;
        pool.quantity += quantity;
    }

    return { ok: true, claimId };
}
