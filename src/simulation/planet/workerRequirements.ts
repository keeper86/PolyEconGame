import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import { distributeProportionally } from '../utils/distributeProportionally';
import { stochasticRound } from '../utils/stochasticRound';
import type { ResourceQuantity } from './claims';

export const LABOUR_PER_TON_PER_TICK = 0.25;
export const LABOUR_PER_SERVICE_UNIT = 0.3;
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

const LABOUR_MULTIPLIER = 1.05;

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
    LABOUR_MULTIPLIER *
    flows.reduce((sum, entry) => {
        if (entry.resource.level === 'source') {
            return sum;
        }
        const perUnit =
            entry.resource.massPerQuantity * LABOUR_PER_TON_PER_TICK +
            (entry.resource.level === 'services' ? LABOUR_PER_SERVICE_UNIT : 0);
        return sum + entry.quantity * perUnit;
    }, 0);

export const headcountPerScaleFor = (facility: { needs: ResourceQuantity[]; produces: ResourceQuantity[] }): number => {
    const throughputLabour = flowLabour(facility.needs) + flowLabour(facility.produces);
    return Math.max(MINIMUM_WORKERS_PER_SCALE, Math.round(throughputLabour * LABOUR_MULTIPLIER));
};

export const withDerivedWorkers = <T extends { needs: ResourceQuantity[]; produces: ResourceQuantity[] }>(
    profile: WorkerProfile,
    facility: T,
): T & { workerRequirement: Record<EducationLevelType, number> } => ({
    ...facility,
    workerRequirement: workers(profile, headcountPerScaleFor(facility)),
});
