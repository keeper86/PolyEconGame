import type { Resource } from './claims';

const internalResourceDefault = {
    form: 'internal' as const,
    level: 'internal' as const,
    volumePerQuantity: 0,
    massPerQuantity: 0,
};

export const humanResourcesServiceResourceType: Resource = {
    ...internalResourceDefault,
    name: 'Human Resources',
};

export const storageServiceResourceType: Resource = {
    ...internalResourceDefault,
    name: 'Storage',
};

export const trainingServiceResourceType: Resource = {
    ...internalResourceDefault,
    name: 'Training',
};

const serviceResourceDefault = {
    form: 'services' as const,
    level: 'services' as const,
    volumePerQuantity: 0,
    massPerQuantity: 0,
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
