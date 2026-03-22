import type { Resource } from '../planet/planet';
import type { ResourceClaimEntry } from './helpers';

export function makeClaim(opts: {
    id: string;
    type: Resource;
    quantity: number;
    claimAgentId: string;
    tenantAgentId: string | null;
    tenantCostInCoins?: number;
    renewable?: boolean;
}): ResourceClaimEntry {
    return {
        id: opts.id,
        type: opts.type,
        quantity: opts.quantity,
        regenerationRate: opts.renewable === false ? 0 : opts.quantity,
        maximumCapacity: opts.quantity,
        claimAgentId: opts.claimAgentId,
        tenantAgentId: opts.tenantAgentId,
        tenantCostInCoins: opts.tenantCostInCoins ?? 0,
    };
}

export function makeUnclaimedRemainder(opts: {
    idPrefix: string;
    type: Resource;
    total: number;
    existing: ResourceClaimEntry[];
    claimAgentId: string;
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
        claimAgentId: opts.claimAgentId,
        tenantAgentId: null,
    });
}
