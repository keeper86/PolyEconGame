import type { Resource } from '../planet/claims';
import type { ResourceClaimEntry } from './helpers';

export function makeClaim(opts: {
    id: string;
    type: Resource;
    quantity: number;
    tenantAgentId: string | null;
    tenantCostInCoins?: number;
    costPerTick?: number;
    renewable?: boolean;
}): ResourceClaimEntry {
    const isRenewable = opts.renewable === true;
    const passedCost = opts.tenantCostInCoins ?? 0;
    return {
        id: opts.id,
        type: opts.type,
        quantity: opts.quantity,
        regenerationRate: isRenewable ? opts.quantity : 0,
        maximumCapacity: opts.quantity,
        tenantAgentId: opts.tenantAgentId,
        tenantCostInCoins: isRenewable ? 0 : (opts.tenantCostInCoins ?? 0),
        costPerTick: isRenewable ? (opts.costPerTick ?? passedCost) : 0,
        claimStatus: 'active',
        noticePeriodEndsAtTick: null,
        pausedTicksThisYear: 0,
    };
}

export function makeUnclaimedRemainder(opts: {
    idPrefix: string;
    type: Resource;
    total: number;
    existing: ResourceClaimEntry[];
    claimAgentId: string;
    renewable?: boolean;
}): ResourceClaimEntry | null {
    const used = opts.existing.reduce((sum, c) => sum + c.quantity, 0);
    const remaining = opts.total - used;
    if (remaining <= 0) {
        return null;
    }
    return makeClaim({
        id: `${opts.idPrefix}-unclaimed`,
        type: opts.type,
        quantity: remaining,
        tenantAgentId: null,
        renewable: opts.renewable,
    });
}
