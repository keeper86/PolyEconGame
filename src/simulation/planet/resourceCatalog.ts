import type { Resource, ResourceProcessLevel } from './claims';
import {
    agriculturalProductResourceType,
    beverageResourceType,
    cementResourceType,
    chemicalResourceType,
    clayResourceType,
    clothingResourceType,
    coalResourceType,
    concreteResourceType,
    consumerElectronicsResourceType,
    copperOreResourceType,
    copperResourceType,
    cottonResourceType,
    crudeOilResourceType,
    electronicComponentResourceType,
    fabricResourceType,
    fuelResourceType,
    furnitureResourceType,
    glassResourceType,
    ironOreResourceType,
    limestoneResourceType,
    logsResourceType,
    lumberResourceType,
    machineryResourceType,
    packagingResourceType,
    paperResourceType,
    pesticideResourceType,
    pharmaceuticalResourceType,
    plasticResourceType,
    processedFoodResourceType,
    sandResourceType,
    siliconWaferResourceType,
    steelResourceType,
    stoneResourceType,
    vehicleResourceType,
    waterResourceType,
} from './resources';
import {
    administrativeServiceResourceType,
    constructionServiceResourceType,
    educationServiceResourceType,
    groceryServiceResourceType,
    healthcareServiceResourceType,
    logisticsServiceResourceType,
    maintenanceServiceResourceType,
    retailServiceResourceType,
} from './services';

export const ALL_RESOURCES: Resource[] = [
    ironOreResourceType,
    waterResourceType,
    agriculturalProductResourceType,
    coalResourceType,
    crudeOilResourceType,
    logsResourceType,
    stoneResourceType,
    copperOreResourceType,
    sandResourceType,
    limestoneResourceType,
    clayResourceType,
    steelResourceType,
    copperResourceType,
    plasticResourceType,
    chemicalResourceType,
    fuelResourceType,
    lumberResourceType,
    cementResourceType,
    concreteResourceType,
    glassResourceType,
    pesticideResourceType,
    pharmaceuticalResourceType,
    processedFoodResourceType,
    beverageResourceType,
    paperResourceType,
    cottonResourceType,
    fabricResourceType,
    clothingResourceType,
    furnitureResourceType,
    siliconWaferResourceType,
    electronicComponentResourceType,
    consumerElectronicsResourceType,
    machineryResourceType,
    vehicleResourceType,
    packagingResourceType,
    administrativeServiceResourceType,
    logisticsServiceResourceType,
    constructionServiceResourceType,
    groceryServiceResourceType,
    retailServiceResourceType,
    healthcareServiceResourceType,
    educationServiceResourceType,
    maintenanceServiceResourceType,
] as const;

export const RESOURCES_BY_NAME: ReadonlyMap<string, Resource> = new Map(
    ALL_RESOURCES.map((resource) => [resource.name, resource] as const),
);

export const getProductForm = (resourceName: string): Resource['form'] | undefined => {
    return RESOURCES_BY_NAME.get(resourceName)?.form;
};

export const RESOURCE_LEVELS: ResourceProcessLevel[] = ['raw', 'refined', 'manufactured', 'services'];

export const RESOURCE_LEVEL_LABELS: Record<ResourceProcessLevel, string> = {
    raw: 'Raw',
    refined: 'Refined',
    manufactured: 'Manufactured',
    services: 'Services',
};

export const resourcesByLevel: Record<ResourceProcessLevel, Resource[]> = {
    raw: ALL_RESOURCES.filter((r) => r.level === 'raw'),
    refined: ALL_RESOURCES.filter((r) => r.level === 'refined'),
    manufactured: ALL_RESOURCES.filter((r) => r.level === 'manufactured'),
    services: ALL_RESOURCES.filter((r) => r.level === 'services'),
};
