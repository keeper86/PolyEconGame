import type { Resource, ResourceClaim, ResourcePool } from '../planet/claims';

export function makeClaim(opts: {
    id: string;
    type: Resource;
    quantity: number;
    tenantAgentId: string;
    tenantCostInCoins?: number;
    costPerTick?: number;
    renewable?: boolean;
}): ResourceClaim {
    const isRenewable = opts.renewable === true;
    return {
        id: opts.id,
        resource: opts.type,
        quantity: opts.quantity,
        regenerationRate: isRenewable ? opts.quantity : 0,
        maximumCapacity: opts.quantity,
        tenantAgentId: opts.tenantAgentId,
        tenantCostInCoins: isRenewable ? 0 : (opts.tenantCostInCoins ?? 0),
        costPerTick: isRenewable ? (opts.costPerTick ?? opts.quantity) : 0,
        claimStatus: 'active',
        noticePeriodEndsAtTick: null,
        pausedTicksThisYear: 0,
    };
}

export function makePool(opts: { type: Resource; quantity: number; renewable?: boolean }): ResourcePool {
    return {
        resource: opts.type,
        quantity: opts.quantity,
        regenerationRate: opts.renewable === true ? opts.quantity : 0,
        maximumCapacity: opts.quantity,
    };
}
