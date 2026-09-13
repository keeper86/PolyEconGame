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
import {
    isFacilityOperating,
    type Facility,
    type HRFacility,
    type ProductionFacility,
    type ShipConstructionFacility,
    type Storage,
} from './facility';

export interface Bank {
    loans: number;
    deposits: number;
    householdDeposits: number;
    loanRatePerYear: number;
    depositRatePerYear: number;
    profit: number;
    interestCollected: number;
    writeOffs: number;
    bankruptcies: number;
    emergencyLoansGranted: number;
}

export type BankEquityView = Pick<Bank, 'loans' | 'deposits'>;

export const bankEquity = (bank: BankEquityView): number => bank.loans - bank.deposits;

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

    governmentSupportVolume: number;

    monthPriceAcc: {
        [resourceName: string]: { min: number; max: number; sum: number; count: number };
    };

    producedResources: {
        [resourceName in string]: number;
    };
    consumedResources: {
        [resourceName in string]: number;
    };

    constructionBalanceEMA: number;

    productionCosts: Record<string, number>;

    lastProductionCostFloors: Record<string, number>;

    landBoundCostPerUnit: Record<string, number>;

    // Pre-computed derived values — set by the worker after each tick, used as O(1) cache by controllers
    _populationTotal?: number;
    _costOfLiving?: number;
    _costOfLivingRich?: number;
    _freeResources?: { name: string; freeCapacity: number }[];
    _gdp?: number;
    _smoothedReachableVacancyWage?: PerEducation;

    _govSupportAnchoredPrices?: Record<string, number>;
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

export interface AutomatedPricingConfig {
    priceAdjustMaxUp?: number;
    priceAdjustMaxDown?: number;
    inventorySmoothingMaxExtra?: number;

    freeBuyQuantity?: number;
    freeRetainment?: number;
    freeBuyQuantitySmoothingMaxExtra?: number;
    freeRetainmentSmoothingMaxExtra?: number;
    sellProductionSmoothing?: number;

    targetSellThrough?: number;
    askVolumeFloorFraction?: number;
    automatedCostFloorBuffer?: number;
    costSpringStrength?: number;

    inputBufferTargetTicks?: number;
    targetFillRate?: number;
    bidVolumeFloorFraction?: number;
    bidOfferMaxCostMultiplier?: number;
}

export type SellDiagnostics = {
    sellThroughRate: number;
    smoothedSellThrough: number;
    targetSellThrough: number;
    baseFactor: number;
    costSpringDeviation: number;
    overDeviation: number;
    netFactor: number;
    oldPrice: number;
    newPrice: number;
    costFloor: number;
    marketPrice: number;
    effectiveQuantity: number;
    rawRetainment: number;
};

export type BuyDiagnostics = {
    fillRate: number;
    smoothedFillRate: number;
    targetFillRate: number;
    baseFactor: number;
    ceilingPrice: number;
    ceilingSpring: number;
    netFactor: number;
    oldBidPrice: number;
    newBidPrice: number;
    costFloor: number;
    marketPrice: number;
    shortfall: number;
    storageTarget: number;
};

export type AgentMarketOfferState = {
    resource: Resource;
    offerPrice?: number;
    offerRetainment?: number;
    lastSold?: number;
    lastRevenue?: number;
    lastPlacedQty?: number;
    lastOfferPrice?: number;
    priceDirection?: number;
    smoothedSellThrough?: number;
    automated?: boolean;
    autoConfig?: AutomatedPricingConfig;
    diagnostics?: SellDiagnostics;
};

export type AgentMarketBidState = {
    resource: Resource;
    bidPrice?: number;
    bidStorageTarget?: number;
    lastBought?: number;
    lastSpent?: number;
    lastEffectiveQty?: number;
    lastBidPrice?: number;
    smoothedFillRate?: number;

    storageFullWarning?: boolean;

    depositScaleWarning?: 'scaled' | 'dropped';

    storageScaleWarning?: 'scaled' | 'dropped';
    automated?: boolean;
    autoConfig?: AutomatedPricingConfig;
    diagnostics?: BuyDiagnostics;
};

type AgentMarketOffers = {
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

type PlanetLicense = {
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
    interestPaid: number;
    wealthTaxPaid: number;
    totalWorkersTicks: number;
    forexRevenue: number;
    forexPurchases: number;
    profitShareBonuses: number;
    producedResources: Record<string, ResourceAccumulator>;
    consumedResources: Record<string, ResourceAccumulator>;
    boughtResources: Record<string, ResourceAccumulator>;
    soldResources: Record<string, ResourceAccumulator>;
    depreciatedServices: Record<string, ResourceAccumulator>;
    naturalDepreciationValue: number;
};

export type AgentPlanetAssets = {
    productionFacilities: ProductionFacility[];
    shipConstructionFacilities: ShipConstructionFacility[];
    workforceDemography: WorkforceCohort<WorkforceCategory>[];

    storage: Storage;

    humanResourcesDepartment: HRFacility | null;
    hrProductivityMultiplier: number;

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

    usedWorkers: number;

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

    _smoothedWageCeiling?: number;

    licenses: {
        commercial?: PlanetLicense;
        workforce?: PlanetLicense;
    };
};

export const getAllFacilities = (assets: AgentPlanetAssets, onlyActive: boolean = false): Array<Facility> => {
    const manageStorage: Array<Facility> = [
        ...(assets.storage.department ? [assets.storage.department] : []),
        assets.storage.shells.solid,
        assets.storage.shells.liquid,
        assets.storage.shells.pieces,
    ];
    if (onlyActive) {
        return [
            ...assets.productionFacilities.filter(isFacilityOperating),
            ...manageStorage.filter(isFacilityOperating),
            ...(assets.humanResourcesDepartment && isFacilityOperating(assets.humanResourcesDepartment)
                ? [assets.humanResourcesDepartment]
                : []),
            ...assets.shipConstructionFacilities.filter(isFacilityOperating),
        ];
    }
    return [
        ...manageStorage,
        ...(assets.humanResourcesDepartment ? [assets.humanResourcesDepartment] : []),
        ...assets.shipConstructionFacilities,
        ...assets.productionFacilities,
    ];
};

export function hasActiveLicense(assets: AgentPlanetAssets, type: LicenseType): boolean {
    const license = assets.licenses?.[type];
    return license !== undefined && !license.frozen;
}

export type BankruptcyRecord = {
    agentId: string;
    agentName: string;
    planetId: string;
    tick: number;
    outcome: 'restructured' | 'liquidated';
    message: string;
};

export type Agent = {
    id: string;
    automated: boolean;
    automateWorkerAllocation: boolean;
    name: string;
    logo: string;
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
    bankruptcies: BankruptcyRecord[];
    nextEventId: number;
}

export function pushTickerEvent(gameState: GameState, event: Omit<TickerEvent, 'id'>): void {
    const tickerEvent: TickerEvent = { ...event, id: gameState.nextEventId++ };
    gameState.tickerEvents.push(tickerEvent);
}

const MAX_BANKRUPTCY_RECORDS = 2000;

export function pushBankruptcyRecord(gameState: GameState, record: BankruptcyRecord): void {
    gameState.bankruptcies.push(record);
    if (gameState.bankruptcies.length > MAX_BANKRUPTCY_RECORDS) {
        gameState.bankruptcies = gameState.bankruptcies.slice(-MAX_BANKRUPTCY_RECORDS);
    }
}

export function createEmptyAccumulator(): MonthAccumulator {
    return {
        productionValue: 0,
        consumptionValue: 0,
        wages: 0,
        revenue: 0,
        purchases: 0,
        claimPayments: 0,
        interestPaid: 0,
        wealthTaxPaid: 0,
        totalWorkersTicks: 0,
        forexRevenue: 0,
        forexPurchases: 0,
        profitShareBonuses: 0,
        producedResources: {},
        consumedResources: {},
        boughtResources: {},
        soldResources: {},
        depreciatedServices: {},
        naturalDepreciationValue: 0,
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
            interestPaid: assets.monthAcc.interestPaid,
            wealthTaxPaid: assets.monthAcc.wealthTaxPaid,
            totalWorkersTicks: assets.monthAcc.totalWorkersTicks,
            forexRevenue: assets.monthAcc.forexRevenue,
            forexPurchases: assets.monthAcc.forexPurchases,
            profitShareBonuses: assets.monthAcc.profitShareBonuses,
            producedResources: { ...assets.monthAcc.producedResources },
            consumedResources: { ...assets.monthAcc.consumedResources },
            boughtResources: { ...assets.monthAcc.boughtResources },
            soldResources: { ...assets.monthAcc.soldResources },
            depreciatedServices: { ...assets.monthAcc.depreciatedServices },
            naturalDepreciationValue: assets.monthAcc.naturalDepreciationValue,
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
