import { TICKS_PER_MONTH } from '../constants';
import type { EducationLevelType, Population } from '../population/population';
import type { WorkforceCohort, WorkforceCategory } from '../workforce/workforce';
import type { ResourceName } from './resourceCatalog';
import type { ManagementFacility, ProductionFacility, StorageFacility } from './facility';
import type { ResourceType, ResourceQuantity, Resource, ResourceClaim } from './claims';

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

export type AgentMarketPosition = {
    limits: {
        mass: number; // maximum mass of resources this agent can buy/sell per tick
        volume: number; // maximum volume of resources this agent can buy/sell per tick
        buy: number; // maximum total expenditure this agent can spend on buying resources per tick (currency units)
        sell: number; // maximum total revenue this agent can earn from selling resources per tick (currency units)
    };

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
     * TODO: move this to own type in market.
     */
    marketPrices: {
        [resourceName in ResourceName]: number;
    };

    lastMarketResult: {
        [resourceName: string]: MarketResult;
    };

    avgMarketResult: {
        [resourceName: string]: MarketResult;
    };

    monthPriceAcc: {
        [resourceName: string]: { min: number; max: number; sum: number; count: number };
    };
};

export type PerEducation = { [L in EducationLevelType]?: number };

export type DemographicEventCounters = {
    thisMonth: PerEducation;
    prevMonth: PerEducation;
};

export const createEmptyDemographicEventCounters = (): DemographicEventCounters => ({
    thisMonth: {},
    prevMonth: {},
});

export type AgentMarketOfferState = {
    /** The resource being offered. */
    resource: Resource;

    offerPrice?: number;

    offerRetainment?: number;
    /** Units actually sold during the last market clearing tick. */
    lastSold?: number;
    /** Revenue earned during the last market clearing tick (currency units). */
    lastRevenue?: number;
    /** Quantity actually placed into the order book last tick (capped by free stock). */
    lastPlacedQty?: number;
    /** Offer price that was actually submitted to the order book last tick. */
    lastOfferPrice?: number;
    /** Tâtonnement price-direction hint (−1 / 0 / +1). */
    priceDirection?: number;
    /** When true, the automatic pricing engine manages this offer each tick. */
    automated?: boolean;
};

export type AgentMarketBidState = {
    /** The resource being sought. */
    resource: Resource;
    bidPrice?: number;
    /**
     * Fill storage up to this level — bid quantity per tick is computed
     * dynamically as `max(0, bidStorageTarget − inventory)`.
     * Human-settable.
     */
    bidStorageTarget?: number;
    /** Units actually purchased during the last market clearing tick. */
    lastBought?: number;
    /** Total expenditure during the last market clearing tick (currency units). */
    lastSpent?: number;
    /** Quantity actually placed into the order book last tick (scaled by available deposits). */
    lastEffectiveQty?: number;
    /** Bid price that was actually submitted to the order book last tick. */
    lastBidPrice?: number;

    storageFullWarning?: boolean;

    depositScaleWarning?: 'scaled' | 'dropped';

    storageScaleWarning?: 'scaled' | 'dropped';
    /** When true, the automatic pricing engine manages this bid each tick. */
    automated?: boolean;
};

/**
 * All market offers posted by one agent on one planet.
 * Keyed by resource name so offer lookup is O(1).
 */
export type AgentMarketOffers = {
    sell: {
        [resourceName: string]: AgentMarketOfferState;
    };
    buy: {
        [resourceName: string]: AgentMarketBidState;
    };
};

export type MarketResult = {
    /** The resource this result refers to. */
    resourceName: string;
    /** Volume-weighted average price of all executed trades (currency/unit). */
    clearingPrice: number;
    /** Total units traded this tick. */
    totalVolume: number;
    /** Total household effective demand entering the order book (units). */
    totalDemand: number;
    /** Total supply offered by all agents this tick (units). */
    totalSupply: number;
    /** Demand that could not be filled (units). */
    unfilledDemand: number;
    /** Supply that was not sold (units). */
    unsoldSupply: number;
    /** Binned population demand (so we can display it in the UI) */
    populationBids?: {
        priceMin: number;
        priceMax: number;
        priceMid: number;
        quantity: number;
        filled: number;
        cost: number;
    }[];
};

// ---------------------------------------------------------------------------
// Backward-compatible alias so existing UI / server code compiles without
// changes.  Remove once all call-sites have been updated.
// ---------------------------------------------------------------------------
/** @deprecated Use `MarketResult` instead. */
export type FoodMarketResult = MarketResult;

// ---------------------------------------------------------------------------
// AgentPlanetAssets
// ---------------------------------------------------------------------------

export type AgentPlanetAssets = {
    productionFacilities: ProductionFacility[];
    managementFacilities: ManagementFacility[];
    workforceDemography: WorkforceCohort<WorkforceCategory>[];
    storageFacility: StorageFacility;

    deposits: number;

    depositHold: number;

    loans: number;

    market?: AgentMarketOffers;

    allocatedWorkers: PerEducation;

    deaths: DemographicEventCounters;
    /** Disabilities affecting this agent's workforce, per education level. */
    disabilities: DemographicEventCounters;

    monthAcc: {
        depositsAtMonthStart: number;
        productionValue: number;
        wages: number;
        revenue: number;
        purchases: number;
        claimPayments: number;
        totalWorkersTicks: number;
    };

    lastMonthAcc: {
        productionValue: number;
        wages: number;
        revenue: number;
        purchases: number;
        claimPayments: number;
        totalWorkersTicks: number;
    };
};

export type Agent = {
    id: string;
    automated: boolean; // whether this agent is controlled by the AI (true) or a human player (false)
    /** When false (human player), the worker still auto-allocates workforce targets each tick. */
    automateWorkerAllocation: boolean;
    name: string;
    foundedTick: number;
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

export function accumulateAgentMetrics(agents: Map<string, Agent>, planet: Planet, tick: number): void {
    for (const agent of agents.values()) {
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }
        if (tick % TICKS_PER_MONTH === 1) {
            assets.lastMonthAcc = {
                productionValue: assets.monthAcc.productionValue,
                wages: assets.monthAcc.wages,
                revenue: assets.monthAcc.revenue,
                purchases: assets.monthAcc.purchases,
                claimPayments: assets.monthAcc.claimPayments,
                totalWorkersTicks: assets.monthAcc.totalWorkersTicks,
            };
            assets.monthAcc = {
                depositsAtMonthStart: assets.deposits,
                productionValue: 0,
                wages: 0,
                revenue: 0,
                purchases: 0,
                claimPayments: 0,
                totalWorkersTicks: 0,
            };
        }
        for (const facility of assets.productionFacilities) {
            if (facility.lastTickResults?.lastProduced) {
                for (const [resourceName, qty] of Object.entries(facility.lastTickResults.lastProduced)) {
                    const price = planet.marketPrices[resourceName] ?? 0;
                    assets.monthAcc.productionValue += qty * price;
                }
            }
        }
    }
}

export function accumulatePlanetPrices(planet: Planet, tick: number): void {
    // Reset at the start of each new month so the accumulator always reflects
    // only the current month's trades — no separate flush step needed.
    if (tick % TICKS_PER_MONTH === 1) {
        planet.monthPriceAcc = {};
    }
    for (const result of Object.values(planet.lastMarketResult)) {
        if (!result || result.totalVolume <= 0) {
            continue;
        }
        const price = result.clearingPrice;
        if (!isFinite(price) || price <= 0) {
            continue;
        }
        const acc = planet.monthPriceAcc[result.resourceName];
        if (acc) {
            acc.min = Math.min(acc.min, price);
            acc.max = Math.max(acc.max, price);
            acc.sum += price;
            acc.count += 1;
        } else {
            planet.monthPriceAcc[result.resourceName] = { min: price, max: price, sum: price, count: 1 };
        }
    }
}
