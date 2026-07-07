import { type Agent, type Planet } from './planet';

export type ResourceProcessLevel = 'raw' | 'refined' | 'manufactured' | 'services';

export type Resource = {
    name: string;
    form: 'solid' | 'liquid' | 'gas' | 'pieces' | 'landBoundResource' | 'services' | 'currency';
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
