import type { TickerEvent } from 'src/server/controller/simulation';
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
import type { Resource, ResourceEntry, ResourceQuantity } from './claims';
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
        roads: number;
        railways: number;
        airports: number;
        seaports: number;
        spaceports: number;
    };
    energy: {
        production: number;
    };
};

export type Environment = {
    naturalDisasters: {
        earthquakes: number;
        floods: number;
        storms: number;
    };

    pollution: {
        air: number;
        water: number;
        soil: number;
    };

    regenerationRates: {
        air: {
            constant: number;
            percentage: number;
        };
        water: {
            constant: number;
            percentage: number;
        };
        soil: {
            constant: number;
            percentage: number;
        };
    };
};

export type AgentMarketPosition = {
    limits: {
        mass: number;
        volume: number;
        buy: number;
        sell: number;
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

export type ResourceOrderBook = {
    asks: Array<{ price: number; quantity: number }>;
    bids: Array<{ price: number; quantity: number }>;
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
        [resourceName in string]: ResourceEntry;
    };
    governmentId: string;
    infrastructure: Infrastructure;
    environment: Environment;
    bank: Bank;

    recycler: Agent;

    wagePerEdu: Record<EducationLevelType, number>;
    marketPrices: Record<string, number>;
    orderBooks: Record<string, ResourceOrderBook>;
    transportPipeline: {
        [resourceName in string]: ResourceQuantity;
    };

    lastMarketResult: {
        [resourceName: string]: MarketResult;
    };

    avgMarketResult: {
        [resourceName: string]: MarketResult;
    };

    monthTransferVolume: number;

    monthPriceAcc: {
        [resourceName: string]: { min: number; max: number; sum: number; count: number };
    };

    producedResources: {
        [resourceName in string]: number;
    };
    consumedResources: {
        [resourceName in string]: number;
    };

    productionCosts: Record<string, number>;

    lastProductionCostFloors: Record<string, number>;

    landBoundCostPerUnit: Record<string, number>;

    // Pre-computed derived values — set by the worker after each tick, used as O(1) cache by controllers
    _populationTotal?: number;
    _costOfLiving?: number;
    _costOfLivingRich?: number;
    _freeResources?: { name: string; freeCapacity: number }[];
    _gdp?: number;
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
    forexRevenue: number;
    forexPurchases: number;
    profitShareBonuses: number;
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

    market: AgentMarketOffers;

    wagePerEdu: Record<EducationLevelType, number>;

    allocatedWorkers: PerEducation;

    totalSlotCapacity: Record<EducationLevelType, number>;

    unusedWorkers: Record<EducationLevelType, number>;

    overqualifiedWorkers: {
        [jobEdu in EducationLevelType]?: {
            [workerEdu in EducationLevelType]?: number;
        };
    };

    deaths: DemographicEventCounters;
    disabilities: DemographicEventCounters;

    profitShareBonus: number;

    lastDepreciatedPerTick: Record<string, number>;

    monthAcc: {
        depositsAtMonthStart: number;
    } & MonthAccumulator;

    lastMonthAcc: MonthAccumulator;

    licenses: {
        commercial?: PlanetLicense;
        workforce?: PlanetLicense;
    };
};

export function hasActiveLicense(assets: AgentPlanetAssets, type: LicenseType): boolean {
    const license = assets.licenses?.[type];
    return license !== undefined && !license.frozen;
}

export type Agent = {
    id: string;
    automated: boolean;
    automateWorkerAllocation: boolean;
    name: string;
    foundedTick: number;
    starterLoanTaken: boolean;
    associatedPlanetId: string;
    agentRole?: 'shipbuilder' | 'arbitrage_trader';
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

    shipbuilderAgents: Map<string, Agent>;

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
        forexRevenue: 0,
        forexPurchases: 0,
        profitShareBonuses: 0,
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
            forexRevenue: assets.monthAcc.forexRevenue,
            forexPurchases: assets.monthAcc.forexPurchases,
            profitShareBonuses: assets.monthAcc.profitShareBonuses,
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

export function accumulatePlanetPrices(planet: Planet): void {
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
