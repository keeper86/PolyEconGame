import type { Resource } from './claims';

const serviceResourceDefault = {
    form: 'services' as const,
    level: 'services' as const,
    volumePerQuantity: 0,
    massPerQuantity: 0, // services hold 1 tick, but do not consume physical storage space or mass
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

export const educationServiceResourceType: Resource = {
    ...serviceResourceDefault,
    name: 'Education Service',
};

export const ALL_SERVICE_RESOURCE_TYPE_NAMES = [
    logisticsServiceResourceType.name,
    constructionServiceResourceType.name,
    administrativeServiceResourceType.name,
    groceryServiceResourceType.name,
    retailServiceResourceType.name,
    healthcareServiceResourceType.name,
    educationServiceResourceType.name,
];
