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
    readonly bufferTargetTicks: number;
    readonly consumptionRatePerPersonPerTick: number;
};

/** Derives the ServiceName key from a ServiceDefinition by lowercasing the resource name. */
export const serviceKeyOf = (def: ServiceDefinition): ServiceName => def.resource.name.toLowerCase() as ServiceName;

const groceryDefinition: ServiceDefinition = {
    resource: groceryServiceResourceType,
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_MONTH,
} as const;

const healthcareDefinition: ServiceDefinition = {
    resource: healthcareServiceResourceType,
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_MONTH,
} as const;

const logisticsDefinition: ServiceDefinition = {
    resource: logisticsServiceResourceType,
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_MONTH,
} as const;

const educationDefinition: ServiceDefinition = {
    resource: educationServiceResourceType,
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_YEAR,
} as const;

const retailDefinition: ServiceDefinition = {
    resource: retailServiceResourceType,
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_MONTH,
} as const;

const constructionDefinition: ServiceDefinition = {
    resource: constructionServiceResourceType,
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_YEAR,
} as const;

const maintenanceDefinition: ServiceDefinition = {
    resource: maintenanceServiceResourceType,
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_YEAR,
} as const;

const administrationDefinition: ServiceDefinition = {
    resource: administrativeServiceResourceType,
    bufferTargetTicks: TICKS_PER_YEAR,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_YEAR,
} as const;

export const SERVICE_DEFINITIONS: Record<ServiceName, ServiceDefinition> = {
    grocery: groceryDefinition,
    healthcare: healthcareDefinition,
    logistics: logisticsDefinition,
    education: educationDefinition,
    retail: retailDefinition,
    construction: constructionDefinition,
    maintenance: maintenanceDefinition,
    administration: administrationDefinition,
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
        services: ['logistics', 'education', 'administration'],
        coverageFraction: 0.5,
        mandatoryForOwnConsumption: true,
    },
    {
        name: 'luxury',
        services: ['retail', 'construction', 'maintenance'],
        coverageFraction: 0.1,
        mandatoryForOwnConsumption: false,
    },
];
