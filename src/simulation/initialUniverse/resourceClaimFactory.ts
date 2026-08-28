import type { Resource, ResourcePool } from '../planet/claims';

export function makePool(opts: { type: Resource; quantity: number; renewable?: boolean }): ResourcePool {
    return {
        resource: opts.type,
        quantity: opts.quantity,
        regenerationRate: opts.renewable === true ? opts.quantity : 0,
        maximumCapacity: opts.quantity,
    };
}
