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

export type ResourceClaim = {
    id: string;
    tenantAgentId: string | null;
    tenantCostInCoins: number;
    costPerTick: number;
    claimStatus: ClaimStatus;
    noticePeriodEndsAtTick: number | null;
    pausedTicksThisYear: number;
    regenerationRate: number;
    maximumCapacity: number;
};

export function collapseUntenantedClaims(
    planet: Planet,
    resourceName: string,
    collapsedId?: string,
): (ResourceClaim & ResourceQuantity) | null {
    const entries = planet.resources[resourceName];
    if (!entries) {
        return null;
    }

    const untenanted = entries.filter((e) => e.tenantAgentId === null);
    if (untenanted.length === 0) {
        return null;
    }

    const totalQuantity = untenanted.reduce((s, e) => s + e.quantity, 0);
    const totalRegen = untenanted.reduce((s, e) => s + e.regenerationRate, 0);
    const totalCap = untenanted.reduce((s, e) => s + e.maximumCapacity, 0);

    const survivorId = collapsedId ?? untenanted[0].id;

    const filtered = entries.filter((e) => e.tenantAgentId !== null);

    const collapsed = {
        ...untenanted[0],
        id: survivorId,
        tenantAgentId: null,
        tenantCostInCoins: 0,
        costPerTick: 0,
        claimStatus: 'active' as const,
        noticePeriodEndsAtTick: null,
        quantity: totalQuantity,
        regenerationRate: totalRegen,
        maximumCapacity: totalCap,
    };
    filtered.push(collapsed);
    planet.resources[resourceName] = filtered;

    return collapsed;
}

export const isRenewableClaim = (claim: ResourceClaim): boolean => claim.regenerationRate > 0;

export const queryClaimedResource = (planet: Planet, agent: Agent, resource: Resource): number => {
    const resourceEntries = planet.resources[resource.name];
    if (!resourceEntries) {
        console.warn(`Resource ${resource.name} not found on planet ${planet.name}`);
        return 0;
    }
    const tenantEntries = resourceEntries.filter((entry) => entry.tenantAgentId === agent.id);
    if (!tenantEntries.length) {
        console.warn(`Agent ${agent.name} is not tenant of resource ${resource.name} on planet ${planet.name}`);
        return 0;
    }
    return tenantEntries.reduce((sum, entry) => sum + entry.quantity, 0);
};

export const extractFromClaimedResource = (
    planet: Planet,
    agent: Agent,
    resource: Resource,
    quantity: number,
): number => {
    const resourceEntries = planet.resources[resource.name];
    if (!resourceEntries) {
        console.warn(`Resource ${resource.name} not found on planet ${planet.name}`);
        return 0;
    }
    const tenantEntries = resourceEntries.filter((entry) => entry.tenantAgentId === agent.id);
    if (!tenantEntries.length) {
        console.warn(`Agent ${agent.name} is not tenant of resource ${resource.name} on planet ${planet.name}`);
        return 0;
    }

    let extracted = 0;
    for (const entry of tenantEntries) {
        const available = entry.quantity;
        const toExtract = Math.min(available, quantity - extracted);
        entry.quantity -= toExtract;
        extracted += toExtract;
        if (extracted >= quantity) {
            break;
        }
    }
    return extracted;
};

export function getLandBoundCostPerUnit(planet: Planet, agentId: string, resourceName: string): number {
    const entries = planet.resources[resourceName];
    if (!entries) {
        return 0;
    }
    let totalCost = 0;
    let totalUnits = 0;
    for (const entry of entries) {
        if (entry.tenantAgentId !== agentId) {
            continue;
        }
        if (entry.regenerationRate > 0) {
            totalCost += entry.costPerTick;
            totalUnits += entry.quantity;
        } else {
            totalCost += entry.tenantCostInCoins;
            totalUnits += entry.maximumCapacity;
        }
    }
    return totalUnits > 0 ? totalCost / totalUnits : 0;
}
