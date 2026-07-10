import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '../constants';
import type { Resource } from '../planet/claims';
import type { Planet } from '../planet/planet';
import {
    educationServiceResourceType,
    groceryServiceResourceType,
    healthcareServiceResourceType,
    logisticsServiceResourceType,
    retailServiceResourceType,
} from '../planet/services';
import type { Occupation, ServiceName } from '../population/population';

export type ServiceDefinition = {
    readonly resource: Resource;
    readonly bufferTargetTicks: number;
    readonly consumptionRatePerPersonPerTick: (age: number, occ: Occupation) => number;
};

export const serviceKeyOf = (def: ServiceDefinition): ServiceName => def.resource.name.toLowerCase() as ServiceName;

const groceryAgeMultiplier = (age: number, _occ: Occupation): number => {
    return 0.3 + 0.7 / (1 + Math.exp(-(age - 12) / 4));
};

/** U-shaped: high for children (0-5) and elderly (65+), lower for working-age adults.
 *  Occupation adds flat bonuses: unableToWork +0.3, employed +0.1 */
const healthcareAgeMultiplier = (age: number, occ: Occupation): number => {
    // Child bump: peak around age 2
    const childBump = 1 / (1 + Math.exp(-(5 - age) / 3));
    // Elderly bump: peak around age 75
    const elderBump = 1.2 - 1 / (1 + Math.exp(-(60 - age) / 10));
    let base = 0.5 + childBump + elderBump;

    // Occupation modifiers
    if (occ === 'unableToWork') {
        base += 0.5;
    } else if (occ === 'employed') {
        base += 0.2;
    }

    return base;
};

const logisticsAgeMultiplier = (age: number, occ: Occupation): number => {
    let occFactor = 1.0;
    if (occ === 'education') {
        occFactor = 0.5;
    }
    if (occ === 'employed') {
        occFactor = 1.3;
    }
    if (occ === 'unableToWork') {
        occFactor = 0.6;
    }
    if (occ === 'unoccupied') {
        occFactor = 0.8;
    }
    return occFactor * (0.3 + 0.7 / (1 + Math.exp(-(age - 16) / 3)));
};

/** Education only for school-age and university-age (5–22) */
const educationAgeMultiplier = (age: number, occ: Occupation): number => {
    if (occ === 'education') {
        return 0.1 + 0.9 / (1 + Math.exp(-(age - 6)));
    }
    return 0.0;
};

// ── Service definitions ───────────────────────────────────────────────────────

const groceryDefinition: ServiceDefinition = {
    resource: groceryServiceResourceType,
    bufferTargetTicks: 2 * TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: (age, occ) => (1 / TICKS_PER_MONTH) * groceryAgeMultiplier(age, occ),
} as const;

const healthcareDefinition: ServiceDefinition = {
    resource: healthcareServiceResourceType,
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: (age, occ) => (1 / TICKS_PER_MONTH) * healthcareAgeMultiplier(age, occ),
} as const;

const logisticsDefinition: ServiceDefinition = {
    resource: logisticsServiceResourceType,
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: (age, occ) => (1 / TICKS_PER_MONTH) * logisticsAgeMultiplier(age, occ),
} as const;

const educationDefinition: ServiceDefinition = {
    resource: educationServiceResourceType,
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: (age, occ) => (1 / TICKS_PER_YEAR) * educationAgeMultiplier(age, occ),
} as const;

const retailDefinition: ServiceDefinition = {
    resource: retailServiceResourceType,
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: (age, occ) => (1 / TICKS_PER_MONTH) * groceryAgeMultiplier(age, occ),
} as const;

export const SERVICE_DEFINITIONS: Record<ServiceName, ServiceDefinition> = {
    grocery: groceryDefinition,
    healthcare: healthcareDefinition,
    logistics: logisticsDefinition,
    education: educationDefinition,
    retail: retailDefinition,
} as const;

export const getServiceDefinitionByResourceName = (resourceName: string): ServiceDefinition | undefined => {
    return Object.values(SERVICE_DEFINITIONS).find((def) => def.resource.name === resourceName);
};

export const allServices = Object.values(SERVICE_DEFINITIONS);

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
        services: ['logistics', 'education'],
        coverageFraction: 0.5,
        mandatoryForOwnConsumption: true,
    },
    {
        name: 'luxury',
        services: ['retail'],
        coverageFraction: 0.1,
        mandatoryForOwnConsumption: false,
    },
];

export function computeTierCost(
    marketPrices: Record<string, number>,
    tier: ServiceTier,
    age: number = 30,
    occ: Occupation = 'employed',
): number {
    return tier.services.reduce((sum, key) => {
        const def = SERVICE_DEFINITIONS[key];
        const price = marketPrices[def.resource.name] ?? 0;
        return sum + def.consumptionRatePerPersonPerTick(age, occ) * price;
    }, 0);
}

export function computeCostOfLiving(planet: Planet, whenRich: boolean = false): number {
    let total = 0;
    if (whenRich && planet._costOfLivingRich !== undefined) {
        return planet._costOfLivingRich;
    }
    if (!whenRich && planet._costOfLiving !== undefined) {
        return planet._costOfLiving;
    }

    for (const tier of SERVICE_TIERS) {
        if (tier.mandatoryForOwnConsumption || whenRich) {
            total += computeTierCost(planet.marketPrices, tier);
        }
    }
    return total;
}
