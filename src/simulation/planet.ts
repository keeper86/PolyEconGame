import type { ProductionFacility, Resource, ResourceType, StorageFacility } from './facilities';

export type PlanetaryId = {
    planetId: string;
    id: string;
};

export type TransportShipType = {
    name: string;
    speed: number; // in light years per tick
    cargoSpecification: {
        type: ResourceType; // type of resource this ship can carry
        volume: number; // in cubic meters
        mass: number; // in tons
    };
};

export type TransportShipStatusTransporting = {
    type: 'transporting';
    from: string; // planet id
    to: string; // planet id
    cargo: ResourceQuantity & { quantity: number }; // current cargo, null if empty
    arrivalTick: number; // tick when the ship will arrive at destination
};

export type TransportShipStatusIdle = {
    type: 'idle';
};

export type TransportShipStatusMaintenance = {
    type: 'maintenance';
    doneAtTick: number; // tick when maintenance will be completed
};

export type TransportShipStatus =
    | TransportShipStatusIdle
    | TransportShipStatusMaintenance
    | TransportShipStatusTransporting;

export interface TransportShip {
    id: string;
    name: string;
    state: TransportShipStatus;
    maintainanceStatus: number; // percentage (0-100) of how well maintained the ship is, affects speed and breakdown chance
}

export const maxAge: number = 100;

// Enums as before
// Use string literal unions + exported key arrays so we can iterate safely
export type EducationLevelType = 'none' | 'primary' | 'secondary' | 'tertiary' | 'quaternary';
export type EducationLevel = {
    type: EducationLevelType;
    name: string;
    nextEducation: () => EducationLevel | null;
    description: string;
    graduationAge: number;
    graduationPreAgeProbability: number; // probability of a year earlier graduation. two years  => probability**2 ...
    graduationProbability: number;
    genericDropoutProbability: number;
    transitionProbability: number;
};
export const educationLevels: { [key in EducationLevelType]: EducationLevel } = {
    none: {
        name: 'None',
        type: 'none',
        nextEducation: () => educationLevels.primary,
        description: 'No formal education. Attending Elementary school.',
        graduationAge: 9,
        graduationPreAgeProbability: 0.1, // graduation = starting primary school at age 5,6,7
        graduationProbability: 0.9,
        genericDropoutProbability: 0.01,
        transitionProbability: 0.95,
    },
    primary: {
        name: 'Primary',
        type: 'primary',
        nextEducation: () => educationLevels.secondary,
        description: 'Primary education. Attending High School.',
        graduationAge: 17,
        graduationPreAgeProbability: 0.1, // graduation can occur between 16 and 18
        graduationProbability: 0.75,
        genericDropoutProbability: 0.02,
        transitionProbability: 0.4,
    },
    secondary: {
        name: 'Secondary',
        type: 'secondary',
        nextEducation: () => educationLevels.tertiary,
        description: 'Secondary education. Attending University.',
        graduationAge: 22,
        graduationPreAgeProbability: 0.15, // graduation can occur between 18 and 26
        graduationProbability: 0.5,
        genericDropoutProbability: 0.06,
        transitionProbability: 0.3,
    },
    tertiary: {
        name: 'Tertiary',
        type: 'tertiary',
        nextEducation: () => educationLevels.quaternary,
        description: 'Tertiary education. Attending Postgraduate.',
        graduationAge: 27,
        graduationPreAgeProbability: 0.1, // graduation can occur between 27 and 33
        graduationProbability: 0.1,
        genericDropoutProbability: 0.1,
        transitionProbability: 0,
    },
    quaternary: {
        name: 'Quaternary',
        type: 'quaternary',
        nextEducation: () => null,
        description: 'Quaternary education. Finished all education levels.',
        graduationAge: maxAge,
        graduationPreAgeProbability: 0,
        graduationProbability: 0,
        genericDropoutProbability: 1,
        transitionProbability: 0,
    },
} as const;
export const educationLevelKeys = Object.keys(educationLevels) as EducationLevelType[];

export const OCCUPATIONS = ['unoccupied', 'company', 'government', 'education', 'unableToWork'] as const;
export type Occupation = (typeof OCCUPATIONS)[number];

// A single age cohort: mapping education -> occupation -> count
export type Cohort = { [L in EducationLevelType]: { [O in Occupation]: number } };

/** Age distribution moments for a single (tenure × education) cohort. */
export interface AgeMoments {
    mean: number;
    variance: number; // population variance
}

/**
 * A single tenure-year bucket in the workforce demography.
 * Tracks workers actively working at this tenure level plus a departing pipeline
 * (notice-period slots indexed 0 = soonest to depart).
 */
export interface TenureCohort {
    active: Record<EducationLevelType, number>;
    /** Departing pipeline: each slot is one month of notice remaining.
     *  Slot 0 = workers whose notice expires this month. */
    departing: Record<EducationLevelType, number[]>;
    /** Age distribution moments (mean, variance) per education level for active workers. */
    ageMoments: Record<EducationLevelType, AgeMoments>;
}

/** Array of TenureCohort indexed by tenure year (0 = first year of employment). */
export type WorkforceDemography = TenureCohort[];

// Population = array of cohorts, index = age (0 = newborns)
export type Population = {
    demography: Cohort[];
    // starvationLevel: 0 = no starvation, 1 = full starvation (very high immediate mortality)
    // This persists across ticks and is updated by the simulation engine.
    starvationLevel: number;
};

export type Infrastructure = {
    primarySchools: number;
    secondarySchools: number;
    universities: number;
    hospitals: number;
    mobility: {
        roads: number; // total length of roads in km
        railways: number; // total length of railways in km
        airports: number; // number of airports
        seaports: number; // number of seaports
        spaceports: number; // number of spaceports
    };
    energy: {
        production: number; // total energy production in MWh
    };
};

export type Environment = {
    naturalDisasters: {
        earthquakes: number; // average number of earthquakes per year
        floods: number; // average number of floods per year
        storms: number; // average number of storms per year
    };

    pollution: {
        air: number; // scale from 0 (clean) to 100 (hazardous), affects population health and growth
        water: number; // scale from 0 (clean) to 100 (heavily polluted)
        soil: number; // scale from 0 (clean) to 100 (heavily contaminated)
    };

    regenerationRates: {
        air: {
            constant: number; // IndexPoints per year that the air quality index improves naturally
            percentage: number; // percentage of current air pollution that regenerates naturally per year
        };
        water: {
            constant: number; // IndexPoints per year that the water pollution level decreases naturally
            percentage: number; // percentage of current water pollution that regenerates naturally per year
        };
        soil: {
            constant: number; // IndexPoints per year that the soil contamination level decreases naturally
            percentage: number; // percentage of current soil contamination that regenerates naturally per year
        };
    };
};
export type ResourceQuantity = {
    type: Resource;
    quantity: number; // in tons or pieces, depending on the phase
};

export type ResourceClaim = {
    id: string;
    claim: Agent | null; // who currently claims this resource (Company or Government), null if unclaimed
    tenant: Agent | null; // who is currently using this resource (Company or Government), null if not currently used. For example, a farm could be claimed by a government but currently operated by a company as tenant.
    tenantCostInCoins: number; // how much the tenant pays per tick to the claim owner (e.g. rent for a farm), 0 if no tenant
    regenerationRate: number; // quantity regenerated per year (for renewable resources), 0 for non-renewable
    maximumCapacity: number; // maximum quantity that can be stored in this claim, e.g. for a farm or a mine with limited capacity. For non-renewable resources, this is the initial quantity.
};

export type Planet = {
    id: string;
    name: string;
    position: {
        x: number;
        y: number;
        z: number;
    };
    population: Population;
    resources: {
        [resourceName in string]: (ResourceQuantity & ResourceClaim)[];
    };
    government: Agent;
    infrastructure: Infrastructure;
    environment: Environment;
};

export type Agent = {
    id: string;
    name: string;
    associatedPlanetId: string; // the planet where the company is based
    wealth: number;
    transportShips: TransportShip[];
    assets: {
        [planetId in string]: {
            resourceClaims: string[]; // resource claims owned by this agent
            resourceTenancies: string[]; // resource claims where this agent is the tenant
            productionFacilities: ProductionFacility[];
            storageFacility: StorageFacility;

            allocatedWorkers: {
                [L in EducationLevelType]: number;
            };
            workforceDemography?: WorkforceDemography;
        };
    };
};

export type Company = Agent;
