import type { EducationLevelType } from '../population/education';
import type { ShipType } from '../ships/ships';
import type { Resource, ResourceProcessLevel, ResourceQuantity } from './claims';
import type { PlanetaryId } from './planet';
import type { RESOURCE_LEVELS } from './resourceCatalog';

export type ConstructionState = {
    type: 'new' | 'expansion';
    constructionTargetMaxScale: number;
    totalConstructionServiceRequired: number;
    maximumConstructionServiceConsumption: number;
    progress: number;
    lastTickInvestedConstructionServices: number;
} | null;

export type FacilityType = (typeof RESOURCE_LEVELS)[number] | 'storage' | 'management' | 'ship_construction';
export const getFacilityType = (facility: Facility): FacilityType => {
    if (facility.type === 'production') {
        return facility.produces.reduce((prev, curr) => {
            if (curr.resource.level === 'services' || prev === 'services') {
                return 'services';
            }
            if (curr.resource.level === 'manufactured' || prev === 'manufactured') {
                return 'manufactured';
            }
            if (curr.resource.level === 'refined' || prev === 'refined') {
                return 'refined';
            }
            return 'raw';
        }, 'raw' as ResourceProcessLevel);
    }
    return facility.type;
};

export const MINIMUM_CONSTRUCTION_TIME_IN_TICKS = 30;
const constructionCostFactor = 3000;
const facilityConstructionCostMultiplier: Record<FacilityType, number> = {
    raw: 1,
    refined: 2,
    manufactured: 4,
    services: 3,
    storage: 1.5,
    management: 2.5,
    ship_construction: 5,
};

export const calculateCostsForConstruction = (
    facilityType: FacilityType,
    currentScale: number,
    targetScale: number,
): number => {
    if (targetScale <= currentScale) {
        return 0;
    }

    const m = facilityConstructionCostMultiplier[facilityType];
    const integralTerm = (Math.pow(targetScale, 1.1) - Math.pow(currentScale, 1.1)) / 1.1;
    const linearTerm = targetScale - currentScale;

    return Math.round(m * constructionCostFactor * (integralTerm + linearTerm));
};

export type FacilityBase = PlanetaryId & {
    type: 'production' | 'storage' | 'management' | 'ship_construction';
    name: string;
    maxScale: number;
    scale: number;
    construction: ConstructionState;
    lastConstructionCompletedTick: number;

    powerConsumptionPerTick: number;
    workerRequirement: {
        [EduLevel in EducationLevelType]?: number;
    };
    pollutionPerTick: {
        air: number;
        water: number;
        soil: number;
    };
};

export type FacilityCategory = FacilityBase['type'];

export type LastTickResults = {
    overallEfficiency: number;
    workerEfficiency: { [edu in EducationLevelType]?: number };

    exactUsedByEdu: { [jobEdu in EducationLevelType]?: number };
    totalUsedByEdu: { [workerEdu in EducationLevelType]?: number };

    overqualifiedWorkers: {
        [jobEdu in EducationLevelType]?: {
            [workerEdu in EducationLevelType]?: number;
        };
    };

    wageCosts: number;
    inputCosts: number;
    costBalance: number;

    resourceEfficiency: { [resourceName: string]: number };
    lastConsumed: { [resourceName: string]: number };
};

export type LastProductionTickResults = LastTickResults & {
    lastProduced: { [resourceName: string]: number };
    revenue: number;
};

export type PidState = {
    integral: number;
    prevError: number;
    filteredError: number;
    expansionIntegral: number;
    contractionIntegral: number;
};

export type ProductionFacility = FacilityBase & {
    type: 'production';
    needs: ResourceQuantity[];
    produces: ResourceQuantity[];

    lastTickResults: LastProductionTickResults;
    pidState?: PidState | null;
};

export type StorageFacility = FacilityBase & {
    type: 'storage';
    capacity: {
        volume: number;
        mass: number;
    };
    current: {
        volume: number;
        mass: number;
    };
    currentInStorage: {
        [resourceName in string]: ResourceQuantity;
    };

    lastTickResults: LastTickResults;

    escrow: { [resourceName in string]: number };
};

export type ManagementFacility = FacilityBase & {
    type: 'management';
    needs: ResourceQuantity[];

    bufferPerTickPerScale: number;
    maxBuffer: number;
    buffer: number;
    lastTickResults: LastTickResults;
};

export type ShipConstructionFacility = FacilityBase & {
    type: 'ship_construction';
    shipName: string;
    produces: ShipType | null;
    progress: number;
    lastTickResults: LastTickResults;
};

export type Facility = ProductionFacility | StorageFacility | ManagementFacility | ShipConstructionFacility;

export const createLastTickResults = (): LastTickResults => ({
    overallEfficiency: 0,
    workerEfficiency: {},
    resourceEfficiency: {},
    overqualifiedWorkers: {},
    exactUsedByEdu: {},
    totalUsedByEdu: {},
    wageCosts: 0,
    inputCosts: 0,
    costBalance: 0,
    lastConsumed: {},
});

export const putIntoStorageFacility = (
    storage: StorageFacility,
    resource: Resource,
    additionalQuantity: number,
): number => {
    const current = storage.currentInStorage[resource.name]?.quantity || 0;

    const volumeRestriction =
        resource.volumePerQuantity > 0
            ? Math.min(
                  1,
                  (storage.capacity.volume * storage.scale - storage.current.volume) /
                      (additionalQuantity * resource.volumePerQuantity),
              )
            : 1;

    const massRestriction =
        resource.massPerQuantity > 0
            ? Math.min(
                  1,
                  (storage.capacity.mass * storage.scale - storage.current.mass) /
                      (additionalQuantity * resource.massPerQuantity),
              )
            : 1;

    const overallRestriction = Math.min(volumeRestriction, massRestriction);

    storage.currentInStorage[resource.name] = {
        resource,
        quantity: current + additionalQuantity * overallRestriction,
    };

    storage.current.volume += additionalQuantity * resource.volumePerQuantity * overallRestriction;
    storage.current.mass += additionalQuantity * resource.massPerQuantity * overallRestriction;

    return additionalQuantity * overallRestriction;
};

export const queryStorageFacility = (storage: StorageFacility | undefined, resourceName: string): number => {
    if (!storage) {
        return 0;
    }
    const total = storage.currentInStorage[resourceName]?.quantity ?? 0;
    const escrowed = storage.escrow[resourceName] ?? 0;
    return Math.max(0, total - escrowed);
};

export const getAvailableStorageCapacity = (storage: StorageFacility, resource: Resource): number => {
    const freeVolume = storage.capacity.volume * storage.scale - storage.current.volume;
    const freeMass = storage.capacity.mass * storage.scale - storage.current.mass;
    const byVolume = resource.volumePerQuantity > 0 ? freeVolume / resource.volumePerQuantity : Infinity;
    const byMass = resource.massPerQuantity > 0 ? freeMass / resource.massPerQuantity : Infinity;
    return Math.max(0, Math.min(byVolume, byMass));
};

// returns the quantity actually removed
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

export const lockIntoEscrow = (storage: StorageFacility, resourceName: string, quantity: number): number => {
    const locked = Math.min(queryStorageFacility(storage, resourceName), quantity);
    if (locked <= 0) {
        return 0;
    }
    storage.escrow[resourceName] = (storage.escrow[resourceName] ?? 0) + locked;
    return locked;
};

export const releaseFromEscrow = (storage: StorageFacility, resourceName: string, quantity: number): void => {
    const current = storage.escrow[resourceName] ?? 0;
    storage.escrow[resourceName] = Math.max(0, current - quantity);
};

export const transferFromEscrow = (storage: StorageFacility, resourceName: string, quantity: number): number => {
    const escrowed = storage.escrow[resourceName] ?? 0;
    const transferred = Math.min(escrowed, quantity);
    if (transferred <= 0) {
        return 0;
    }
    storage.escrow[resourceName] = escrowed - transferred;
    removeFromStorageFacility(storage, resourceName, transferred);
    return transferred;
};
