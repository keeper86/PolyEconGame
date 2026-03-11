import type { EducationLevelType, Population } from '../population/population';
import type { WorkforceCohort, WorkforceCategory } from '../workforce/workforce';
import type { ProductionFacility, Resource, ResourceType, StorageFacility } from './facilities';

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
     *
     * Invariant: this must always equal the sum of per-cohort monetary
     * wealth across the entire population demography:
     *   householdDeposits === Σ (category.total × category.wealth.mean)
     *
     * Updated incrementally by each subsystem that mutates household
     * wealth: preProductionFinancialTick (+wages), foodMarket (−purchases),
     * mortality (−deceased wealth), intergenerationalTransfers (zero-sum).
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

export type AgentMarketPosition = {
    limits: {
        mass: number; // maximum mass of resources this agent can buy/sell per tick
        volume: number; // maximum volume of resources this agent can buy/sell per tick
        buy: number; // maximum total expenditure this agent can spend on buying resources per tick (currency units)
        sell: number; // maximum total revenue this agent can earn from selling resources per tick (currency units)
    };
    // quantity in tons or pieces depending on the resource type
    // price per ton or piece depending on the resource type
    buy: {
        [resourceName in string]: { resource: Resource; quantity: number; price: number };
    };
    sell: {
        [resourceName in string]: { resource: Resource; quantity: number; price: number };
    };
};

export type PlanetaryMarket = {
    agentPositions: {
        [agentId in string]: AgentMarketPosition;
    };
    populationDemand: {
        [resourceName in string]: { resource: Resource; quantity: number; price: number };
    };
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

// ---------------------------------------------------------------------------
// Per-education record helper type
// ---------------------------------------------------------------------------

export type PerEducation = { [L in EducationLevelType]?: number };

// ---------------------------------------------------------------------------
// Sub-objects that group related intermediate/feedback state
// ---------------------------------------------------------------------------

/**
 * Demographic events (deaths, disabilities, retirements) tracked per
 * education level for this month and the previous month.
 * Written by `workforceSync` (thisTick accumulators) and rotated at
 * month boundaries by `postProductionLaborMarketTick`.
 */
export type DemographicEventCounters = {
    thisMonth: PerEducation;
    prevMonth: PerEducation;
};

export const createEmptyDemographicEventCounters = (): DemographicEventCounters => ({
    thisMonth: {},
    prevMonth: {},
});

/**
 * Production-feedback results persisted per tick so that
 * `updateAllocatedWorkers` (next tick) can adjust hiring targets.
 * Written by `productionTick`.
 */
export type WorkforceTickResults = {
    /**
     * Workers left idle after all production facilities drew their
     * requirements.  Can be negative when demand exceeds supply.
     */
    unusedWorkers: PerEducation;
    /** Fraction of total hired workforce that was idle (0–1). */
    unusedWorkerFraction: number;
    /**
     * Aggregated overqualified-worker matrix across all production
     * facilities.  `[jobEdu][workerEdu]` = count of `workerEdu`
     * workers filling `jobEdu` slots.
     */
    overqualifiedMatrix?: {
        [jobEdu in EducationLevelType]?: {
            [workerEdu in EducationLevelType]?: number;
        };
    };
};

/**
 * Per-agent food market pricing state.
 * Written by `updateAgentPricing` and `foodMarketTick`.
 */
export type FoodMarketState = {
    /**
     * Current food offer price set by this agent (currency/ton).
     * Human-controllable: players can override this value.
     */
    offerPrice?: number;
    /**
     * Quantity of food offered for sale this tick (tons).
     * Drawn from the agent's storage facility.
     */
    offerQuantity?: number;

    /** Food actually sold during the last market clearing tick (tons). */
    lastSold?: number;
    lastRevenue?: number; // in currency units, for price adjustment logic

    priceDirection?: number;
};

// ---------------------------------------------------------------------------
// AgentPlanetAssets
// ---------------------------------------------------------------------------

export type AgentPlanetAssets = {
    resourceClaims: string[]; // resource claims owned by this agent
    resourceTenancies: string[]; // resource claims where this agent is the tenant
    productionFacilities: ProductionFacility[];
    workforceDemography: WorkforceCohort<WorkforceCategory>[];
    storageFacility: StorageFacility;

    // ----- Financial state -----

    /** Firm deposit balance for this agent on this planet (currency units). */
    deposits: number;
    /** Outstanding loan principal for this agent on this planet (currency units). */
    loans: number;
    /**
     * Last tick's wage bill (currency units).
     * Used by the retained-earnings threshold for partial loan repayment.
     */
    lastWageBill?: number;

    // ----- Food market state -----

    /** Per-agent food market pricing & history. */
    foodMarket?: FoodMarketState;

    // ----- Workforce -----

    allocatedWorkers: PerEducation;

    /**
     * Production-feedback results from the last tick (idle workers,
     * overqualified matrix).  Used by `updateAllocatedWorkers`.
     * `undefined` before the first production tick.
     */
    workerFeedback?: WorkforceTickResults;

    // ----- Demographic event tracking -----

    /** Deaths affecting this agent's workforce, per education level. */
    deaths: DemographicEventCounters;
    /** Disabilities affecting this agent's workforce, per education level. */
    disabilities: DemographicEventCounters;
};

export type Agent = {
    id: string;
    name: string;
    associatedPlanetId: string;
    transportShips: TransportShip[];
    assets: {
        [planetId in string]: AgentPlanetAssets;
    };
};

export interface GameState {
    tick: number;
    planets: Map<string, Planet>;
    agents: Map<string, Agent>;
}
