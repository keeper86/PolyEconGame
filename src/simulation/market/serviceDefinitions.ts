import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '../constants';
import type { Resource } from '../planet/claims';
import {
    administrativeServiceResourceType,
    constructionServiceResourceType,
    educationServiceResourceType,
    groceryServiceResourceType,
    healthcareServiceResourceType,
    logisticsServiceResourceType,
    maintenanceServiceResourceType,
    retailServiceResourceType,
} from '../planet/services';
import type { ServiceName } from '../population/population';

export type ServiceDefinition = {
    readonly resource: Resource;
    readonly serviceKey: ServiceName;
    readonly bufferTargetTicks: number;
    readonly consumptionRatePerPersonPerTick: number;
};

const groceryDefinition: ServiceDefinition = {
    resource: groceryServiceResourceType,
    serviceKey: 'grocery',
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_MONTH,
} as const;

const healthcareDefinition: ServiceDefinition = {
    resource: healthcareServiceResourceType,
    serviceKey: 'healthcare',
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_MONTH,
} as const;

const logisticsDefinition: ServiceDefinition = {
    resource: logisticsServiceResourceType,
    serviceKey: 'logistics',
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_MONTH,
} as const;

const educationDefinition: ServiceDefinition = {
    resource: educationServiceResourceType,
    serviceKey: 'education',
    bufferTargetTicks: TICKS_PER_YEAR,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_YEAR,
} as const;

const retailDefinition: ServiceDefinition = {
    resource: retailServiceResourceType,
    serviceKey: 'retail',
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_MONTH,
} as const;

const constructionDefinition: ServiceDefinition = {
    resource: constructionServiceResourceType,
    serviceKey: 'construction',
    bufferTargetTicks: TICKS_PER_YEAR,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_YEAR,
} as const;

const maintenanceDefinition: ServiceDefinition = {
    resource: maintenanceServiceResourceType,
    serviceKey: 'maintenance',
    bufferTargetTicks: TICKS_PER_YEAR,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_YEAR,
} as const;

const administrativeDefinition: ServiceDefinition = {
    resource: administrativeServiceResourceType,
    serviceKey: 'administrative',
    bufferTargetTicks: TICKS_PER_YEAR,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_YEAR,
} as const;

export type ServiceKey =
    | typeof groceryDefinition.serviceKey
    | typeof healthcareDefinition.serviceKey
    | typeof logisticsDefinition.serviceKey
    | typeof educationDefinition.serviceKey
    | typeof retailDefinition.serviceKey
    | typeof constructionDefinition.serviceKey
    | typeof maintenanceDefinition.serviceKey
    | typeof administrativeDefinition.serviceKey;

export const SERVICE_DEFINITIONS: Record<ServiceKey, ServiceDefinition> = {
    grocery: groceryDefinition,
    healthcare: healthcareDefinition,
    logistics: logisticsDefinition,
    education: educationDefinition,
    retail: retailDefinition,
    construction: constructionDefinition,
    maintenance: maintenanceDefinition,
    administrative: administrativeDefinition,
} as const;

export const getServiceDefinitionByResourceName = (resourceName: string): ServiceDefinition | undefined => {
    return Object.values(SERVICE_DEFINITIONS).find((def) => def.resource.name === resourceName);
};

export const allServices = Object.values(SERVICE_DEFINITIONS);

// Priority order derived from the definition array order.
export const householdDemandPriority: string[] = allServices.map((d) => d.resource.name);

export type ServiceTierSupportWeightOverride = {
    generationGap?: number;
    sigma?: number;
    kernelN?: number;
};

export type ServiceTier = {
    readonly name: string;
    readonly services: ServiceName[];
    readonly coverageFraction: number;
    readonly mandatoryForOwnConsumption: boolean;
    readonly supportWeightOverride?: ServiceTierSupportWeightOverride;
};

export const SERVICE_TIERS: ServiceTier[] = [
    {
        name: 'survival',
        services: ['grocery', 'healthcare'],
        coverageFraction: 1.0,
        mandatoryForOwnConsumption: true,
    },
    {
        name: 'comfort',
        services: ['logistics', 'retail', 'education', 'construction', 'maintenance', 'administrative'],
        coverageFraction: 0.5,
        mandatoryForOwnConsumption: false,
    },
];
