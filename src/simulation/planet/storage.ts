import type { PlanetaryId } from './planet';
import type { EducationLevelType } from '../population/education';
import type { Resource } from './planet';

export type Facilility = PlanetaryId & {
    name: string;
    maxScale: number; // Maximum scale level for this facility, agent can reduce scale below this but not increase it above this
    scale: number; // multiplier for everything below; can be adjusted by the agent up to maxScale, but not above to address bottlenecks in production or low demand

    powerConsumptionPerTick: number; // energy consumed per tick while operating at full efficiency
    workerRequirement: {
        [EduLevel in EducationLevelType]?: number; // number of workers required at each education level to operate the facility at full efficiency
    };
    pollutionPerTick: {
        air: number; // pollution generated per tick, contributes to planet's pollution level
        water: number; // pollution generated per tick, contributes to planet's pollution level
        soil: number; // pollution generated per tick, contributes to planet's pollution level
    };
};

/**
 * Detailed per-source efficiency breakdown recorded every production tick.
 * Every value is a fraction in [0, 1] (1 = fully met).
 */
export type LastTickResults = {
    /** Overall efficiency actually applied to production (min of all factors). */
    overallEfficiency: number;

    /** Worker fill rate per education level, incorporating age and tenure productivity.
     *  E.g. { none: 0.8, primary: 1.0 } means "none"-level slots were 80% effective. */
    workerEfficiency: { [edu in EducationLevelType]?: number };

    /** Resource availability per resource name (fraction available / required). */
    resourceEfficiency: { [resourceName: string]: number };

    exactUsedByEdu: { [jobEdu in EducationLevelType]?: number }; // how many workers of each education level filled the job slots (e.g. 3 secondary-educated workers filled primary-level slots)
    totalUsedByEdu: { [workerEdu in EducationLevelType]?: number }; // how many workers of each education level filled any job slots (e.g. 5 secondary-educated workers filled all slots, including secondary-level ones)
    /** Overqualified workers used per *job* education level, broken down by the
     *  actual education of the workers that filled those slots.
     *  E.g. `{ none: { primary: 2, secondary: 1 } }` means 2 primary-educated and
     *  1 secondary-educated workers filled "none"-level slots. */
    overqualifiedWorkers: {
        [jobEdu in EducationLevelType]?: {
            [workerEdu in EducationLevelType]?: number;
        };
    };

    /** Actual units produced per output resource this tick (post-floor, matches storage change). */
    lastProduced: { [resourceName: string]: number };
    /** Actual units consumed per input resource this tick (post-ceil, matches storage change). */
    lastConsumed: { [resourceName: string]: number };
};

export type ProductionFacility = Facilility & {
    needs: { resource: Resource; quantity: number }[];
    produces: { resource: Resource; quantity: number }[];

    /**
     * Detailed results from the last production tick.
     * `undefined` before the first tick has run.
     */
    lastTickResults: LastTickResults;
};

export type StorageFacility = Facilility & {
    capacity: {
        volume: number; // in cubic meters
        mass: number; // in tons
    };
    current: {
        volume: number; // in cubic meters
        mass: number; // in tons
    };
    currentInStorage: {
        [resourceName in string]: { resource: Resource; quantity: number }; // in tons
    };
};

export const putIntoStorageFacility = (
    storage: StorageFacility,
    resource: Resource,
    additionalQuantity: number,
): number => {
    const current = storage.currentInStorage[resource.name]?.quantity || 0;

    const volumeRestriction = Math.min(
        1,
        (storage.capacity.volume * storage.scale - storage.current.volume) / //
            (additionalQuantity * resource.volumePerQuantity),
    );

    const massRestriction = Math.min(
        1,
        (storage.capacity.mass * storage.scale - storage.current.mass) / //
            (additionalQuantity * resource.massPerQuantity),
    );

    const overallRestriction = Math.min(volumeRestriction, massRestriction);

    storage.currentInStorage[resource.name] = {
        resource,
        quantity: current + additionalQuantity * overallRestriction,
    };

    storage.current.volume += additionalQuantity * resource.volumePerQuantity * overallRestriction;
    storage.current.mass += additionalQuantity * resource.massPerQuantity * overallRestriction;

    return additionalQuantity * overallRestriction; // return true if we were able to store the entire additional quantity, false if we hit a capacity limit and only stored part of it
};

export const queryStorageFacility = (storage: StorageFacility | undefined, resourceName: string): number => {
    if (!storage) {
        return 0;
    }
    return storage.currentInStorage[resourceName]?.quantity || 0;
};

export const removeFromStorageFacility = (
    storage: StorageFacility | undefined,
    resourceName: string,
    quantityToRemove: number,
): number => {
    if (!storage) {
        return 0;
    }
    const currentEntry = storage.currentInStorage[resourceName];
    if (!currentEntry) {
        return 0;
    }
    const quantityRemoved = Math.min(currentEntry.quantity, quantityToRemove);
    currentEntry.quantity -= quantityRemoved;
    storage.current.volume -= quantityRemoved * currentEntry.resource.volumePerQuantity;
    storage.current.mass -= quantityRemoved * currentEntry.resource.massPerQuantity;
    return quantityRemoved;
};
