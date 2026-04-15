import { type Agent, type Planet } from './planet';

export type ResourceProcessLevel = 'raw' | 'refined' | 'manufactured' | 'services';

export type Resource = {
    name: string;
    form: 'solid' | 'liquid' | 'gas' | 'pieces' | 'persons' | 'frozenGoods' | 'landBoundResource' | 'services';
    level: ResourceProcessLevel | 'source'; // raw, refined, manufactured, consumerGood
    volumePerQuantity: number; //  in cubic meters per ton or piece, used for cargo capacity calculations
    massPerQuantity: number; // in tons per ton or piece, used for mass capacity calculations, if not provided we assume 1:1 with volume-based quantity (e.g. 1 ton of water takes up 1 cubic meter, so massPerQuantity = 1)
};
export type ResourceType = Resource['form'];
export type TransportableResourceType = Exclude<ResourceType, 'services' | 'landBoundResource'>;
export type ResourceQuantity = {
    type: Resource;
    quantity: number; // in tons or pieces, depending on the phase
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

    // Sum all untenanted quantities
    const totalQuantity = untenanted.reduce((s, e) => s + e.quantity, 0);
    const totalRegen = untenanted.reduce((s, e) => s + e.regenerationRate, 0);
    const totalCap = untenanted.reduce((s, e) => s + e.maximumCapacity, 0);

    // Use the id of the first untenanted entry (or the provided collapsedId)
    const survivorId = collapsedId ?? untenanted[0].id;

    // Remove ALL untenanted entries
    const filtered = entries.filter((e) => e.tenantAgentId !== null);

    // Push back the single collapsed entry
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
