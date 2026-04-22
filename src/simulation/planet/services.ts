import type { Resource } from './claims';

const serviceResourceDefault = {
    form: 'services' as const,
    level: 'services' as const,
    volumePerQuantity: 0,
    massPerQuantity: 0, // services hold 1 tick, but do not consume physical storage space or mass
};

export const logisticsServiceResourceType: Resource = {
    ...serviceResourceDefault,
    name: 'Logistics',
};

export const constructionServiceResourceType: Resource = {
    ...serviceResourceDefault,
    name: 'Construction',
};

export const administrativeServiceResourceType: Resource = {
    ...serviceResourceDefault,
    name: 'Administration',
};

export const groceryServiceResourceType: Resource = {
    ...serviceResourceDefault,
    name: 'Grocery',
};

export const retailServiceResourceType: Resource = {
    ...serviceResourceDefault,
    name: 'Retail',
};

export const healthcareServiceResourceType: Resource = {
    ...serviceResourceDefault,
    name: 'Healthcare',
};

export const educationServiceResourceType: Resource = {
    ...serviceResourceDefault,
    name: 'Education',
};

export const maintenanceServiceResourceType: Resource = {
    ...serviceResourceDefault,
    name: 'Maintenance',
};

export const ALL_SERVICE_RESOURCE_TYPE_NAMES = [
    logisticsServiceResourceType.name,
    constructionServiceResourceType.name,
    administrativeServiceResourceType.name,
    groceryServiceResourceType.name,
    retailServiceResourceType.name,
    healthcareServiceResourceType.name,
    educationServiceResourceType.name,
    maintenanceServiceResourceType.name,
];
