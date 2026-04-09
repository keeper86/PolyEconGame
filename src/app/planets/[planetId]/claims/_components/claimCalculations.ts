import { CLAIM_CONSUMPTION_PER_TICK_AT_SCALE1, LAND_CLAIM_COST_PER_UNIT, TICKS_PER_YEAR } from '@/simulation/constants';

export const SY_TIERS = [1, 10, 100, 1000, 10000, 100000] as const;

export function calcClaimQuantity(resourceName: string, tierIndex: number, renewable: boolean): number {
    const sy = SY_TIERS[tierIndex] ?? 1;
    const consumptionPerTick = CLAIM_CONSUMPTION_PER_TICK_AT_SCALE1[resourceName] ?? 1;
    return sy * consumptionPerTick * (renewable ? 1 : TICKS_PER_YEAR);
}

export function calcClaimCost(resourceName: string, quantity: number): number {
    const costPerUnit = LAND_CLAIM_COST_PER_UNIT[resourceName] ?? 1;
    return Math.floor(quantity * costPerUnit);
}
