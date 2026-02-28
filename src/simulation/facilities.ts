import type { PlanetaryId, EducationLevelType } from './planet';

export type Resource = {
    name: string;
    // solids, liquids, frozenGoods and gases count quantity in tons, persons/pieces count quantity in pieces and
    type: 'solid' | 'liquid' | 'gas' | 'pieces' | 'persons' | 'frozenGoods' | 'landBoundResource';
    volumePerQuantity: number; //  in cubic meters per ton or piece, used for cargo capacity calculations
    massPerQuantity: number; // in tons per ton or piece, used for mass capacity calculations, if not provided we assume 1:1 with volume-based quantity (e.g. 1 ton of water takes up 1 cubic meter, so massPerQuantity = 1)
};
export type ResourceType = Resource['type'];

export const ironOreDepositResourceType: Resource = {
    name: 'Iron Ore Deposit',
    type: 'landBoundResource',
    volumePerQuantity: Number.MAX_SAFE_INTEGER, // 1 ton of iron takes up 0.3 cubic meters
    massPerQuantity: Number.MAX_SAFE_INTEGER, // 1 ton of iron takes up 0.3 cubic meters
};

export const ironOreResourceType: Resource = {
    name: 'Iron Ore',
    type: 'solid',
    volumePerQuantity: 0.3, // 1 ton of iron takes up 0.3 cubic meters
    massPerQuantity: 1, // 1 ton of iron has a mass of 1 ton
};

export const waterSourceResourceType: Resource = {
    name: 'Water Source',
    type: 'landBoundResource',
    volumePerQuantity: Number.MAX_SAFE_INTEGER, // 1 ton of water takes up 1 cubic meters
    massPerQuantity: Number.MAX_SAFE_INTEGER, // 1 ton of water takes up 1 cubic meters
};

export const waterResourceType: Resource = {
    name: 'Water',
    type: 'liquid',
    volumePerQuantity: 1, // 1 ton of water takes up 1 cubic meters
    massPerQuantity: 1, // 1 ton of water takes up 1 cubic meters
};

export const arableLandResourceType: Resource = {
    name: 'Arable Land',
    type: 'landBoundResource',
    volumePerQuantity: Number.MAX_SAFE_INTEGER, // arable land is not transported, so we can treat it as taking up infinite volume to prevent it from being put in cargo/storage facilities
    massPerQuantity: Number.MAX_SAFE_INTEGER, // arable land is not transported, so we can treat it as having infinite mass to prevent it from being put in cargo/storage facilities
};

export const agriculturalProductResourceType: Resource = {
    name: 'Agricultural Product',
    type: 'frozenGoods',
    volumePerQuantity: 0.5, // 1 ton of agricultural product takes up 0.5 cubic meters
    massPerQuantity: 1, // 1 ton of agricultural product has a mass of 1 ton
};

export type Facilility = PlanetaryId & {
    name: string;
    scale: number; // multiplier for everything below

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

    /** Combined worker efficiency (the minimum across all required edu levels). */
    workerEfficiencyOverall: number;

    /** Resource availability per resource name (fraction available / required). */
    resourceEfficiency: { [resourceName: string]: number };

    /** Overqualified workers used per *job* education level, broken down by the
     *  actual education of the workers that filled those slots.
     *  E.g. `{ none: { primary: 2, secondary: 1 } }` means 2 primary-educated and
     *  1 secondary-educated workers filled "none"-level slots. */
    overqualifiedWorkers: {
        [jobEdu in EducationLevelType]?: {
            [workerEdu in EducationLevelType]?: number;
        };
    };
};

export type ProductionFacility = Facilility & {
    needs: { resource: Resource; quantity: number }[];
    produces: { resource: Resource; quantity: number }[];

    /**
     * Detailed results from the last production tick.
     * `undefined` before the first tick has run.
     */
    lastTickResults?: LastTickResults;

    /** @deprecated Use `lastTickResults.overallEfficiency` instead. Kept for backward-compat during migration. */
    lastTickEfficiencyInPercent: number;

    /** @deprecated Use `lastTickResults.overqualifiedWorkers` instead. Kept for backward-compat during migration. */
    lastTickOverqualifiedWorkers?: { [jobEdu in EducationLevelType]?: number };
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
