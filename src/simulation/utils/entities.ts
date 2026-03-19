import type { Resource } from '../planet/planet';
import { type Agent, type Planet } from '../planet/planet';

/**
 * Collapse all resource-claim entries for `resourceName` on `planet` that
 * have no tenant (tenantAgentId === null) into a single entry.
 *
 * The surviving entry keeps the id of the first untenanted entry found (or
 * uses the provided `collapsedId` if given) and accumulates the total
 * quantity / regenerationRate / maximumCapacity from all the merged entries.
 * Any extra untenanted entries are removed from the array.
 *
 * This is called before assigning a new tenant so that we always have exactly
 * one "pool" block to split from, regardless of how fragmented the claim list
 * has become over time.
 *
 * @returns The single collapsed entry, or `null` if there are no untenanted
 *          entries for this resource on this planet.
 */
export function collapseUntenantedClaims(
    planet: Planet,
    resourceName: string,
    collapsedId?: string,
): (import('../planet/planet').ResourceClaim & import('../planet/planet').ResourceQuantity) | null {
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
    const claimAgentId = untenanted[0].claimAgentId;

    // Remove ALL untenanted entries
    const filtered = entries.filter((e) => e.tenantAgentId !== null);

    // Push back the single collapsed entry
    const collapsed = {
        ...untenanted[0],
        id: survivorId,
        claimAgentId,
        tenantAgentId: null,
        tenantCostInCoins: 0,
        quantity: totalQuantity,
        regenerationRate: totalRegen,
        maximumCapacity: totalCap,
    };
    filtered.push(collapsed);
    planet.resources[resourceName] = filtered;

    return collapsed;
}

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
