import type { Resource } from './planet';

const landBoundResourceDefault = {
    form: 'landBoundResource' as const,
    level: 'source' as const,
    volumePerQuantity: Number.MAX_SAFE_INTEGER,
    massPerQuantity: Number.MAX_SAFE_INTEGER,
};

export const coalDepositResourceType: Resource = {
    ...landBoundResourceDefault,
    name: 'Coal Deposit',
};

export const oilReservoirResourceType: Resource = {
    ...landBoundResourceDefault,
    name: 'Oil Reservoir',
};

export const naturalGasFieldResourceType: Resource = {
    ...landBoundResourceDefault,
    name: 'Natural Gas Field',
};

export const forestResourceType: Resource = {
    ...landBoundResourceDefault,
    name: 'Forest',
};

export const stoneDepositResourceType: Resource = {
    ...landBoundResourceDefault,
    name: 'Stone Deposit',
};

export const copperDepositResourceType: Resource = {
    ...landBoundResourceDefault,
    name: 'Copper Deposit',
};

export const sandDepositResourceType: Resource = {
    ...landBoundResourceDefault,
    name: 'Sand Deposit',
};

export const limestoneDepositResourceType: Resource = {
    ...landBoundResourceDefault,
    name: 'Limestone Deposit',
};

export const clayDepositResourceType: Resource = {
    ...landBoundResourceDefault,
    name: 'Clay Deposit',
};

export const ironOreDepositResourceType: Resource = {
    ...landBoundResourceDefault,
    name: 'Iron Ore Deposit',
};

export const arableLandResourceType: Resource = {
    ...landBoundResourceDefault,
    name: 'Arable Land',
};

export const waterSourceResourceType: Resource = {
    ...landBoundResourceDefault,
    name: 'Water Source',
};
