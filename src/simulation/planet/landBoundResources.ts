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

export const stoneQuarryResourceType: Resource = {
    ...landBoundResourceDefault,
    name: 'Stone Quarry',
};

export const bauxiteDepositResourceType: Resource = {
    ...landBoundResourceDefault,
    name: 'Bauxite Deposit',
};

export const copperDepositResourceType: Resource = {
    ...landBoundResourceDefault,
    name: 'Copper Deposit',
};

export const rareEarthDepositResourceType: Resource = {
    ...landBoundResourceDefault,
    name: 'Rare Earth Deposit',
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

export const phosphateRockDepositResourceType: Resource = {
    ...landBoundResourceDefault,
    name: 'Phosphate Rock Deposit',
};

export const potashDepositResourceType: Resource = {
    ...landBoundResourceDefault,
    name: 'Potash Deposit',
};
