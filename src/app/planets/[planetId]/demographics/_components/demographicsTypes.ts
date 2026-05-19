import { SERVICE_DEFINITIONS } from '@/simulation/market/populationDemand';
import type { ServiceName } from '@/simulation/population/population';

export type GroupMode = 'occupation' | 'education';

type SvcGroupPair = [number, number];
type SvcBands4 = [SvcGroupPair, SvcGroupPair, SvcGroupPair, SvcGroupPair];

export type AggRow = {
    age: number;
    total: number;
    occ: [number, number, number, number];
    edu: [number, number, number, number];
    groupValues: [
        [number, number, number, number],
        [number, number, number, number],
        [number, number, number, number],
        [number, number, number, number],
    ];
    serviceBuffers: { [K in Exclude<ServiceName, 'grocery'>]: SvcBands4 };
};

/** Index into groupValues tuple: population count. */
export const GV_POP = 0 as const;

const groceryDef = SERVICE_DEFINITIONS.find((d) => d.serviceKey === 'grocery')!;

export const SERVICE_TARGET_PER_PERSON = groceryDef.bufferTargetTicks * groceryDef.consumptionRatePerPersonPerTick;

export const SERVICE_TARGET_MAP: Record<ServiceName, number> = Object.fromEntries(
    SERVICE_DEFINITIONS.map((def) => [def.serviceKey, def.bufferTargetTicks * def.consumptionRatePerPersonPerTick]),
) as Record<ServiceName, number>;
/** Index into groupValues tuple: total service stock (sum over all people in group). */
export const GV_FOOD = 1 as const;
/** Index into groupValues tuple: population-weighted starvation sum. */
export const GV_STARV = 2 as const;
/** Index into groupValues tuple: population-weighted wealth sum. */
export const GV_WEALTH = 3 as const;
