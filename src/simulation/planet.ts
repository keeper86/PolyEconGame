import type { ProductionFacility, Resource, ResourceType, StorageFacility } from './facilities';

// ---------------------------------------------------------------------------
// Wealth-tracking types
// ---------------------------------------------------------------------------

/**
 * Mean and variance of wealth for a group of individuals.
 * Combined across groups using the parallel-axis (pooled-variance) formula.
 */
export interface WealthMoments {
    mean: number;
    variance: number;
}

/** Wealth moments for every education × occupation cell in one age cohort. */
export type WealthCohort = { [L in EducationLevelType]: { [O in Occupation]: WealthMoments } };

/** One entry per age index — a parallel structure to `Population.demography`. */
export type WealthDemography = WealthCohort[];

// ---------------------------------------------------------------------------
// Food market types
// ---------------------------------------------------------------------------

/**
 * Per-cohort-class (age × education × occupation) household food buffer.
 * Parallel structure to WealthDemography.
 */
export interface FoodBuffer {
    /** Current food stock (tons per person in this cell). */
    foodStock: number;
}

/** Food buffer for every edu × occupation cell in one age cohort. */
export type FoodBufferCohort = { [L in EducationLevelType]: { [O in Occupation]: FoodBuffer } };

/** One entry per age index — parallel to Population.demography. */
export type FoodBufferDemography = FoodBufferCohort[];

/**
 * Planet-level food market state.
 *
 * Per-agent pricing: each food-producing agent sets its own price and
 * offer quantity.  The planet-level FoodMarket only tracks household
 * food buffers and the volume-weighted average price (for the price
 * level used elsewhere in the economy).
 */
export interface FoodMarket {
    /**
     * Volume-weighted average clearing price from the most recent tick.
     * Used as the economy-wide price level reference.
     * Updated each market tick from per-agent offers.
     */
    foodPrice: number;
    /**
     * Per-cohort household food buffers.
     * Lazily initialised, parallel to Population.demography.
     */
    householdFoodBuffers?: FoodBufferDemography;
    /**
     * Full-resolution transfer tensor: age × education × occupation.
     *
     * Values are net transfers (currency units):
     *   Positive = received, Negative = given.
     *
     * Global zero-sum invariant: the sum of all cells equals zero.
     *
     * Written each tick by `intergenerationalTransfersTick`.
     * Consumed by the frontend for the transfer chart — no re-simulation
     * on the client.  Outer array index = age.
     */
    lastTransferMatrix?: TransferMatrix;
}

/**
 * Per-age × education × occupation transfer tensor.
 * Outer array indexed by age.  Each entry maps edu → occ → net transfer amount.
 */
export type TransferCohort = { [L in EducationLevelType]: { [O in Occupation]: number } };
export type TransferMatrix = TransferCohort[];

// ---------------------------------------------------------------------------
// Banking types
// ---------------------------------------------------------------------------

/**
 * Single combined central + commercial bank per planet.
 * Money is created when loans are issued and destroyed when repaid.
 */
export interface Bank {
    /** Total outstanding loans to firms (asset side of the bank's balance sheet). */
    loans: number;
    /**
     * Total deposits held at the bank (liability side).
     * Invariant: deposits === firmDeposits + householdDeposits,
     * where firmDeposits = Σ agent.deposits for all agents on this planet.
     */
    deposits: number;
    /**
     * Aggregate household deposit balance (currency units).
     * Wages flow into this account; consumption flows out.
     * Tracks the monetary component of household wealth that is held
     * as bank deposits (as opposed to non-monetary wealth in wealthDemography).
     */
    householdDeposits: number;
    /** Bank's own equity = deposits − loans. */
    equity: number;
    /** Interest rate on loans per tick (0 = no interest for initial implementation). */
    loanRate: number;
    /** Interest rate on deposits per tick (0 = no interest for initial implementation). */
    depositRate: number;
}

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
 * (notice-period slots indexed 0 = soonest to depart) and a retiring pipeline
 * (workers transitioning to retirement / unableToWork).
 */
export interface TenureCohort {
    active: Record<EducationLevelType, number>;
    /** Departing pipeline (voluntary quit + fired combined): each slot is one
     *  month of notice remaining.  Slot 0 = workers whose notice expires this month. */
    departing: Record<EducationLevelType, number[]>;
    /** Subset of `departing` that tracks only **fired** workers.  The voluntary-quit
     *  count for any slot is `departing[edu][m] − departingFired[edu][m]`. */
    departingFired: Record<EducationLevelType, number[]>;
    /** Retiring pipeline: same structure as departing but workers are routed to
     *  'unableToWork' in the population demography instead of 'unoccupied'. */
    retiring: Record<EducationLevelType, number[]>;
    /** Age distribution moments (mean, variance) per education level for active workers. */
    ageMoments: Record<EducationLevelType, AgeMoments>;
    /** Wealth moments (mean, variance) per education level for active workers. */
    wealthMoments: Record<EducationLevelType, WealthMoments>;
    /** Wealth moments per education level for each slot in the departing pipeline. */
    departingWealth: Record<EducationLevelType, WealthMoments[]>;
    /** Wealth moments per education level for each slot in the retiring pipeline. */
    retiringWealth: Record<EducationLevelType, WealthMoments[]>;
}

/** Array of TenureCohort indexed by tenure year (0 = first year of employment). */
export type WorkforceDemography = TenureCohort[];

/**
 * Accumulator keyed by education × occupation, used by the population
 * pipeline to record per-tick events (deaths, new disabilities) so that
 * downstream systems (e.g. workforce sync) can consume them without
 * intermediate parameters being threaded through the orchestrator.
 */
export type PopulationTickAccumulator = Record<EducationLevelType, Record<Occupation, number>>;

// Population = array of cohorts, index = age (0 = newborns)
export type Population = {
    demography: Cohort[];
    /**
     * Wealth moments (mean, variance) for every age × edu × occupation cell.
     * Parallel structure to `demography`.  Lazily initialised on first use.
     */
    wealthDemography?: WealthDemography;
    // starvationLevel: 0 = no starvation, 1 = full starvation (very high immediate mortality)
    // This persists across ticks and is updated by the simulation engine.
    starvationLevel: number;

    /**
     * Deaths that occurred during the current tick, keyed by
     * education × occupation.  Written by the mortality step, consumed by
     * the workforce sync step, then reset at the start of the next tick.
     * Available for snapshot / observability.
     */
    tickDeaths?: PopulationTickAccumulator;

    /**
     * New disability transitions that occurred during the current tick,
     * keyed by education × source-occupation.  Written by the disability
     * step.  Available for snapshot / observability.
     */
    tickNewDisabilities?: PopulationTickAccumulator;

    /**
     * New retirement transitions that occurred during the current tick,
     * keyed by education × source-occupation.  Written by the retirement
     * step, consumed by the workforce sync step.
     * Available for snapshot / observability.
     */
    tickNewRetirements?: PopulationTickAccumulator;
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
    claimAgentId: string | null; // who currently claims this resource (Company or Government), null if unclaimed
    tenantAgentId: string | null; // who is currently using this resource (Company or Government), null if not currently used. For example, a farm could be claimed by a government but currently operated by a company as tenant.
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
    governmentId: string;
    infrastructure: Infrastructure;
    environment: Environment;
    /** Combined central + commercial bank for this planet. */
    bank: Bank;
    /** Food market state: pricing, inventory, household food buffers. */
    foodMarket?: FoodMarket;
    /**
     * Wage per education level (currency units per worker per tick).
     * Defaults to 1.0 for all levels when not set.
     */
    wagePerEdu?: Partial<Record<EducationLevelType, number>>;
    /**
     * Current price level P (nominal price per unit of physical output).
     * Initialized to 1.0; updated each post-production financial tick.
     */
    priceLevel?: number;
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
            /** Firm deposit balance for this agent on this planet (currency units). */
            deposits: number;
            /** Outstanding loan principal for this agent on this planet (currency units). */
            loans?: number;
            /**
             * Last tick's wage bill (currency units).
             * Used by the retained-earnings threshold for partial loan repayment.
             */
            lastWageBill?: number;

            // ----- Per-agent food market pricing fields -----

            /**
             * Current food offer price set by this agent (currency/ton).
             * Set by `updateAgentPricing` each tick before market clearing.
             * Human-controllable: players can override this value.
             */
            foodOfferPrice?: number;
            /**
             * Quantity of food offered for sale this tick (tons).
             * Drawn from the agent's storage facility.  Defaults to the
             * full amount of agricultural product in storage.
             */
            foodOfferQuantity?: number;
            /**
             * Food produced during the last production tick (tons).
             * Recorded by the production transfer step; used by the
             * pricing AI to form its adjustment metric.
             */
            lastFoodProduced?: number;
            /**
             * Food actually sold during the last market clearing tick (tons).
             * Written by the market clearing step; consumed by the pricing
             * AI on the next tick.
             */
            lastFoodSold?: number;

            allocatedWorkers: {
                [L in EducationLevelType]: number;
            };
            /**
             * Workers left idle after all production facilities drew their
             * requirements in the last production tick.  Persisted so that
             * `updateAllocatedWorkers` can reduce hiring targets when too many
             * workers sit unused.
             */
            unusedWorkers?: {
                [L in EducationLevelType]: number;
            };
            /** Fraction of total hired workforce that was idle last tick (0–1). */
            unusedWorkerFraction?: number;
            /**
             * Aggregated overqualified-worker matrix across all production
             * facilities on this planet.  `overqualifiedMatrix[jobEdu][workerEdu]`
             * tells how many workers educated at `workerEdu` are filling slots
             * that only require `jobEdu`.
             */
            overqualifiedMatrix?: {
                [jobEdu in EducationLevelType]?: {
                    [workerEdu in EducationLevelType]?: number;
                };
            };
            /**
             * Workers hired during the current tick, per education level.
             * Reset at the start of every `laborMarketTick` call and
             * accumulated during the hiring phase.  Used by the UI to show
             * "Hired this month" in the workforce cards.
             */
            hiredThisTick?: {
                [L in EducationLevelType]: number;
            };
            /**
             * Workers fired (given notice) during the current tick, per
             * education level.  Reset at the start of every `laborMarketTick`
             * and accumulated during the firing phase.  This captures the
             * moment of firing (at notice), not when workers actually leave
             * the departing pipeline.
             */
            firedThisTick?: {
                [L in EducationLevelType]: number;
            };
            /**
             * Snapshot of active workers per education level taken at the
             * start of each month (month boundary).  Used by the UI to show
             * "Δ month" — the change in headcount since the month began.
             * Updated in `laborMarketMonthTick` before any monthly processing.
             */
            activeAtMonthStart?: {
                [L in EducationLevelType]: number;
            };
            /**
             * Deaths that occurred since the start of the current month,
             * per education level.  Accumulated in
             * `applyPopulationDeathsToWorkforce` and reset at month
             * boundaries in `laborMarketMonthTick`.
             */
            deathsThisMonth?: {
                [L in EducationLevelType]: number;
            };
            /**
             * Deaths from the previous month, per education level.
             * Rotated from `deathsThisMonth` at each month boundary
             * so the UI can show "deaths (prev month)".
             */
            deathsPrevMonth?: {
                [L in EducationLevelType]: number;
            };
            /**
             * Number of unoccupied (available for hiring) people per
             * education level on the associated planet's labor market.
             * Updated at the start of each `laborMarketTick` call so the
             * UI can display how deep the hiring pool is.
             */
            availableOnMarket?: {
                [L in EducationLevelType]: number;
            };
            workforceDemography?: WorkforceDemography;
        };
    };
};

export type Company = Agent;

export interface GameState {
    tick: number;
    planets: Map<string, Planet>;
    agents: Map<string, Agent>; // includes governments and companies, can be extended in the future for individuals, organizations, etc.
}
