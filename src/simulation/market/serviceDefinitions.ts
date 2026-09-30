import {
    DEFAULT_REFERENCE_MONTHLY_INCOME,
    EDUCATION_WEALTH_SATURATION_MONTHS,
    GROCERY_WEALTH_SATURATION_MONTHS,
    HEALTHCARE_WEALTH_SATURATION_MONTHS,
    HOUSING_BASE_RATE_PER_MONTH,
    HOUSING_BUILD_MONTHS,
    HOUSING_ENGEL_GAIN,
    HOUSING_LIFETIME_MONTHS,
    HOUSING_WEALTH_THRESHOLD_MONTHS,
    LOGISTICS_WEALTH_SATURATION_MONTHS,
    MIN_WAGE,
    RETAIL_WEALTH_SATURATION_MONTHS,
    TICKS_PER_MONTH,
    TICKS_PER_YEAR,
} from '../constants';
import type { Resource } from '../planet/claims';
import type { Planet } from '../planet/planet';
import {
    constructionServiceResourceType,
    educationServiceResourceType,
    groceryServiceResourceType,
    healthcareServiceResourceType,
    logisticsServiceResourceType,
    retailServiceResourceType,
} from '../planet/services';
import { educationLevelKeys } from '../population/education';
import type { GaussianMoments, Occupation, ServiceName } from '../population/population';

export type ServiceDefinition = {
    readonly resource: Resource;
    readonly bufferTargetTicks: number;
    /** How fast the buffer is rebuilt: ticks to fill it from empty. Decoupled from bufferTargetTicks
     *  (the stock lifetime) so a large capital asset like housing builds quickly but decays slowly. */
    readonly refillTicks: number;
    /** Flow rate used for household bids and buffer accounting. May be wealth-gated (e.g. housing). */
    readonly fillRatePerPersonPerTick: (
        age: number,
        occ: Occupation,
        wealth: GaussianMoments,
        referenceMonthlyIncome: number,
    ) => number;
    /** Flow rate used for buffer decay (consumeServices) and buffer weighting. Independent of wealth
     *  for housing so a house always perishes over its lifetime, regardless of who owns it. */
    readonly consumptionRatePerPersonPerTick: (
        age: number,
        occ: Occupation,
        wealth: GaussianMoments,
        referenceMonthlyIncome: number,
    ) => number;
};

export const serviceKeyOf = (def: ServiceDefinition): ServiceName => def.resource.name.toLowerCase() as ServiceName;

export const referenceMonthlyIncome = (planet: Planet): number => {
    let sum = 0;
    let count = 0;
    for (const edu of educationLevelKeys) {
        const wage = planet.wagePerEdu[edu];
        if (wage > 0) {
            sum += wage;
            count += 1;
        }
    }
    const avgWage = count > 0 ? sum / count : MIN_WAGE;
    return Math.max(MIN_WAGE, avgWage) * TICKS_PER_MONTH;
};

const engelMultiplier = (
    wealth: GaussianMoments,
    saturationMonths: number,
    maxExtra: number,
    referenceMonthlyIncomeValue: number,
): number => {
    if (wealth.mean <= 0) {
        return 1;
    }
    const saturation = saturationMonths * Math.max(1, referenceMonthlyIncomeValue);
    return 1 + maxExtra * (1 - Math.exp(-wealth.mean / saturation));
};

const groceryAgeMultiplier = (age: number, _occ: Occupation): number => {
    return 0.3 + 0.7 / (1 + Math.exp(-(age - 12) / 4));
};

const retailAgeMultiplier = (age: number, _occ: Occupation): number => {
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

const groceryRate = (age: number, occ: Occupation, wealth: GaussianMoments, refIncome: number): number =>
    (1 / TICKS_PER_MONTH) *
    groceryAgeMultiplier(age, occ) *
    engelMultiplier(wealth, GROCERY_WEALTH_SATURATION_MONTHS, 0.3, refIncome);

const groceryDefinition: ServiceDefinition = {
    resource: groceryServiceResourceType,
    bufferTargetTicks: 2 * TICKS_PER_MONTH,
    refillTicks: 2 * TICKS_PER_MONTH,
    fillRatePerPersonPerTick: groceryRate,
    consumptionRatePerPersonPerTick: groceryRate,
} as const;

const healthcareRate = (age: number, occ: Occupation, wealth: GaussianMoments, refIncome: number): number =>
    (1 / TICKS_PER_MONTH / 3) *
    healthcareAgeMultiplier(age, occ) *
    engelMultiplier(wealth, HEALTHCARE_WEALTH_SATURATION_MONTHS, 1.0, refIncome);

const healthcareDefinition: ServiceDefinition = {
    resource: healthcareServiceResourceType,
    bufferTargetTicks: 3 * TICKS_PER_MONTH,
    refillTicks: 3 * TICKS_PER_MONTH,
    fillRatePerPersonPerTick: healthcareRate,
    consumptionRatePerPersonPerTick: healthcareRate,
} as const;

const logisticsRate = (age: number, occ: Occupation, wealth: GaussianMoments, refIncome: number): number =>
    (1 / TICKS_PER_MONTH) *
    logisticsAgeMultiplier(age, occ) *
    engelMultiplier(wealth, LOGISTICS_WEALTH_SATURATION_MONTHS, 1.5, refIncome);

const logisticsDefinition: ServiceDefinition = {
    resource: logisticsServiceResourceType,
    bufferTargetTicks: TICKS_PER_MONTH,
    refillTicks: TICKS_PER_MONTH,
    fillRatePerPersonPerTick: logisticsRate,
    consumptionRatePerPersonPerTick: logisticsRate,
} as const;

const educationRate = (age: number, occ: Occupation, wealth: GaussianMoments, refIncome: number): number =>
    (1 / TICKS_PER_YEAR) *
    educationAgeMultiplier(age, occ) *
    engelMultiplier(wealth, EDUCATION_WEALTH_SATURATION_MONTHS, 0.2, refIncome);

const educationDefinition: ServiceDefinition = {
    resource: educationServiceResourceType,
    bufferTargetTicks: TICKS_PER_YEAR,
    refillTicks: TICKS_PER_YEAR,
    fillRatePerPersonPerTick: educationRate,
    consumptionRatePerPersonPerTick: educationRate,
} as const;

const retailRate = (age: number, occ: Occupation, wealth: GaussianMoments, refIncome: number): number =>
    (1 / TICKS_PER_MONTH) *
    retailAgeMultiplier(age, occ) *
    engelMultiplier(wealth, RETAIL_WEALTH_SATURATION_MONTHS, 2.0, refIncome);

const retailDefinition: ServiceDefinition = {
    resource: retailServiceResourceType,
    bufferTargetTicks: TICKS_PER_MONTH,
    refillTicks: TICKS_PER_MONTH,
    fillRatePerPersonPerTick: retailRate,
    consumptionRatePerPersonPerTick: retailRate,
} as const;

const housingAgeMultiplier = (age: number, _occ: Occupation): number => {
    if (age < 18) {
        return 0.2;
    }
    if (age < 30) {
        return 0.2 + 0.8 * ((age - 18) / 12);
    }
    return 1.0;
};

const housingEngelMultiplier = (wealth: GaussianMoments, referenceMonthlyIncomeValue: number): number => {
    const monthsOfIncome = wealth.mean / Math.max(1, referenceMonthlyIncomeValue);
    return Math.max(0, HOUSING_ENGEL_GAIN * (monthsOfIncome - HOUSING_WEALTH_THRESHOLD_MONTHS));
};

const housingDecayRate = (age: number, occ: Occupation): number =>
    (HOUSING_BASE_RATE_PER_MONTH / TICKS_PER_MONTH) * housingAgeMultiplier(age, occ);

const constructionDefinition: ServiceDefinition = {
    resource: constructionServiceResourceType,
    bufferTargetTicks: HOUSING_LIFETIME_MONTHS * TICKS_PER_MONTH,
    refillTicks: HOUSING_BUILD_MONTHS * TICKS_PER_MONTH,
    fillRatePerPersonPerTick: (age, occ, wealth, refIncome) =>
        housingDecayRate(age, occ) * housingEngelMultiplier(wealth, refIncome),
    consumptionRatePerPersonPerTick: (age, occ, _wealth, _refIncome) => housingDecayRate(age, occ),
} as const;

export const SERVICE_DEFINITIONS: Record<ServiceName, ServiceDefinition> = {
    grocery: groceryDefinition,
    healthcare: healthcareDefinition,
    logistics: logisticsDefinition,
    education: educationDefinition,
    retail: retailDefinition,
    construction: constructionDefinition,
} as const;

export const getServiceDefinitionByResourceName = (resourceName: string): ServiceDefinition | undefined => {
    return Object.values(SERVICE_DEFINITIONS).find((def) => def.resource.name === resourceName);
};

export const allServices = Object.values(SERVICE_DEFINITIONS);

export const householdDemandPriority: string[] = allServices.map((d) => d.resource.name);

export type ServiceTier = {
    readonly name: string;
    readonly services: ServiceName[];
    readonly coverageFraction: number;
    readonly mandatoryForOwnConsumption: boolean;
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
        coverageFraction: 0.75,
        mandatoryForOwnConsumption: false,
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
    wealth: GaussianMoments = { mean: 0, variance: 0 },
    referenceMonthlyIncomeValue: number = DEFAULT_REFERENCE_MONTHLY_INCOME,
): number {
    return tier.services.reduce((sum, key) => {
        const def = SERVICE_DEFINITIONS[key];
        const price = marketPrices[def.resource.name] ?? 0;
        return sum + def.fillRatePerPersonPerTick(age, occ, wealth, referenceMonthlyIncomeValue) * price;
    }, 0);
}

export function computeCostOfLiving(
    planet: Planet,
    whenRich: boolean = false,
    wealth: GaussianMoments = { mean: 0, variance: 0 },
): number {
    let total = 0;
    if (whenRich && planet._costOfLivingRich !== undefined) {
        return planet._costOfLivingRich;
    }
    if (!whenRich && planet._costOfLiving !== undefined) {
        return planet._costOfLiving;
    }

    const refIncome = referenceMonthlyIncome(planet);
    for (const tier of SERVICE_TIERS) {
        if (tier.mandatoryForOwnConsumption || whenRich) {
            total += computeTierCost(planet.marketPrices, tier, 30, 'employed', wealth, refIncome);
        }
    }
    return total;
}
