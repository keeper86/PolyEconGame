import { TICKS_PER_MONTH } from '../constants';
import type { Resource } from '../planet/claims';
import {
    administrativeServiceResourceType,
    constructionServiceResourceType,
    educationServiceResourceType,
    groceryServiceResourceType,
    healthcareServiceResourceType,
    logisticsServiceResourceType,
    retailServiceResourceType,
} from '../planet/services';
import type { ServiceName } from '../population/population';

export type ServiceDefinition = {
    readonly resource: Resource;
    readonly serviceKey: ServiceName;
    readonly bufferTargetTicks: number;
    readonly consumptionRatePerPersonPerTick: number;
};

export const groceryDefinition: ServiceDefinition = {
    resource: groceryServiceResourceType,
    serviceKey: 'grocery',
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_MONTH,
};

export const healthcareDefinition: ServiceDefinition = {
    resource: healthcareServiceResourceType,
    serviceKey: 'healthcare',
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_MONTH,
};

export const logisticsDefinition: ServiceDefinition = {
    resource: logisticsServiceResourceType,
    serviceKey: 'logistics',
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_MONTH,
};

export const educationDefinition: ServiceDefinition = {
    resource: educationServiceResourceType,
    serviceKey: 'education',
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_MONTH / 12,
};

export const retailDefinition: ServiceDefinition = {
    resource: retailServiceResourceType,
    serviceKey: 'retail',
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_MONTH,
};

export const constructionDefinition: ServiceDefinition = {
    resource: constructionServiceResourceType,
    serviceKey: 'construction',
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_MONTH / 12,
};

export const administrativeDefinition: ServiceDefinition = {
    resource: administrativeServiceResourceType,
    serviceKey: 'administrative',
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_MONTH / 12,
};

export const SERVICE_DEFINITIONS: readonly ServiceDefinition[] = [
    groceryDefinition,
    healthcareDefinition,
    logisticsDefinition,
    educationDefinition,
    retailDefinition,
    constructionDefinition,
    administrativeDefinition,
];

export type ServiceKey = ServiceDefinition['serviceKey'];

/** O(1) lookup by resource name — used by settlement and consumption. */
export const SERVICE_DEFINITION_BY_RESOURCE_NAME = new Map<string, ServiceDefinition>(
    SERVICE_DEFINITIONS.map((def) => [def.resource.name, def]),
);

// Priority order derived from the definition array order.
export const householdDemandPriority: string[] = SERVICE_DEFINITIONS.map((d) => d.resource.name);
