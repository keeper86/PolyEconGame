import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import { distributeProportionally } from '../utils/distributeProportionally';
import { stochasticRound } from '../utils/stochasticRound';
import type { Resource, ResourceQuantity } from '../planet/claims';

const envNumber = (name: string, fallback: number): number => {
    const raw = process.env[name];
    if (raw === undefined || raw === '') {
        return fallback;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
};

export type LabourLevel = 'raw' | 'refined' | 'manufactured' | 'services';

export const LABOUR_PER_UNIT: Record<LabourLevel, number> = {
    raw: envNumber('LABOUR_PER_RAW_UNIT', 0.5),
    refined: envNumber('LABOUR_PER_REFINED_UNIT', 0.5),
    manufactured: envNumber('LABOUR_PER_MANUFACTURED_UNIT', 0.5),
    services: envNumber('LABOUR_PER_SERVICE_UNIT', 0.75),
};

export const ESSENTIAL_LABOUR_FACTOR = envNumber('ESSENTIAL_LABOUR_FACTOR', 0.9);
export const OPTIONAL_LABOUR_FACTOR = envNumber('OPTIONAL_LABOUR_FACTOR', 1.3);

export const ESSENTIAL_GOODS: ReadonlySet<string> = new Set([
    'Water',
    'Produce',
    'Processed Food',
    'Beverage',
    'Grocery',
    'Pesticide',
    'Chemical',
    'Crude Oil',
    'Packaging Material',
    'Paper',
    'Plastic',
    'Glass',
    'Logs',
    'Lumber',
    'Limestone',
    'Sand',
]);

export const isEssentialGood = (name: string): boolean => ESSENTIAL_GOODS.has(name);

export const labourPerUnitFor = (
    level: LabourLevel,
    essential: boolean,
    essentialFactor: number,
    optionalFactor: number,
): number => LABOUR_PER_UNIT[level] * (essential ? essentialFactor : optionalFactor);

export const labourPerUnitOf = (resource: Resource): number => {
    if (resource.level === 'source' || resource.level === 'internal' || resource.level === 'currency') {
        return 0;
    }
    return labourPerUnitFor(
        resource.level,
        isEssentialGood(resource.name),
        ESSENTIAL_LABOUR_FACTOR,
        OPTIONAL_LABOUR_FACTOR,
    );
};

export const MINIMUM_WORKERS_PER_SCALE = 20;

export type WorkerProfile = Record<EducationLevelType, number>;

export const workerProfiles = {
    extraction: { none: 26, primary: 48, secondary: 23, tertiary: 3 },
    lightIndustry: { none: 24, primary: 33, secondary: 34, tertiary: 9 },
    heavyIndustry: { none: 19, primary: 29, secondary: 37, tertiary: 15 },
    highTech: { none: 9, primary: 19, secondary: 28, tertiary: 44 },
    administration: { none: 15, primary: 31, secondary: 38, tertiary: 16 },
    logistics: { none: 38, primary: 38, secondary: 18, tertiary: 6 },
    construction: { none: 31, primary: 38, secondary: 23, tertiary: 8 },
    retail: { none: 20, primary: 40, secondary: 33, tertiary: 7 },
    healthcare: { none: 6, primary: 11, secondary: 28, tertiary: 55 },
    education: { none: 5, primary: 10, secondary: 28, tertiary: 57 },
    research: { none: 0, primary: 12, secondary: 25, tertiary: 63 },
    maintenance: { none: 10, primary: 30, secondary: 50, tertiary: 10 },
} satisfies Record<string, WorkerProfile>;

export const LABOUR_MULTIPLIER = envNumber('LABOUR_MULTIPLIER', 1.25);

export const workers = (profile: WorkerProfile, headcountPerScale: number): Record<EducationLevelType, number> => {
    const counts = distributeProportionally(
        stochasticRound(headcountPerScale),
        educationLevelKeys.map((edu) => profile[edu]),
    );
    const requirement = {} as Record<EducationLevelType, number>;
    educationLevelKeys.forEach((edu, index) => {
        requirement[edu] = counts[index];
    });
    return requirement;
};

const flowLabour = (flows: ResourceQuantity[]): number =>
    flows.reduce((sum, entry) => sum + entry.quantity * labourPerUnitOf(entry.resource), 0);

export const headcountPerScaleFor = (facility: { needs: ResourceQuantity[]; produces: ResourceQuantity[] }): number =>
    Math.max(
        MINIMUM_WORKERS_PER_SCALE,
        (flowLabour(facility.needs) + flowLabour(facility.produces)) * LABOUR_MULTIPLIER,
    );

export const withDerivedWorkers = <T extends { needs: ResourceQuantity[]; produces: ResourceQuantity[] }>(
    profile: WorkerProfile,
    facility: T,
): T & { workerRequirement: Record<EducationLevelType, number> } => ({
    ...facility,
    workerRequirement: workers(profile, headcountPerScaleFor(facility)),
});
