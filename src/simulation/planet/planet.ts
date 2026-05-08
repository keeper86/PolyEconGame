import type { TickerEvent } from 'src/server/controller/simulation';
import { TICKS_PER_MONTH } from '../constants';
import type { Loan } from '../financial/loanTypes';
import type { EducationLevelType, Population } from '../population/population';
import type {
    ConstructionContract,
    Ship,
    ShipBuyingOffer,
    ShipCapitalMarket,
    ShipListing,
    TransportContract,
} from '../ships/ships';
import type { WorkforceCategory, WorkforceCohort } from '../workforce/workforce';
import type { Resource, ResourceClaim, ResourceQuantity } from './claims';
import type { ManagementFacility, ProductionFacility, ShipConstructionFacility, StorageFacility } from './facility';

export interface Bank {
    loans: number;
    deposits: number;
    householdDeposits: number;
    equity: number;
    loanRate: number;
    depositRate: number;
}

export type PlanetaryId = {
    planetId: string;
    id: string;
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
    bank: Bank;

    wagePerEdu?: Partial<Record<EducationLevelType, number>>;
    /**
     * TODO: move this to own type in market.
     */
    marketPrices: Record<string, number>;

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
    resource: Resource;
    offerPrice?: number;
    offerRetainment?: number;
    lastSold?: number;
    lastRevenue?: number;
    lastPlacedQty?: number;
    lastOfferPrice?: number;
    priceDirection?: number;
    automated?: boolean;
};

export type AgentMarketBidState = {
    resource: Resource;
    bidPrice?: number;
    bidStorageTarget?: number;
    lastBought?: number;
    lastSpent?: number;
    lastEffectiveQty?: number;
    lastBidPrice?: number;

    storageFullWarning?: boolean;

    depositScaleWarning?: 'scaled' | 'dropped';

    storageScaleWarning?: 'scaled' | 'dropped';
    automated?: boolean;
};

export type AgentMarketOffers = {
    sell: {
        [resourceName: string]: AgentMarketOfferState;
    };
    buy: {
        [resourceName: string]: AgentMarketBidState;
    };
};

export type MarketResult = {
    resourceName: string;
    clearingPrice: number;
    totalVolume: number;
    totalDemand: number;
    totalSupply: number;
    unfilledDemand: number;
    unsoldSupply: number;
    populationBids?: {
        priceMin: number;
        priceMax: number;
        priceMid: number;
        quantity: number;
        filled: number;
        cost: number;
    }[];
};

export type LicenseType = 'commercial' | 'workforce';

export type PlanetLicense = {
    acquiredTick: number;
    frozen: boolean;
};

type ResourceAccumulator = {
    quantity: number;
    value: number;
};
export type MonthAccumulator = {
    productionValue: number;
    consumptionValue: number;
    wages: number;
    revenue: number;
    purchases: number;
    claimPayments: number;
    totalWorkersTicks: number;
    producedResources: Record<string, ResourceAccumulator>;
    consumedResources: Record<string, ResourceAccumulator>;
    boughtResources: Record<string, ResourceAccumulator>;
    soldResources: Record<string, ResourceAccumulator>;
    depreciatedServices: Record<string, ResourceAccumulator>;
};

export type AgentPlanetAssets = {
    productionFacilities: ProductionFacility[];
    managementFacilities: ManagementFacility[];
    shipConstructionFacilities: ShipConstructionFacility[];
    workforceDemography: WorkforceCohort<WorkforceCategory>[];
    storageFacility: StorageFacility;

    transportContracts: TransportContract[];
    constructionContracts: ConstructionContract[];
    shipBuyingOffers: ShipBuyingOffer[];
    shipListings: ShipListing[];

    deposits: number;

    depositHold: number;

    activeLoans: Loan[];

    market?: AgentMarketOffers;

    allocatedWorkers: PerEducation;

    deaths: DemographicEventCounters;
    disabilities: DemographicEventCounters;

    monthAcc: {
        depositsAtMonthStart: number;
    } & MonthAccumulator;

    lastMonthAcc: MonthAccumulator;

    licenses: {
        commercial?: PlanetLicense;
        workforce?: PlanetLicense;
    };
};

/**
 * Returns true if the agent has the given license on a planet and it is not frozen.
 */
export function hasActiveLicense(assets: AgentPlanetAssets, type: LicenseType): boolean {
    const license = assets.licenses?.[type];
    return license !== undefined && !license.frozen;
}

export type ArbitrageRoutePhase = 'buying' | 'loading' | 'in_transit' | 'unloading' | 'selling';

export type PendingArbitrageRoute = {
    shipId: string;
    originPlanetId: string;
    destPlanetId: string;
    resourceName: string;
    quantity: number;
    bidPricePerUnit: number;
    phase: ArbitrageRoutePhase;
};

export type Agent = {
    id: string;
    automated: boolean;
    automateWorkerAllocation: boolean;
    name: string;
    foundedTick: number;
    starterLoanTaken: boolean;
    associatedPlanetId: string;
    agentRole?: 'shipbuilder' | 'arbitrage_trader';
    pendingArbitrageRoutes?: Map<string, PendingArbitrageRoute>;
    ships: Ship[];
    assets: {
        [planetId in string]: AgentPlanetAssets;
    };
};

export interface GameState {
    tick: number;
    planets: Map<string, Planet>;
    agents: Map<string, Agent>;
    shipCapitalMarket: ShipCapitalMarket;
    forexMarketMakers: Map<string, Agent>;
    /** Role-indexed view of shipbuilder agents (also present in agents). */
    shipbuilderAgents: Map<string, Agent>;
    /** Role-indexed view of arbitrage trader agents (also present in agents). */
    arbitrageTraders: Map<string, Agent>;
    tickerEvents: TickerEvent[];
    nextEventId: number;
}

export function pushTickerEvent(gameState: GameState, event: Omit<TickerEvent, 'id'>): void {
    const tickerEvent: TickerEvent = { ...event, id: gameState.nextEventId++ };
    gameState.tickerEvents.push(tickerEvent);
}

export function createEmptyAccumulator(): MonthAccumulator {
    return {
        productionValue: 0,
        consumptionValue: 0,
        wages: 0,
        revenue: 0,
        purchases: 0,
        claimPayments: 0,
        totalWorkersTicks: 0,
        producedResources: {},
        consumedResources: {},
        boughtResources: {},
        soldResources: {},
        depreciatedServices: {},
    };
}

export function resetAgentMetrics(agents: Map<string, Agent>, planet: Planet): void {
    for (const agent of agents.values()) {
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }
        assets.lastMonthAcc = {
            productionValue: assets.monthAcc.productionValue,
            consumptionValue: assets.monthAcc.consumptionValue,
            wages: assets.monthAcc.wages,
            revenue: assets.monthAcc.revenue,
            purchases: assets.monthAcc.purchases,
            claimPayments: assets.monthAcc.claimPayments,
            totalWorkersTicks: assets.monthAcc.totalWorkersTicks,
            producedResources: { ...assets.monthAcc.producedResources },
            consumedResources: { ...assets.monthAcc.consumedResources },
            boughtResources: { ...assets.monthAcc.boughtResources },
            soldResources: { ...assets.monthAcc.soldResources },
            depreciatedServices: { ...assets.monthAcc.depreciatedServices },
        };
        assets.monthAcc = {
            depositsAtMonthStart: assets.deposits,
            ...createEmptyAccumulator(),
        };
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
