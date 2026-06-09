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

export const GV_POP = 0 as const;

export const GV_FOOD = 1 as const;

export const GV_STARV = 2 as const;

export const GV_WEALTH = 3 as const;
