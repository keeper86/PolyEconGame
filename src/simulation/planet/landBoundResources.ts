import type { Resource } from './claims';

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

export const getLandboundRessourceByName = (name: string): Resource | undefined => {
    switch (name) {
        case 'Coal Deposit':
            return coalDepositResourceType;
        case 'Oil Reservoir':
            return oilReservoirResourceType;
        case 'Natural Gas Field':
            return naturalGasFieldResourceType;
        case 'Forest':
            return forestResourceType;
        case 'Stone Deposit':
            return stoneDepositResourceType;
        case 'Copper Deposit':
            return copperDepositResourceType;
        case 'Sand Deposit':
            return sandDepositResourceType;
        case 'Limestone Deposit':
            return limestoneDepositResourceType;
        case 'Clay Deposit':
            return clayDepositResourceType;
        case 'Iron Ore Deposit':
            return ironOreDepositResourceType;
        case 'Arable Land':
            return arableLandResourceType;
        case 'Water Source':
            return waterSourceResourceType;
        default:
            console.warn(`Unknown landbound resource name: ${name}`);
            return undefined;
    }
};
