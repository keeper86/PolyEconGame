import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '../constants';
import type { Resource } from '../planet/claims';
import type { Planet } from '../planet/planet';
import {
    constructionServiceResourceType,
    educationServiceResourceType,
    groceryServiceResourceType,
    healthcareServiceResourceType,
    logisticsServiceResourceType,
    maintenanceServiceResourceType,
    retailServiceResourceType,
} from '../planet/services';
import type { Occupation, ServiceName } from '../population/population';

export type ServiceDefinition = {
    readonly resource: Resource;
    readonly bufferTargetTicks: number;
    readonly consumptionRatePerPersonPerTick: number;
    readonly ageMultiplier: (age: number, occ: Occupation) => number;
};

export const serviceKeyOf = (def: ServiceDefinition): ServiceName => def.resource.name.toLowerCase() as ServiceName;

// ── Age multiplier functions ──────────────────────────────────────────────────

/** Sigmoid from childhood to adult: low for infants, ramps through teens, 1.0 for adults */
const standardAgeMultiplier = (age: number, _occ: Occupation): number => {
    // logistic curve: starts at 0.4, plateaus at 1.0
    // steepest around age 16
    return 0.3 + 0.6 / (1 + Math.exp(-(age - 16) / 3));
};

/** U-shaped: high for children (0-5) and elderly (65+), lower for working-age adults.
 *  Occupation adds flat bonuses: unableToWork +0.3, employed +0.1 */
const healthcareAgeMultiplier = (age: number, occ: Occupation): number => {
    // Child bump: peak around age 2
    const childBump = 0.8 * Math.exp(-(((age - 2) / 2) ** 2));
    // Elderly bump: peak around age 75
    const elderBump = 1.6 * Math.exp(-(((age - 75) / 10) ** 2));
    let base = 0.6 + childBump + elderBump;

    // Occupation modifiers
    if (occ === 'unableToWork') {
        base += 0.6;
    } else if (occ === 'employed') {
        base += 0.2;
    }

    return base;
};

/** Education only for school-age and university-age (5–22) */
const educationAgeMultiplier = (_age: number, occ: Occupation): number => {
    if (occ === 'education') {
        return 1.0;
    }
    return 0.0;
};

/** Construction: peaks in middle age (25–60, home-buying years), near-zero before 20, tapers after 65 */
const constructionAgeMultiplier = (age: number, occ: Occupation): number => {
    if (occ === 'education') {
        return 0;
    }
    // Product of two sigmoids: rising at 25, falling at 65
    const rise = 1 / (1 + Math.exp(-(age - 25) / 5));
    const fall = 1 / (1 + Math.exp((age - 65) / 5));
    return rise * fall;
};

/** Maintenance: similar to standard, but peaks a bit later (prime home-owning years 30–60) */
const maintenanceAgeMultiplier = (age: number, occ: Occupation): number => {
    if (occ === 'education') {
        return 0;
    }
    const rise = 1 / (1 + Math.exp(-(age - 22) / 4));
    const fall = 1 / (1 + Math.exp((age - 70) / 6));
    return rise * fall;
};

// ── Service definitions ───────────────────────────────────────────────────────

const groceryDefinition: ServiceDefinition = {
    resource: groceryServiceResourceType,
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_MONTH,
    ageMultiplier: standardAgeMultiplier,
} as const;

const healthcareDefinition: ServiceDefinition = {
    resource: healthcareServiceResourceType,
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_MONTH,
    ageMultiplier: healthcareAgeMultiplier,
} as const;

const logisticsDefinition: ServiceDefinition = {
    resource: logisticsServiceResourceType,
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_MONTH,
    ageMultiplier: standardAgeMultiplier,
} as const;

const educationDefinition: ServiceDefinition = {
    resource: educationServiceResourceType,
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_YEAR,
    ageMultiplier: educationAgeMultiplier,
} as const;

const retailDefinition: ServiceDefinition = {
    resource: retailServiceResourceType,
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_MONTH,
    ageMultiplier: standardAgeMultiplier,
} as const;

/** Construction represents housing stock.
 *  bufferTargetTicks = 40 years — a full buffer takes 40 years to fully deplete (depreciation).
 *  consumptionRate is the depreciation rate. */
const constructionDefinition: ServiceDefinition = {
    resource: constructionServiceResourceType,
    bufferTargetTicks: 40 * TICKS_PER_YEAR,
    consumptionRatePerPersonPerTick: 10 / TICKS_PER_YEAR, // 400 cs per house
    ageMultiplier: constructionAgeMultiplier,
} as const;

/** Maintenance base definition. The effective consumption rate scales with a cohort's
 *  construction buffer ratio (see populationDemand.ts / consumption.ts). */
const maintenanceDefinition: ServiceDefinition = {
    resource: maintenanceServiceResourceType,
    bufferTargetTicks: TICKS_PER_MONTH,
    consumptionRatePerPersonPerTick: 1 / TICKS_PER_YEAR,
    ageMultiplier: maintenanceAgeMultiplier,
} as const;

export const SERVICE_DEFINITIONS: Record<ServiceName, ServiceDefinition> = {
    grocery: groceryDefinition,
    healthcare: healthcareDefinition,
    logistics: logisticsDefinition,
    education: educationDefinition,
    retail: retailDefinition,
    construction: constructionDefinition,
    maintenance: maintenanceDefinition,
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
        services: ['grocery', 'healthcare', 'education'],
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
        services: ['retail', 'construction', 'maintenance'],
        coverageFraction: 0.1,
        mandatoryForOwnConsumption: false,
    },
];

export function computeTierCost(marketPrices: Record<string, number>, tier: ServiceTier): number {
    return tier.services.reduce((sum, key) => {
        const def = SERVICE_DEFINITIONS[key];
        const price = marketPrices[def.resource.name] ?? 0;
        return sum + def.consumptionRatePerPersonPerTick * price;
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
