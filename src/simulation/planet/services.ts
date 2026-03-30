import type { Resource } from './planet';

const serviceResourceDefault = {
    form: 'services' as const,
    level: 'services' as const,
    volumePerQuantity: Number.MAX_SAFE_INTEGER,
    massPerQuantity: Number.MAX_SAFE_INTEGER,
};

export const logisticsServiceResourceType: Resource = {
    ...serviceResourceDefault,
    name: 'Logistics Service',
};

export const constructionServiceResourceType: Resource = {
    ...serviceResourceDefault,
    name: 'Construction Service',
};

export const administrativeServiceResourceType: Resource = {
    ...serviceResourceDefault,
    name: 'Administrative Service',
};

export const groceryServiceResourceType: Resource = {
    ...serviceResourceDefault,
    name: 'Grocery Service',
};

export const retailServiceResourceType: Resource = {
    ...serviceResourceDefault,
    name: 'Retail Service',
};

export const healthcareServiceResourceType: Resource = {
    ...serviceResourceDefault,
    name: 'Healthcare Service',
};
