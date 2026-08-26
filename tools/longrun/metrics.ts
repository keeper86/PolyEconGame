import {
    PRICE_CEIL,
    PRICE_FLOOR,
    RECYCLER_BASE_RECOVERY_EFFICIENCY,
    RECYCLER_PAYMENT_RATIO,
    TICKS_PER_MONTH,
    TICKS_PER_YEAR,
} from '../../src/simulation/constants';
import { totalOutstandingLoans } from '../../src/simulation/financial/loanTypes';
import { computeNormalizedBuffer } from '../../src/simulation/market/serviceBufferNormalizer';
import { computeCostOfLiving } from '../../src/simulation/market/serviceDefinitions';
import { computeFacilityConditionEfficiency, queryStorageFacility } from '../../src/simulation/planet/facility';
import { facilityMaintenanceConsumptionPerTick } from '../../src/simulation/planet/facilityMaintenance';
import { coalDepositResourceType, ironOreDepositResourceType, sandDepositResourceType } from '../../src/simulation/planet/landBoundResources';
import { operatingProfit, type GameState, type Planet } from '../../src/simulation/planet/planet';
import { TRADABLE_RESOURCES } from '../../src/simulation/planet/resourceCatalog';
import {
    chemicalResourceType,
    coalResourceType,
    copperResourceType,
    electronicsResourceType,
    fuelResourceType,
    ironOreResourceType,
    plasticResourceType,
    sandResourceType,
    siliconWaferResourceType,
    steelResourceType,
    waterResourceType,
} from '../../src/simulation/planet/resources';
import {
    administrativeServiceResourceType,
    constructionServiceResourceType,
    groceryServiceResourceType,
    logisticsServiceResourceType,
    maintenanceServiceResourceType,
    ALL_SERVICE_RESOURCE_TYPE_NAMES,
} from '../../src/simulation/planet/services';
import { educationLevelKeys } from '../../src/simulation/population/education';
import { OCCUPATIONS } from '../../src/simulation/population/population';
import { computeLaborMarket } from '../../src/simulation/workforce/laborMarket';
import { sumExactUsedByEdu, sumSlotFillByEdu, sumTotalUsedByEdu, totalActiveForEdu } from '../../src/simulation/workforce/workforceAggregates';
import { facilityNameToKey } from './solverDiagnostic';
import { computeCompanyNetWorth, computeWealthTax } from '../../src/simulation/agents/governmentAgent';
import { computeLoanConditions } from '../../src/simulation/financial/loanConditions';
import { calculateCostsForConstruction, getFacilityType } from '../../src/simulation/planet/facility';
import { ALL_PRODUCTION_FACILITY_ENTRIES } from '../../src/simulation/planet/productionFacilities';

export type MetricMap = Record<string, number>;

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function weightedQuantile(entries: Array<{ mean: number; count: number }>, q: number): number {
    const sorted = [...entries].sort((a, b) => a.mean - b.mean);
    const total = sorted.reduce((sum, e) => sum + e.count, 0);
    if (total <= 0) {
        return 0;
    }
    const target = q * total;
    let cumulative = 0;
    for (const e of sorted) {
        cumulative += e.count;
        if (cumulative >= target) {
            return e.mean;
        }
    }
    return sorted[sorted.length - 1]?.mean ?? 0;
}

const EXISTENTIAL_CHAIN_KEYS: ReadonlySet<string> = new Set([
    'waterFacility',
    'agriculturalFacility',
    'foodProcessor',
    'beveragePlant',
    'groceryChain',
    'hospital',
    'pharmaPlant',
]);

const FOOD_CHAIN_KEYS: ReadonlySet<string> = new Set([
    'agriculturalFacility',
    'foodProcessor',
    'beveragePlant',
    'groceryChain',
]);

function isExistentialFacility(name: string): boolean {
    const key = facilityNameToKey(name);
    return key !== undefined && EXISTENTIAL_CHAIN_KEYS.has(key);
}

function isFoodChainFacility(name: string): boolean {
    const key = facilityNameToKey(name);
    return key !== undefined && FOOD_CHAIN_KEYS.has(key);
}

function isMaintenanceFacility(name: string): boolean {
    return facilityNameToKey(name) === 'maintenanceFacility';
}

function isConstructionFacility(name: string): boolean {
    return facilityNameToKey(name) === 'constructionFacility';
}

const FACILITY_TYPE_KEYS = Object.keys(ALL_PRODUCTION_FACILITY_ENTRIES);

type FacilityStat = {
    count: number;
    scale: number;
    maxScale: number;
    profit: number;
    revenue: number;
    priceOverCost: number;
    signalActual: number;
    signalCandidate: number;
    contractionIntegral: number;
    lossCount: number;
    lossCaughtActual: number;
    lossCaughtBlend: number;
    falsePositiveActual: number;
    essentialLossCount: number;
    essentialLossCaughtBlend: number;
    recyclableCS: number;
    landInputCosts: number;
};

function emptyFacilityStat(): FacilityStat {
    return {
        count: 0,
        scale: 0,
        maxScale: 0,
        profit: 0,
        revenue: 0,
        priceOverCost: 0,
        signalActual: 0,
        signalCandidate: 0,
        contractionIntegral: 0,
        lossCount: 0,
        lossCaughtActual: 0,
        lossCaughtBlend: 0,
        falsePositiveActual: 0,
        essentialLossCount: 0,
        essentialLossCaughtBlend: 0,
        recyclableCS: 0,
        landInputCosts: 0,
    };
}

function minValue(map: Record<string, number> | undefined): number {
    if (!map) {
        return 1;
    }
    const values = Object.values(map);
    if (values.length === 0) {
        return 1;
    }
    return Math.min(...values);
}

function priceOf(planet: Planet, name: string): number {
    const result = planet.lastMarketResult[name];
    if (result && result.totalVolume > 0 && result.clearingPrice > 0) {
        return result.clearingPrice;
    }
    return planet.marketPrices[name] ?? 0;
}

function fillRateOf(planet: Planet, name: string): number {
    const result = planet.lastMarketResult[name];
    if (result && result.totalDemand > 0) {
        return result.totalVolume / result.totalDemand;
    }
    return 0;
}

function tierAveragePrice(planet: Planet, level: string): number {
    const prices: number[] = [];
    for (const resource of TRADABLE_RESOURCES) {
        if (resource.level !== level) {
            continue;
        }
        const price = priceOf(planet, resource.name);
        if (price > 0 && Number.isFinite(price)) {
            prices.push(price);
        }
    }
    if (prices.length === 0) {
        return 0;
    }
    return prices.reduce((a, b) => a + b, 0) / prices.length;
}

export function sampleMetrics(gameState: GameState): MetricMap {
    const planet = gameState.planets.values().next().value as Planet;

    let totalPopulation = 0;
    let employable = 0;
    let employed = 0;
    let unableToWork = 0;
    let inEducation = 0;
    const unoccByEdu = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    let groceryStarvationWeighted = 0;
    let healthcareStarvationWeighted = 0;
    let deathsLastMonth = 0;
    let deathsThisMonth = 0;
    let maxGroceryStarvation = 0;
    let starvationMild = 0;
    let starvationSevere = 0;
    let starvationFatal = 0;
    let wealthWeighted = 0;
    const wealthEntries: Array<{ mean: number; count: number }> = [];

    for (const cohort of planet.population.demography) {
        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                const cat = cohort[occ][edu];
                if (cat.total <= 0) {
                    continue;
                }
                totalPopulation += cat.total;
                const starvation = cat.services.grocery.starvationLevel;
                groceryStarvationWeighted += cat.total * starvation;
                healthcareStarvationWeighted += cat.total * cat.services.healthcare.starvationLevel;
                deathsLastMonth += cat.deaths.countLastMonth;
                deathsThisMonth += cat.deaths.countThisMonth;
                wealthWeighted += cat.total * cat.wealth.mean;
                wealthEntries.push({ mean: cat.wealth.mean, count: cat.total });
                if (starvation > maxGroceryStarvation) {
                    maxGroceryStarvation = starvation;
                }
                if (starvation > 0.8) {
                    starvationFatal += cat.total;
                } else if (starvation > 0.3) {
                    starvationSevere += cat.total;
                } else if (starvation > 0) {
                    starvationMild += cat.total;
                }
                if (occ === 'unoccupied') {
                    employable += cat.total;
                    unoccByEdu[edu] += cat.total;
                } else if (occ === 'employed') {
                    employed += cat.total;
                } else if (occ === 'unableToWork') {
                    unableToWork += cat.total;
                } else if (occ === 'education') {
                    inEducation += cat.total;
                }
            }
        }
    }

    let totalAgentDeposits = 0;
    let profitShareBonuses = 0;
    let agentsInDistress = 0;
    let totalLoans = 0;
    let companyCount = 0;
    const companyNetWorths: number[] = [];
    const companyProfits: number[] = [];
    let companiesDeepLoss = 0;
    let companiesProfitable = 0;
    let companiesContracting = 0;
    let companiesNearInsolvent = 0;
    let companyNetWorthNegativeCount = 0;
    const companyRunways: number[] = [];
    let wealthTaxCollected = 0;
    let wealthTaxPayers = 0;
    let lossMakingWealthTaxPayers = 0;
    let wealthTaxPaidByLossMaking = 0;
    let wealthTaxPaidByProfitable = 0;
    let companiesUnderwater = 0;
    let companiesUnderwaterEssential = 0;
    let companiesOverCreditLimit = 0;
    let overLimitLoanAmount = 0;
    let totalFacilitiesCollateral = 0;
    let totalMaxLoanAmount = 0;
    let companiesWithRolloverLoans = 0;
    let rolloverLoanPrincipal = 0;
    const debtEquitys: number[] = [];
    const debtRevenues: number[] = [];
    const facilityStats = new Map<string, FacilityStat>();
    let facilityLossCount = 0;
    let facilityLossCaughtActual = 0;
    let facilityLossCaughtBlend = 0;
    let facilityFalsePositiveActual = 0;
    let facilityEssentialLossCount = 0;
    let facilityEssentialLossCaughtBlend = 0;
    let facilityLossSum = 0;
    let facilityProfitSum = 0;
    let facilityLandInputCostSum = 0;
    let facilityWagesTickTotal = 0;
    let facilityInputsTickTotal = 0;
    let facilityRevenueTickTotal = 0;
    let expansionBlockedByProfit = 0;
    let recyclableCSInLosers = 0;
    let companyRevenueTotal = 0;
    let companyWagesTotal = 0;
    let companyPurchasesTotal = 0;
    let companyClaimsTotal = 0;
    let depreciatedValue = 0;
    let depreciatedServiceValue = 0;
    let depreciatedGoodsValue = 0;
    let depreciatedNaturalValue = 0;
    let maxStorageStarvation = 0;
    let highStarvationCompanies = 0;
    let storageDeptScaleTotal = 0;
    let storageDeptMaxScaleTotal = 0;
    let storageDeptCount = 0;
    let usedWorkers = 0;
    let totalSlots = 0;
    let productionEfficiencySum = 0;
    let productionFacilityCount = 0;
    let facilityConditionSum = 0;
    let facilityCount = 0;
    let wageSum = 0;
    let wageCount = 0;
    let loansWageCoverage = 0;
    let loansBufferCoverage = 0;
    let loansRollover = 0;
    let loansStarter = 0;
    let loansOther = 0;
    let workerEfficiencySum = 0;
    let resourceEfficiencySum = 0;
    let conditionEfficiencySum = 0;
    let conditionEfficiencyCount = 0;
    let maxMaintenanceSum = 0;
    let maxMaintenanceCount = 0;
    let facilitiesBelowFullMaintenance = 0;
    let hrBufferSum = 0;
    let hrScaleSum = 0;
    let hrMaxScaleSum = 0;
    let hrSignalSum = 0;
    let hrExpansionIntegralSum = 0;
    let hrCount = 0;
    let storageStarvationSum = 0;
    let storageStarvationCount = 0;
    let existentialAgentCount = 0;
    let nonExistentialAgentCount = 0;
    let existentialSlotCapacity = 0;
    let nonExistentialSlotCapacity = 0;
    let existentialUsedWorkers = 0;
    let nonExistentialUsedWorkers = 0;
    let existentialMaxScale = 0;
    let nonExistentialMaxScale = 0;
    let existentialOperatingScale = 0;
    let nonExistentialOperatingScale = 0;
    let existentialContractionIntegral = 0;
    let nonExistentialContractionIntegral = 0;
    let existentialNegativeProfitFacilities = 0;
    let nonExistentialNegativeProfitFacilities = 0;
    let existentialAtLowerBoundFacilities = 0;
    let nonExistentialAtLowerBoundFacilities = 0;
    let foodChainSlotCapacity = 0;
    let foodChainUsedWorkers = 0;
    let maintFacilityScale = 0;
    let maintFacilityMaxScale = 0;
    let maintFacilityConditionWeighted = 0;
    let maintFacilityOutput = 0;
    let maintAggregateConsumption = 0;
    let maintSteadyStateDemand = 0;
    let maintCatchupBacklog = 0;
    let maintAggregateBuffer = 0;
    let maintFacilityRevenue = 0;
    let maintFacilityInputCosts = 0;
    let maintFacilityWageCosts = 0;
    let maintFacilitySmoothedSignal = 0;
    let maintFacilityExpansionIntegral = 0;
    let maintFacilityContractionIntegral = 0;
    let maintFacilityOverallEfficiency = 0;
    let maintFacilityResourceEfficiency = 0;
    let maintFacilityWorkerEfficiency = 0;
    let maintFacilityConditionEfficiency = 0;
    let maintFacilityCount = 0;
    let maintInputEfficiencySteel = 0;
    let maintInputEfficiencyElectronics = 0;
    let maintInputEfficiencyPlastic = 0;
    let constructionFacilityScale = 0;
    let constructionFacilityMaxScale = 0;
    let constructionFacilityConditionWeighted = 0;
    let constructionFacilitySmoothedSignal = 0;
    let constructionFacilityCount = 0;
    let constructionFacilityWorkers = 0;
    let constructionFacilitySlots = 0;
    let restorationAggregateConsumption = 0;
    let siliconWaferResourceEfficiency = 0;
    let siliconWaferWorkerEfficiency = 0;
    let siliconWaferInputSand = 0;
    let siliconWaferInputChemical = 0;
    let siliconWaferInputWater = 0;
    let siliconWaferCount = 0;
    let sandMineScale = 0;
    let sandMineMaxScale = 0;
    let sandMineCondition = 0;
    let sandMineInputDepositEfficiency = 0;
    let sandMineWorkerEfficiency = 0;
    let sandMineOverallEfficiency = 0;
    let sandMineContractionIntegral = 0;
    let sandMineExpansionIntegral = 0;
    let sandMineSmoothedSignal = 0;
    let sandMineCount = 0;
    let coalMineScale = 0;
    let coalMineMaxScale = 0;
    let coalMineCondition = 0;
    let coalMineInputDepositEfficiency = 0;
    let coalMineWorkerEfficiency = 0;
    let coalMineOverallEfficiency = 0;
    let coalMineContractionIntegral = 0;
    let coalMineExpansionIntegral = 0;
    let coalMineSmoothedSignal = 0;
    let coalMineCount = 0;
    let ironMineScale = 0;
    let ironMineMaxScale = 0;
    let ironMineCondition = 0;
    let ironMineInputDepositEfficiency = 0;
    let ironMineInputCoalEfficiency = 0;
    let ironMineWorkerEfficiency = 0;
    let ironMineOverallEfficiency = 0;
    let ironMineContractionIntegral = 0;
    let ironMineExpansionIntegral = 0;
    let ironMineSmoothedSignal = 0;
    let ironMineCount = 0;
    let ironSmelterScale = 0;
    let ironSmelterMaxScale = 0;
    let ironSmelterCondition = 0;
    let ironSmelterInputIronOre = 0;
    let ironSmelterInputCoal = 0;
    let ironSmelterWorkerEfficiency = 0;
    let ironSmelterOverallEfficiency = 0;
    let ironSmelterContractionIntegral = 0;
    let ironSmelterExpansionIntegral = 0;
    let ironSmelterSmoothedSignal = 0;
    let ironSmelterCount = 0;
    let ironSmelterOutput = 0;
    let ironSmelterRevenue = 0;
    let ironSmelterInputCosts = 0;
    let ironSmelterWageCosts = 0;
    let maintSteelBuffer = 0;
    let maintElectronicsBuffer = 0;
    let maintPlasticBuffer = 0;
    let oilRefineryCount = 0;
    let oilRefineryScale = 0;
    let oilRefineryRevenue = 0;

    const allocByEdu = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const activeByEdu = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const wageByEdu = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const wageByEduCount = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const capacityByEdu = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const slotsFilledByEdu = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const slotFillByEdu = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const overqualByEdu = { none: 0, primary: 0, secondary: 0, tertiary: 0 };

    for (const agent of gameState.agents.values()) {
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }
        totalAgentDeposits += assets.deposits;
        profitShareBonuses += assets.monthAcc.profitShareBonuses;
        companyRevenueTotal += assets.lastMonthAcc?.revenue ?? 0;
        companyWagesTotal += assets.lastMonthAcc?.wages ?? 0;
        companyPurchasesTotal += assets.lastMonthAcc?.purchases ?? 0;
        companyClaimsTotal += assets.lastMonthAcc?.claimPayments ?? 0;
        for (const [name, entry] of Object.entries(assets.monthAcc.depreciatedServices ?? {})) {
            depreciatedValue += entry.value;
            if (ALL_SERVICE_RESOURCE_TYPE_NAMES.includes(name)) {
                depreciatedServiceValue += entry.value;
            } else {
                depreciatedGoodsValue += entry.value;
            }
        }
        depreciatedNaturalValue += assets.monthAcc.naturalDepreciationValue ?? 0;
        const ss = assets.storageFacility.department?.storageStarvation ?? 0;
        if (ss > maxStorageStarvation) {
            maxStorageStarvation = ss;
        }
        if (ss > 0.5) {
            highStarvationCompanies += 1;
        }
        if (assets.storageFacility.department) {
            storageDeptScaleTotal += assets.storageFacility.department.scale;
            storageDeptMaxScaleTotal += assets.storageFacility.department.maxScale;
            storageDeptCount += 1;
        }
        maintAggregateBuffer += queryStorageFacility(assets.storageFacility, maintenanceServiceResourceType.name);
        if (assets.deposits < 0) {
            agentsInDistress += 1;
        }
        totalLoans += totalOutstandingLoans(assets.activeLoans);
        for (const loan of assets.activeLoans) {
            const rp = loan.remainingPrincipal;
            if (loan.type === 'wageCoverage') {
                loansWageCoverage += rp;
            } else if (loan.type === 'bufferCoverage') {
                loansBufferCoverage += rp;
            } else if (loan.type === 'rollover') {
                loansRollover += rp;
            } else if (loan.type === 'starter') {
                loansStarter += rp;
            } else {
                loansOther += rp;
            }
        }
        if (agent.id !== planet.governmentId && agent.id !== planet.recycler.id && agent.agentRole === undefined) {
            companyCount += 1;
            const netWorth = computeCompanyNetWorth(agent, planet, gameState.shipCapitalMarket);
            companyNetWorths.push(netWorth);
            if (netWorth < 0) {
                companyNetWorthNegativeCount += 1;
            }
            const profit = operatingProfit(assets.monthAcc);
            companyProfits.push(profit);
            if (profit < 0) {
                companiesDeepLoss += 1;
                const burn = -profit;
                if (burn > 0) {
                    companyRunways.push(assets.deposits / burn);
                }
            } else {
                companiesProfitable += 1;
            }
            if (assets.deposits < assets.monthAcc.wages) {
                companiesNearInsolvent += 1;
            }
            let contracting = false;
            for (const facility of assets.productionFacilities) {
                const pid = facility.pidState;
                if (pid && (pid.smoothedSignal ?? 0) < -0.005) {
                    contracting = true;
                }
            }
            if (contracting) {
                companiesContracting += 1;
            }
            const tax = computeWealthTax(agent, planet, gameState.shipCapitalMarket);
            if (tax > 0) {
                const paid = Math.min(tax, Math.max(0, assets.deposits));
                wealthTaxCollected += paid;
                wealthTaxPayers += 1;
                if (profit <= 0) {
                    lossMakingWealthTaxPayers += 1;
                    wealthTaxPaidByLossMaking += paid;
                } else {
                    wealthTaxPaidByProfitable += paid;
                }
            }
            const conditions = computeLoanConditions(agent, planet, gameState.shipCapitalMarket);
            if (conditions.existingLoans > conditions.facilitiesCollateral + conditions.shipsCollateral) {
                companiesUnderwater += 1;
                const agentEssential = assets.productionFacilities.some(
                    (f) => isMaintenanceFacility(f.name) || isExistentialFacility(f.name),
                );
                if (agentEssential) {
                    companiesUnderwaterEssential += 1;
                }
            }
            if (conditions.existingLoans > conditions.maxLoanAmount) {
                companiesOverCreditLimit += 1;
                overLimitLoanAmount += conditions.existingLoans - conditions.maxLoanAmount;
            }
            totalFacilitiesCollateral += conditions.facilitiesCollateral;
            totalMaxLoanAmount += conditions.maxLoanAmount;
            if (conditions.existingLoans > 0 && netWorth > 0) {
                debtEquitys.push(conditions.existingLoans / netWorth);
                if (conditions.lastMonthlyRevenue > 0) {
                    debtRevenues.push(conditions.existingLoans / conditions.lastMonthlyRevenue);
                }
            }
            const agentRollovers = assets.activeLoans.filter((loan) => loan.type === 'rollover');
            if (agentRollovers.length > 0) {
                companiesWithRolloverLoans += 1;
                rolloverLoanPrincipal += agentRollovers.reduce((sum, loan) => sum + loan.remainingPrincipal, 0);
            }
        }
        usedWorkers += assets.usedWorkers;
        let agentSlots = 0;
        for (const edu of educationLevelKeys) {
            const slots = assets.totalSlotCapacity[edu] ?? 0;
            totalSlots += slots;
            agentSlots += slots;
        }
        const agentHasService = assets.productionFacilities.some((f) => isConstructionFacility(f.name));
        if (agentHasService) {
            constructionFacilityWorkers += assets.usedWorkers;
            constructionFacilitySlots += agentSlots;
        }
        const agentExistential = assets.productionFacilities.some((f) => isExistentialFacility(f.name));
        const agentFoodChain = assets.productionFacilities.some((f) => isFoodChainFacility(f.name));
        if (agentExistential) {
            existentialAgentCount += 1;
            existentialSlotCapacity += agentSlots;
            existentialUsedWorkers += assets.usedWorkers;
        } else {
            nonExistentialAgentCount += 1;
            nonExistentialSlotCapacity += agentSlots;
            nonExistentialUsedWorkers += assets.usedWorkers;
        }
        if (agentFoodChain) {
            foodChainSlotCapacity += agentSlots;
            foodChainUsedWorkers += assets.usedWorkers;
        }
        for (const facility of assets.productionFacilities) {
            productionFacilityCount += 1;
            productionEfficiencySum += facility.lastTickResults?.overallEfficiency ?? 0;
            facilityConditionSum += facility.maintenanceStatus ?? 1;
            facilityCount += 1;
            const results = facility.lastTickResults;
            workerEfficiencySum += minValue(results?.workerEfficiency);
            resourceEfficiencySum += minValue(results?.resourceEfficiency);
            conditionEfficiencySum += computeFacilityConditionEfficiency(facility.maintenanceStatus ?? 1);
            conditionEfficiencyCount += 1;
            maxMaintenanceSum += facility.maxMaintenance ?? 1;
            maxMaintenanceCount += 1;
            if ((facility.maxMaintenance ?? 1) < 0.99) {
                facilitiesBelowFullMaintenance += 1;
            }

            maintAggregateConsumption += facility.lastTickMaintenanceConsumption ?? 0;
            maintSteadyStateDemand += facilityMaintenanceConsumptionPerTick(facility);
            maintCatchupBacklog += Math.max(0, (facility.maxMaintenance ?? 1) - (facility.maintenanceStatus ?? 1)) * facility.scale * 100;
            restorationAggregateConsumption += facility.lastTickRestorationConsumption ?? 0;
            if (facility.name === 'Silicon Wafer Factory') {
                siliconWaferResourceEfficiency += minValue(facility.lastTickResults?.resourceEfficiency);
                siliconWaferWorkerEfficiency += minValue(facility.lastTickResults?.workerEfficiency);
                const swEff = facility.lastTickResults?.resourceEfficiency ?? {};
                siliconWaferInputSand += swEff[sandResourceType.name] ?? 1;
                siliconWaferInputChemical += swEff[chemicalResourceType.name] ?? 1;
                siliconWaferInputWater += swEff[waterResourceType.name] ?? 1;
                siliconWaferCount += 1;
            }

            if (facility.name === 'Sand Mine') {
                sandMineScale += facility.scale;
                sandMineMaxScale += facility.maxScale;
                sandMineCondition += facility.maintenanceStatus ?? 1;
                const smEff = facility.lastTickResults?.resourceEfficiency ?? {};
                sandMineInputDepositEfficiency += smEff[sandDepositResourceType.name] ?? 1;
                sandMineWorkerEfficiency += minValue(facility.lastTickResults?.workerEfficiency);
                sandMineOverallEfficiency += facility.lastTickResults?.overallEfficiency ?? 0;
                const pid = facility.pidState;
                sandMineContractionIntegral += pid?.contractionIntegral ?? 0;
                sandMineExpansionIntegral += pid?.expansionIntegral ?? 0;
                sandMineSmoothedSignal += pid?.smoothedSignal ?? 0;
                sandMineCount += 1;
            }

            if (facility.name === 'Coal Mine') {
                coalMineScale += facility.scale;
                coalMineMaxScale += facility.maxScale;
                coalMineCondition += facility.maintenanceStatus ?? 1;
                const cmEff = facility.lastTickResults?.resourceEfficiency ?? {};
                coalMineInputDepositEfficiency += cmEff[coalDepositResourceType.name] ?? 1;
                coalMineWorkerEfficiency += minValue(facility.lastTickResults?.workerEfficiency);
                coalMineOverallEfficiency += facility.lastTickResults?.overallEfficiency ?? 0;
                const pid = facility.pidState;
                coalMineContractionIntegral += pid?.contractionIntegral ?? 0;
                coalMineExpansionIntegral += pid?.expansionIntegral ?? 0;
                coalMineSmoothedSignal += pid?.smoothedSignal ?? 0;
                coalMineCount += 1;
            }

            if (facility.name === 'Iron Mine') {
                ironMineScale += facility.scale;
                ironMineMaxScale += facility.maxScale;
                ironMineCondition += facility.maintenanceStatus ?? 1;
                const imEff = facility.lastTickResults?.resourceEfficiency ?? {};
                ironMineInputDepositEfficiency += imEff[ironOreDepositResourceType.name] ?? 1;
                ironMineInputCoalEfficiency += imEff[coalResourceType.name] ?? 1;
                ironMineWorkerEfficiency += minValue(facility.lastTickResults?.workerEfficiency);
                ironMineOverallEfficiency += facility.lastTickResults?.overallEfficiency ?? 0;
                const pid = facility.pidState;
                ironMineContractionIntegral += pid?.contractionIntegral ?? 0;
                ironMineExpansionIntegral += pid?.expansionIntegral ?? 0;
                ironMineSmoothedSignal += pid?.smoothedSignal ?? 0;
                ironMineCount += 1;
            }

            if (facility.name === 'Iron Smelter') {
                ironSmelterScale += facility.scale;
                ironSmelterMaxScale += facility.maxScale;
                ironSmelterCondition += facility.maintenanceStatus ?? 1;
                const isEff = facility.lastTickResults?.resourceEfficiency ?? {};
                ironSmelterInputIronOre += isEff[ironOreResourceType.name] ?? 1;
                ironSmelterInputCoal += isEff[coalResourceType.name] ?? 1;
                ironSmelterWorkerEfficiency += minValue(facility.lastTickResults?.workerEfficiency);
                ironSmelterOverallEfficiency += facility.lastTickResults?.overallEfficiency ?? 0;
                ironSmelterOutput += facility.lastTickResults?.lastProduced?.[steelResourceType.name] ?? 0;
                ironSmelterRevenue += facility.lastTickResults?.revenue ?? 0;
                ironSmelterInputCosts += facility.lastTickResults?.inputCosts ?? 0;
                ironSmelterWageCosts += facility.lastTickResults?.wageCosts ?? 0;
                const pid = facility.pidState;
                ironSmelterContractionIntegral += pid?.contractionIntegral ?? 0;
                ironSmelterExpansionIntegral += pid?.expansionIntegral ?? 0;
                ironSmelterSmoothedSignal += pid?.smoothedSignal ?? 0;
                ironSmelterCount += 1;
            }

            if (facility.name === 'Oil Refinery') {
                oilRefineryScale += facility.scale;
                oilRefineryRevenue += facility.lastTickResults?.revenue ?? 0;
                oilRefineryCount += 1;
            }

            if (isMaintenanceFacility(facility.name)) {
                maintFacilityScale += facility.scale;
                maintFacilityMaxScale += facility.maxScale;
                maintFacilityConditionWeighted += (facility.maintenanceStatus ?? 1) * facility.scale;
                maintFacilityOutput += facility.lastTickResults?.lastProduced?.[maintenanceServiceResourceType.name] ?? 0;
                maintFacilityRevenue += facility.lastTickResults?.revenue ?? 0;
                maintFacilityInputCosts += facility.lastTickResults?.inputCosts ?? 0;
                maintFacilityWageCosts += facility.lastTickResults?.wageCosts ?? 0;
                const maintPid = facility.pidState;
                maintFacilitySmoothedSignal += maintPid?.smoothedSignal ?? 0;
                maintFacilityExpansionIntegral += maintPid?.expansionIntegral ?? 0;
                maintFacilityContractionIntegral += maintPid?.contractionIntegral ?? 0;
                maintFacilityOverallEfficiency += facility.lastTickResults?.overallEfficiency ?? 0;
                maintFacilityResourceEfficiency += minValue(facility.lastTickResults?.resourceEfficiency);
                maintFacilityWorkerEfficiency += minValue(facility.lastTickResults?.workerEfficiency);
                maintFacilityConditionEfficiency += computeFacilityConditionEfficiency(facility.maintenanceStatus ?? 1);
                maintFacilityCount += 1;
                const resEff = facility.lastTickResults?.resourceEfficiency ?? {};
                maintInputEfficiencySteel += resEff[steelResourceType.name] ?? 1;
                maintInputEfficiencyElectronics += resEff[electronicsResourceType.name] ?? 1;
                maintInputEfficiencyPlastic += resEff[plasticResourceType.name] ?? 1;
                maintSteelBuffer += queryStorageFacility(assets.storageFacility, steelResourceType.name);
                maintElectronicsBuffer += queryStorageFacility(assets.storageFacility, electronicsResourceType.name);
                maintPlasticBuffer += queryStorageFacility(assets.storageFacility, plasticResourceType.name);
            }

            if (isConstructionFacility(facility.name)) {
                constructionFacilityScale += facility.scale;
                constructionFacilityMaxScale += facility.maxScale;
                constructionFacilityConditionWeighted += (facility.maintenanceStatus ?? 1) * facility.scale;
                constructionFacilitySmoothedSignal += facility.pidState?.smoothedSignal ?? 0;
                constructionFacilityCount += 1;
            }

            const pid = facility.pidState;
            const facilityResults = facility.lastTickResults;
            const facilityRevenue = facilityResults?.revenue ?? 0;
            const facilityWageCosts = facilityResults?.wageCosts ?? 0;
            const facilityInputCosts = facilityResults?.inputCosts ?? 0;
            let nonLandInputCosts = 0;
            const lastConsumed = facilityResults?.lastConsumed ?? {};
            for (const need of facility.needs) {
                if (need.resource.form === 'landBoundResource') {
                    continue;
                }
                const qty = lastConsumed[need.resource.name] ?? 0;
                nonLandInputCosts += qty * (planet.marketPrices[need.resource.name] ?? 0);
            }
            const landInputCosts = Math.max(0, facilityInputCosts - nonLandInputCosts);
            const facilityProfit = facilityRevenue - facilityWageCosts - facilityInputCosts;
            const facilityLoss = facilityProfit < 0;
            const contractionIntegral = pid?.contractionIntegral ?? 0;
            const atLowerBound = facility.scale <= facility.maxScale * 0.1 + 1e-9;
            if (isExistentialFacility(facility.name)) {
                existentialMaxScale += facility.maxScale;
                existentialOperatingScale += facility.scale;
                existentialContractionIntegral += contractionIntegral;
                if (facilityLoss) {
                    existentialNegativeProfitFacilities += 1;
                }
                if (atLowerBound) {
                    existentialAtLowerBoundFacilities += 1;
                }
            } else {
                nonExistentialMaxScale += facility.maxScale;
                nonExistentialOperatingScale += facility.scale;
                nonExistentialContractionIntegral += contractionIntegral;
                if (facilityLoss) {
                    nonExistentialNegativeProfitFacilities += 1;
                }
                if (atLowerBound) {
                    nonExistentialAtLowerBoundFacilities += 1;
                }
            }
            {
                const key = facilityNameToKey(facility.name);
                if (key) {
                    const signalActual = pid?.smoothedSignal ?? 0;
                    const profitSignal =
                        facilityRevenue > 0 && facilityLoss ? Math.max(-1, facilityProfit / facilityRevenue) : 0;
                    const signalCandidate = Math.min(signalActual, profitSignal);
                    const primaryOutput = facility.produces[0];
                    const costFloor = primaryOutput
                        ? (planet.lastProductionCostFloors[primaryOutput.resource.name] ?? 0)
                        : 0;
                    const outputPrice = primaryOutput ? priceOf(planet, primaryOutput.resource.name) : 0;
                    const priceOverCost = costFloor > 0 ? outputPrice / costFloor : 0;
                    const essential = isMaintenanceFacility(facility.name) || isExistentialFacility(facility.name);

                    let stat = facilityStats.get(key);
                    if (!stat) {
                        stat = emptyFacilityStat();
                        facilityStats.set(key, stat);
                    }
                    stat.count += 1;
                    stat.scale += facility.scale;
                    stat.maxScale += facility.maxScale;
                    stat.profit += facilityProfit;
                    stat.revenue += facilityRevenue;
                    stat.priceOverCost += priceOverCost;
                    stat.signalActual += signalActual;
                    stat.signalCandidate += signalCandidate;
                    stat.contractionIntegral += contractionIntegral;
                    stat.landInputCosts += landInputCosts;
                    facilityProfitSum += facilityProfit;
                    facilityLandInputCostSum += landInputCosts;
                    facilityWagesTickTotal += facilityWageCosts;
                    facilityInputsTickTotal += facilityInputCosts;
                    facilityRevenueTickTotal += facilityRevenue;
                    if (
                        facility.scale >= facility.maxScale - 1e-9 &&
                        signalActual > 0 &&
                        facilityLoss &&
                        facilityRevenue > 0
                    ) {
                        expansionBlockedByProfit += 1;
                    }
                    if (facilityLoss) {
                        facilityLossCount += 1;
                        facilityLossSum += facilityProfit;
                        stat.lossCount += 1;
                        if (signalActual < 0) {
                            facilityLossCaughtActual += 1;
                            stat.lossCaughtActual += 1;
                        }
                        if (signalCandidate < 0) {
                            facilityLossCaughtBlend += 1;
                            stat.lossCaughtBlend += 1;
                        }
                        if (essential) {
                            stat.essentialLossCount += 1;
                            facilityEssentialLossCount += 1;
                            if (signalCandidate < 0) {
                                stat.essentialLossCaughtBlend += 1;
                                facilityEssentialLossCaughtBlend += 1;
                            }
                        }
                        const recyclable = calculateCostsForConstruction(
                            getFacilityType(facility),
                            0,
                            facility.maxScale,
                        ).cost;
                        stat.recyclableCS += recyclable;
                        recyclableCSInLosers += recyclable;
                    } else if (signalActual < 0) {
                        facilityFalsePositiveActual += 1;
                        stat.falsePositiveActual += 1;
                    }
                }
            }
        }
        if (assets.humanResourcesDepartment) {
            facilityConditionSum += assets.humanResourcesDepartment.maintenanceStatus ?? 1;
            facilityCount += 1;
            conditionEfficiencySum += computeFacilityConditionEfficiency(
                assets.humanResourcesDepartment.maintenanceStatus ?? 1,
            );
            conditionEfficiencyCount += 1;
            maxMaintenanceSum += assets.humanResourcesDepartment.maxMaintenance ?? 1;
            maxMaintenanceCount += 1;
            if ((assets.humanResourcesDepartment.maxMaintenance ?? 1) < 0.99) {
                facilitiesBelowFullMaintenance += 1;
            }
            hrBufferSum += assets.humanResourcesDepartment.hrBuffer ?? 0;
            hrScaleSum += assets.humanResourcesDepartment.scale;
            hrMaxScaleSum += assets.humanResourcesDepartment.maxScale;
            hrSignalSum += assets.humanResourcesDepartment.pidState?.smoothedSignal ?? 0;
            hrExpansionIntegralSum += assets.humanResourcesDepartment.pidState?.expansionIntegral ?? 0;
            hrCount += 1;
        }
        const storageDept = assets.storageFacility?.department;
        if (storageDept) {
            storageStarvationSum += storageDept.storageStarvation ?? 0;
            storageStarvationCount += 1;
            maxMaintenanceSum += storageDept.maxMaintenance ?? 1;
            maxMaintenanceCount += 1;
            if ((storageDept.maxMaintenance ?? 1) < 0.99) {
                facilitiesBelowFullMaintenance += 1;
            }
        }
        if (typeof assets.wagePerEdu?.none === 'number') {
            wageSum += assets.wagePerEdu.none;
            wageCount += 1;
        }
        const wf = assets.workforceDemography;
        const slotsFilled = sumTotalUsedByEdu(assets);
        const slotFill = sumSlotFillByEdu(assets);
        const exactUsed = sumExactUsedByEdu(assets);
        for (const edu of educationLevelKeys) {
            allocByEdu[edu] += assets.allocatedWorkers?.[edu] ?? 0;
            if (typeof assets.wagePerEdu?.[edu] === 'number') {
                wageByEdu[edu] += assets.wagePerEdu[edu];
                wageByEduCount[edu] += 1;
            }
            capacityByEdu[edu] += assets.totalSlotCapacity?.[edu] ?? 0;
            slotsFilledByEdu[edu] += slotsFilled[edu];
            slotFillByEdu[edu] += slotFill[edu];
            overqualByEdu[edu] += Math.max(0, slotFill[edu] - exactUsed[edu]);
            if (wf) {
                activeByEdu[edu] += totalActiveForEdu(wf, edu);
            }
        }
    }

    const laborMarket = computeLaborMarket(gameState.agents, planet);

    let priceCeilHits = 0;
    let priceFloorHits = 0;
    for (const price of Object.values(planet.marketPrices)) {
        if (!Number.isFinite(price) || price <= 0) {
            continue;
        }
        if (price >= PRICE_CEIL * 0.99) {
            priceCeilHits += 1;
        } else if (price <= PRICE_FLOOR * 1.01) {
            priceFloorHits += 1;
        }
    }

    const groceryResult = planet.lastMarketResult[groceryServiceResourceType.name];
    const groceryFillRate =
        groceryResult && groceryResult.totalDemand > 0
            ? Math.max(0, 1 - groceryResult.unfilledDemand / groceryResult.totalDemand)
            : 0;
    const groceryBuffer = computeNormalizedBuffer(planet, 'grocery');

    const gdpAnnual =
        Object.values(planet.avgMarketResult).reduce((sum, r) => sum + r.clearingPrice * r.totalVolume, 0) * TICKS_PER_YEAR;

    const constructionResult = planet.lastMarketResult[constructionServiceResourceType.name];
    const housingBuffer = computeNormalizedBuffer(planet, 'construction');
    const constructionFillRate =
        constructionResult && constructionResult.totalDemand > 0
            ? constructionResult.totalVolume / constructionResult.totalDemand
            : 0;
    const constructionEmploymentShare = usedWorkers > 0 ? constructionFacilityWorkers / usedWorkers : 0;

    const maintenanceResult = planet.lastMarketResult[maintenanceServiceResourceType.name];
    const adminResult = planet.lastMarketResult[administrativeServiceResourceType.name];
    const logisticsResult = planet.lastMarketResult[logisticsServiceResourceType.name];

    const maintTotalSupply = maintenanceResult?.totalSupply ?? 0;
    const maintUnfilledDemand = maintenanceResult?.unfilledDemand ?? 0;
    const maintUnsoldSupply = maintenanceResult?.unsoldSupply ?? 0;
    const maintUnfilledFrac =
        (maintenanceResult?.totalDemand ?? 0) > 0
            ? maintUnfilledDemand / maintenanceResult!.totalDemand
            : 0;
    const maintUnsoldFrac = maintTotalSupply > 0 ? maintUnsoldSupply / maintTotalSupply : 0;

    const constructionTotalSupply = constructionResult?.totalSupply ?? 0;
    const constructionUnfilledDemand = constructionResult?.unfilledDemand ?? 0;
    const constructionUnfilledFrac =
        (constructionResult?.totalDemand ?? 0) > 0
            ? constructionUnfilledDemand / constructionResult!.totalDemand
            : 0;
    const constructionUnsoldFrac =
        constructionTotalSupply > 0 ? (constructionResult?.unsoldSupply ?? 0) / constructionTotalSupply : 0;
    const constructionFacilityCondition =
        constructionFacilityScale > 0 ? constructionFacilityConditionWeighted / constructionFacilityScale : 1;
    const constructionFacilitySignal =
        constructionFacilityCount > 0 ? constructionFacilitySmoothedSignal / constructionFacilityCount : 0;
    const constructionFacilityScaleAvg =
        constructionFacilityCount > 0 ? constructionFacilityScale / constructionFacilityCount : 0;
    const constructionFacilityMaxScaleAvg =
        constructionFacilityCount > 0 ? constructionFacilityMaxScale / constructionFacilityCount : 0;

    const maintFacilityCondition = maintFacilityScale > 0 ? maintFacilityConditionWeighted / maintFacilityScale : 1;
    const maintFillRate =
        maintenanceResult && maintenanceResult.totalDemand > 0
            ? maintenanceResult.totalVolume / maintenanceResult.totalDemand
            : 0;
    const maintRepairSurgeRatio = maintSteadyStateDemand > 0 ? maintAggregateConsumption / maintSteadyStateDemand : 0;
    const maintFacilityCostFloor = planet.lastProductionCostFloors[maintenanceServiceResourceType.name] ?? 0;
    const maintFacilityProfit = maintFacilityRevenue - maintFacilityInputCosts - maintFacilityWageCosts;
    const maintFacilitySmoothedSignalAvg =
        maintFacilityCount > 0 ? maintFacilitySmoothedSignal / maintFacilityCount : 0;
    const maintFacilityExpansionIntegralAvg =
        maintFacilityCount > 0 ? maintFacilityExpansionIntegral / maintFacilityCount : 0;
    const maintFacilityContractionIntegralAvg =
        maintFacilityCount > 0 ? maintFacilityContractionIntegral / maintFacilityCount : 0;
    const maintFacilityOverallEfficiencyAvg =
        maintFacilityCount > 0 ? maintFacilityOverallEfficiency / maintFacilityCount : 0;
    const maintFacilityResourceEfficiencyAvg =
        maintFacilityCount > 0 ? maintFacilityResourceEfficiency / maintFacilityCount : 0;
    const maintFacilityWorkerEfficiencyAvg =
        maintFacilityCount > 0 ? maintFacilityWorkerEfficiency / maintFacilityCount : 0;
    const maintFacilityConditionEfficiencyAvg =
        maintFacilityCount > 0 ? maintFacilityConditionEfficiency / maintFacilityCount : 0;
    const maintInputEfficiencySteelAvg =
        maintFacilityCount > 0 ? maintInputEfficiencySteel / maintFacilityCount : 0;
    const maintInputEfficiencyElectronicsAvg =
        maintFacilityCount > 0 ? maintInputEfficiencyElectronics / maintFacilityCount : 0;
    const maintInputEfficiencyPlasticAvg =
        maintFacilityCount > 0 ? maintInputEfficiencyPlastic / maintFacilityCount : 0;
    const maintSteelBufferAvg = maintFacilityCount > 0 ? maintSteelBuffer / maintFacilityCount : 0;
    const maintElectronicsBufferAvg = maintFacilityCount > 0 ? maintElectronicsBuffer / maintFacilityCount : 0;
    const maintPlasticBufferAvg = maintFacilityCount > 0 ? maintPlasticBuffer / maintFacilityCount : 0;
    const ironSmelterOutputAvg = ironSmelterCount > 0 ? ironSmelterOutput / ironSmelterCount : 0;
    const ironSmelterRevenueAvg = ironSmelterCount > 0 ? ironSmelterRevenue / ironSmelterCount : 0;
    const ironSmelterInputCostsAvg = ironSmelterCount > 0 ? ironSmelterInputCosts / ironSmelterCount : 0;
    const ironSmelterWageCostsAvg = ironSmelterCount > 0 ? ironSmelterWageCosts / ironSmelterCount : 0;
    const ironSmelterProfitAvg = ironSmelterRevenueAvg - ironSmelterInputCostsAvg - ironSmelterWageCostsAvg;
    const ironSmelterCostFloor = planet.lastProductionCostFloors[steelResourceType.name] ?? 0;
    const steelPrice = priceOf(planet, steelResourceType.name);
    const steelResult = planet.lastMarketResult[steelResourceType.name];
    const steelTotalDemand = steelResult?.totalDemand ?? 0;
    const steelTotalSupply = steelResult?.totalSupply ?? 0;
    const steelUnfilledDemand = steelResult?.unfilledDemand ?? 0;
    const steelUnsoldSupply = steelResult?.unsoldSupply ?? 0;
    const steelVolume = steelResult?.totalVolume ?? 0;
    const steelFillRate = steelTotalDemand > 0 ? steelVolume / steelTotalDemand : 0;
    const oilRefineryScaleAvg = oilRefineryCount > 0 ? oilRefineryScale / oilRefineryCount : 0;
    const oilRefineryRevenueAvg = oilRefineryCount > 0 ? oilRefineryRevenue / oilRefineryCount : 0;
    const fuelPrice = priceOf(planet, fuelResourceType.name);
    const plasticPrice = priceOf(planet, plasticResourceType.name);
    const chemicalPrice = priceOf(planet, chemicalResourceType.name);
    const fuelCostFloor = planet.lastProductionCostFloors[fuelResourceType.name] ?? 0;
    const plasticCostFloor = planet.lastProductionCostFloors[plasticResourceType.name] ?? 0;
    const chemicalCostFloor = planet.lastProductionCostFloors[chemicalResourceType.name] ?? 0;
    const fuelFillRate = fillRateOf(planet, fuelResourceType.name);
    const chemicalOverFuelPriceRatio = fuelPrice > 0 ? chemicalPrice / fuelPrice : 0;
    const jointBundleCost = 80 * fuelCostFloor + 60 * plasticCostFloor + 60 * chemicalCostFloor;
    const jointBundleRevenue = 80 * fuelPrice + 60 * plasticPrice + 60 * chemicalPrice;
    const jointBundleCoverage = jointBundleCost > 0 ? jointBundleRevenue / jointBundleCost : 0;
    const siliconWaferResourceEfficiencyAvg =
        siliconWaferCount > 0 ? siliconWaferResourceEfficiency / siliconWaferCount : 0;
    const siliconWaferWorkerEfficiencyAvg =
        siliconWaferCount > 0 ? siliconWaferWorkerEfficiency / siliconWaferCount : 0;
    const siliconWaferInputSandAvg = siliconWaferCount > 0 ? siliconWaferInputSand / siliconWaferCount : 0;
    const siliconWaferInputChemicalAvg = siliconWaferCount > 0 ? siliconWaferInputChemical / siliconWaferCount : 0;
    const siliconWaferInputWaterAvg = siliconWaferCount > 0 ? siliconWaferInputWater / siliconWaferCount : 0;
    const fillRateSteel = fillRateOf(planet, steelResourceType.name);
    const fillRateElectronics = fillRateOf(planet, electronicsResourceType.name);
    const fillRatePlastic = fillRateOf(planet, plasticResourceType.name);
    const fillRateIronOre = fillRateOf(planet, ironOreResourceType.name);
    const fillRateCoal = fillRateOf(planet, coalResourceType.name);
    const fillRateCopper = fillRateOf(planet, copperResourceType.name);
    const fillRateSiliconWafer = fillRateOf(planet, siliconWaferResourceType.name);

    const sandResult = planet.lastMarketResult[sandResourceType.name];
    const sandTotalDemand = sandResult?.totalDemand ?? 0;
    const sandTotalSupply = sandResult?.totalSupply ?? 0;
    const sandUnfilledDemand = sandResult?.unfilledDemand ?? 0;
    const sandUnsoldSupply = sandResult?.unsoldSupply ?? 0;
    const sandFillRate = sandTotalDemand > 0 ? sandResult.totalVolume / sandTotalDemand : 0;
    const sandMineScaleAvg = sandMineCount > 0 ? sandMineScale / sandMineCount : 0;
    const sandMineMaxScaleAvg = sandMineCount > 0 ? sandMineMaxScale / sandMineCount : 0;
    const sandMineConditionAvg = sandMineCount > 0 ? sandMineCondition / sandMineCount : 1;
    const sandMineInputDepositEfficiencyAvg =
        sandMineCount > 0 ? sandMineInputDepositEfficiency / sandMineCount : 0;
    const sandMineWorkerEfficiencyAvg = sandMineCount > 0 ? sandMineWorkerEfficiency / sandMineCount : 0;
    const sandMineOverallEfficiencyAvg = sandMineCount > 0 ? sandMineOverallEfficiency / sandMineCount : 0;
    const sandMineContractionIntegralAvg = sandMineCount > 0 ? sandMineContractionIntegral / sandMineCount : 0;
    const sandMineExpansionIntegralAvg = sandMineCount > 0 ? sandMineExpansionIntegral / sandMineCount : 0;
    const sandMineSmoothedSignalAvg = sandMineCount > 0 ? sandMineSmoothedSignal / sandMineCount : 0;

    const coalResult = planet.lastMarketResult[coalResourceType.name];
    const coalTotalDemand = coalResult?.totalDemand ?? 0;
    const coalTotalSupply = coalResult?.totalSupply ?? 0;
    const coalUnfilledDemand = coalResult?.unfilledDemand ?? 0;
    const coalUnsoldSupply = coalResult?.unsoldSupply ?? 0;
    const coalMineScaleAvg = coalMineCount > 0 ? coalMineScale / coalMineCount : 0;
    const coalMineMaxScaleAvg = coalMineCount > 0 ? coalMineMaxScale / coalMineCount : 0;
    const coalMineConditionAvg = coalMineCount > 0 ? coalMineCondition / coalMineCount : 1;
    const coalMineInputDepositEfficiencyAvg =
        coalMineCount > 0 ? coalMineInputDepositEfficiency / coalMineCount : 0;
    const coalMineWorkerEfficiencyAvg = coalMineCount > 0 ? coalMineWorkerEfficiency / coalMineCount : 0;
    const coalMineOverallEfficiencyAvg = coalMineCount > 0 ? coalMineOverallEfficiency / coalMineCount : 0;
    const coalMineContractionIntegralAvg = coalMineCount > 0 ? coalMineContractionIntegral / coalMineCount : 0;
    const coalMineExpansionIntegralAvg = coalMineCount > 0 ? coalMineExpansionIntegral / coalMineCount : 0;
    const coalMineSmoothedSignalAvg = coalMineCount > 0 ? coalMineSmoothedSignal / coalMineCount : 0;
    const ironMineScaleAvg = ironMineCount > 0 ? ironMineScale / ironMineCount : 0;
    const ironMineMaxScaleAvg = ironMineCount > 0 ? ironMineMaxScale / ironMineCount : 0;
    const ironMineConditionAvg = ironMineCount > 0 ? ironMineCondition / ironMineCount : 1;
    const ironMineInputDepositEfficiencyAvg =
        ironMineCount > 0 ? ironMineInputDepositEfficiency / ironMineCount : 0;
    const ironMineInputCoalEfficiencyAvg =
        ironMineCount > 0 ? ironMineInputCoalEfficiency / ironMineCount : 0;
    const ironMineWorkerEfficiencyAvg = ironMineCount > 0 ? ironMineWorkerEfficiency / ironMineCount : 0;
    const ironMineOverallEfficiencyAvg = ironMineCount > 0 ? ironMineOverallEfficiency / ironMineCount : 0;
    const ironMineContractionIntegralAvg = ironMineCount > 0 ? ironMineContractionIntegral / ironMineCount : 0;
    const ironMineExpansionIntegralAvg = ironMineCount > 0 ? ironMineExpansionIntegral / ironMineCount : 0;
    const ironMineSmoothedSignalAvg = ironMineCount > 0 ? ironMineSmoothedSignal / ironMineCount : 0;
    const ironSmelterScaleAvg = ironSmelterCount > 0 ? ironSmelterScale / ironSmelterCount : 0;
    const ironSmelterMaxScaleAvg = ironSmelterCount > 0 ? ironSmelterMaxScale / ironSmelterCount : 0;
    const ironSmelterConditionAvg = ironSmelterCount > 0 ? ironSmelterCondition / ironSmelterCount : 1;
    const ironSmelterInputIronOreAvg = ironSmelterCount > 0 ? ironSmelterInputIronOre / ironSmelterCount : 0;
    const ironSmelterInputCoalAvg = ironSmelterCount > 0 ? ironSmelterInputCoal / ironSmelterCount : 0;
    const ironSmelterWorkerEfficiencyAvg = ironSmelterCount > 0 ? ironSmelterWorkerEfficiency / ironSmelterCount : 0;
    const ironSmelterOverallEfficiencyAvg = ironSmelterCount > 0 ? ironSmelterOverallEfficiency / ironSmelterCount : 0;
    const ironSmelterContractionIntegralAvg = ironSmelterCount > 0 ? ironSmelterContractionIntegral / ironSmelterCount : 0;
    const ironSmelterExpansionIntegralAvg = ironSmelterCount > 0 ? ironSmelterExpansionIntegral / ironSmelterCount : 0;
    const ironSmelterSmoothedSignalAvg = ironSmelterCount > 0 ? ironSmelterSmoothedSignal / ironSmelterCount : 0;

    const meanWealth = totalPopulation > 0 ? wealthWeighted / totalPopulation : 0;
    const medianWealth = weightedQuantile(wealthEntries, 0.5);
    const wealthP10 = weightedQuantile(wealthEntries, 0.1);
    const wealthP90 = weightedQuantile(wealthEntries, 0.9);
    const wealthTotal = wealthWeighted;
    const redistributedTotal = planet.governmentSupportVolume;
    const redistributedPerCapita = totalPopulation > 0 ? planet.governmentSupportVolume / totalPopulation : 0;
    const governmentDebt = planet.governmentDebt;
    const governmentDeposits =
        gameState.agents.get(planet.governmentId)?.assets[planet.id]?.deposits ?? 0;
    const foodPrice = priceOf(planet, groceryServiceResourceType.name);

    const companyNetWorthMin = companyNetWorths.length > 0 ? Math.min(...companyNetWorths) : 0;
    const companyNetWorthMedian = companyNetWorths.length > 0 ? median(companyNetWorths) : 0;
    const companyNetWorthMax = companyNetWorths.length > 0 ? Math.max(...companyNetWorths) : 0;
    const companyProfitMin = companyProfits.length > 0 ? Math.min(...companyProfits) : 0;
    const companyProfitMedian = companyProfits.length > 0 ? median(companyProfits) : 0;
    const companyProfitMax = companyProfits.length > 0 ? Math.max(...companyProfits) : 0;
    const companyProfitP10 = weightedQuantile(
        companyProfits.map((p) => ({ mean: p, count: 1 })),
        0.1,
    );
    const companyRunwayMedian = median(companyRunways);
    const companyRunwayMin = companyRunways.length > 0 ? Math.min(...companyRunways) : 0;
    const companyDebtEquityMedian = debtEquitys.length > 0 ? median(debtEquitys) : 0;
    const companyDebtRevenueMedian = debtRevenues.length > 0 ? median(debtRevenues) : 0;

    const facilityTypeMetrics: MetricMap = {};
    for (const key of FACILITY_TYPE_KEYS) {
        const s = facilityStats.get(key);
        if (!s || s.count === 0) {
            continue;
        }
        facilityTypeMetrics[`facilityCount_${key}`] = s.count;
        facilityTypeMetrics[`facilityProfit_${key}`] = s.profit / s.count;
        facilityTypeMetrics[`facilityMargin_${key}`] = s.revenue > 0 ? s.profit / s.revenue : 0;
        facilityTypeMetrics[`facilityPriceOverCost_${key}`] = s.priceOverCost / s.count;
        facilityTypeMetrics[`facilitySignal_${key}`] = s.signalActual / s.count;
        facilityTypeMetrics[`facilityCandidateSignal_${key}`] = s.signalCandidate / s.count;
        facilityTypeMetrics[`facilityScale_${key}`] = s.scale;
        facilityTypeMetrics[`facilityLandInputCosts_${key}`] = s.landInputCosts / s.count;
        facilityTypeMetrics[`facilityLossCaughtActual_${key}`] =
            s.lossCount > 0 ? s.lossCaughtActual / s.lossCount : 0;
        facilityTypeMetrics[`facilityLossCaughtBlend_${key}`] =
            s.lossCount > 0 ? s.lossCaughtBlend / s.lossCount : 0;
    }
    const recyclableValueInLosers =
        recyclableCSInLosers *
        (planet.marketPrices[constructionServiceResourceType.name] ?? 0) *
        RECYCLER_BASE_RECOVERY_EFFICIENCY *
        RECYCLER_PAYMENT_RATIO;

    return {
        tick: gameState.tick,
        totalPopulation,
        employable,
        employed,
        unableToWork,
        inEducation,
        unoccNone: unoccByEdu.none,
        unoccPrimary: unoccByEdu.primary,
        unoccSecondary: unoccByEdu.secondary,
        unoccTertiary: unoccByEdu.tertiary,
        allocNone: allocByEdu.none,
        allocPrimary: allocByEdu.primary,
        allocSecondary: allocByEdu.secondary,
        allocTertiary: allocByEdu.tertiary,
        activeNone: activeByEdu.none,
        activePrimary: activeByEdu.primary,
        activeSecondary: activeByEdu.secondary,
        activeTertiary: activeByEdu.tertiary,
        wageNone: wageByEduCount.none > 0 ? wageByEdu.none / wageByEduCount.none : 0,
        wagePrimary: wageByEduCount.primary > 0 ? wageByEdu.primary / wageByEduCount.primary : 0,
        wageSecondary: wageByEduCount.secondary > 0 ? wageByEdu.secondary / wageByEduCount.secondary : 0,
        wageTertiary: wageByEduCount.tertiary > 0 ? wageByEdu.tertiary / wageByEduCount.tertiary : 0,
        capacityNone: capacityByEdu.none,
        capacityPrimary: capacityByEdu.primary,
        capacitySecondary: capacityByEdu.secondary,
        capacityTertiary: capacityByEdu.tertiary,
        slotsFilledNone: slotsFilledByEdu.none,
        slotsFilledPrimary: slotsFilledByEdu.primary,
        slotsFilledSecondary: slotsFilledByEdu.secondary,
        slotsFilledTertiary: slotsFilledByEdu.tertiary,
        slotFillNone: slotFillByEdu.none,
        slotFillPrimary: slotFillByEdu.primary,
        slotFillSecondary: slotFillByEdu.secondary,
        slotFillTertiary: slotFillByEdu.tertiary,
        overqualNone: overqualByEdu.none,
        overqualPrimary: overqualByEdu.primary,
        overqualSecondary: overqualByEdu.secondary,
        overqualTertiary: overqualByEdu.tertiary,
        vacancyWageNone: laborMarket.reachableVacancyWage.none,
        vacancyWagePrimary: laborMarket.reachableVacancyWage.primary,
        vacancyWageSecondary: laborMarket.reachableVacancyWage.secondary,
        vacancyWageTertiary: laborMarket.reachableVacancyWage.tertiary,
        tightnessNone: laborMarket.reachableTightness.none,
        tightnessPrimary: laborMarket.reachableTightness.primary,
        tightnessSecondary: laborMarket.reachableTightness.secondary,
        tightnessTertiary: laborMarket.reachableTightness.tertiary,
        reachUnoccNone: unoccByEdu.none + unoccByEdu.primary + unoccByEdu.secondary + unoccByEdu.tertiary,
        reachUnoccPrimary: unoccByEdu.primary + unoccByEdu.secondary + unoccByEdu.tertiary,
        reachUnoccSecondary: unoccByEdu.secondary + unoccByEdu.tertiary,
        reachUnoccTertiary: unoccByEdu.tertiary,
        fillNone: capacityByEdu.none > 0 ? slotsFilledByEdu.none / capacityByEdu.none : 1,
        fillPrimary: capacityByEdu.primary > 0 ? slotsFilledByEdu.primary / capacityByEdu.primary : 1,
        fillSecondary: capacityByEdu.secondary > 0 ? slotsFilledByEdu.secondary / capacityByEdu.secondary : 1,
        fillTertiary: capacityByEdu.tertiary > 0 ? slotsFilledByEdu.tertiary / capacityByEdu.tertiary : 1,
        fillSlotNone: capacityByEdu.none > 0 ? slotFillByEdu.none / capacityByEdu.none : 1,
        fillSlotPrimary: capacityByEdu.primary > 0 ? slotFillByEdu.primary / capacityByEdu.primary : 1,
        fillSlotSecondary: capacityByEdu.secondary > 0 ? slotFillByEdu.secondary / capacityByEdu.secondary : 1,
        fillSlotTertiary: capacityByEdu.tertiary > 0 ? slotFillByEdu.tertiary / capacityByEdu.tertiary : 1,
        dependencyRatio: employable + employed > 0 ? (inEducation + unableToWork) / (employable + employed) : 0,
        avgGroceryStarvation: totalPopulation > 0 ? groceryStarvationWeighted / totalPopulation : 0,
        avgHealthcareStarvation: totalPopulation > 0 ? healthcareStarvationWeighted / totalPopulation : 0,
        maxGroceryStarvation,
        starvationMildFraction: totalPopulation > 0 ? starvationMild / totalPopulation : 0,
        starvationSevereFraction: totalPopulation > 0 ? starvationSevere / totalPopulation : 0,
        starvationFatalFraction: totalPopulation > 0 ? starvationFatal / totalPopulation : 0,
        deathsLastMonth,
        deathsThisMonth,
        birthsThisMonth: 0,
        meanWealth,
        medianWealth,
        wealthP10,
        wealthP90,
        wealthTotal,
        redistributedTotal,
        redistributedPerCapita,
        governmentDebt,
        governmentDeposits,
        foodPrice,
        wealthToFoodPrice: foodPrice > 0 ? meanWealth / foodPrice : 0,
        waterPrice: priceOf(planet, waterResourceType.name),
        priceLevelRaw: tierAveragePrice(planet, 'raw'),
        priceLevelRefined: tierAveragePrice(planet, 'refined'),
        priceLevelManufactured: tierAveragePrice(planet, 'manufactured'),
        priceLevelServices: tierAveragePrice(planet, 'services'),
        refinedToRawPriceRatio: tierAveragePrice(planet, 'raw') > 0 ? tierAveragePrice(planet, 'refined') / tierAveragePrice(planet, 'raw') : 0,
        manufacturedToRawPriceRatio:
            tierAveragePrice(planet, 'raw') > 0 ? tierAveragePrice(planet, 'manufactured') / tierAveragePrice(planet, 'raw') : 0,
        groceryFillRate,
        groceryBuffer,
        groceryTotalDemand: groceryResult?.totalDemand ?? 0,
        groceryTotalSupply: groceryResult?.totalSupply ?? 0,
        groceryTotalVolume: groceryResult?.totalVolume ?? 0,
        gdpAnnual,
        costOfLiving: computeCostOfLiving(planet, false),
        bankEquity: planet.bank.equity,
        bankDeposits: planet.bank.deposits,
        bankLoans: planet.bank.loans,
        householdDeposits: planet.bank.householdDeposits,
        rolloverDenials: planet.rolloverDenials,
        debtWriteOffs: planet.debtWriteOffs,
        bankruptcies: planet.bankruptcies,
        refoundCount: planet.refoundCount,
        loanInterestCollected: planet.loanInterestCollected,
        emergencyLoansGranted: planet.emergencyLoansGranted,
        totalLoans,
        loansWageCoverage,
        loansBufferCoverage,
        loansRollover,
        loansStarter,
        loansOther,
        agentsInDistress,
        totalAgentDeposits,
        profitShareBonuses,
        companyCount,
        companyNetWorthMin,
        companyNetWorthMedian,
        companyNetWorthMax,
        companyProfitMin,
        companyProfitMedian,
        companyProfitMax,
        companyProfitP10,
        companiesDeepLoss,
        companiesProfitable,
        companiesContracting,
        companiesNearInsolvent,
        companyNetWorthNegativeCount,
        companyRunwayMin,
        companyRunwayMedian,
        companyDebtEquityMedian,
        companyDebtRevenueMedian,
        wealthTaxPayers,
        lossMakingWealthTaxPayers,
        wealthTaxPaidByLossMaking,
        wealthTaxPaidByProfitable,
        companiesUnderwater,
        companiesUnderwaterEssential,
        companiesOverCreditLimit,
        overLimitLoanAmount,
        totalFacilitiesCollateral,
        totalMaxLoanAmount,
        companiesWithRolloverLoans,
        rolloverLoanPrincipal,
        facilityLossCount,
        facilityLossCaughtActual: facilityLossCount > 0 ? facilityLossCaughtActual / facilityLossCount : 0,
        facilityLossCaughtBlend: facilityLossCount > 0 ? facilityLossCaughtBlend / facilityLossCount : 0,
        facilityFalsePositiveActual,
        facilityEssentialLossCount,
        facilityEssentialLossCaughtBlend:
            facilityEssentialLossCount > 0 ? facilityEssentialLossCaughtBlend / facilityEssentialLossCount : 0,
        facilityLossSum,
        facilityProfitSum,
        facilityLandInputCostSum,
        expansionBlockedByProfit,
        companyAggregateProfit:
            companyRevenueTotal - companyWagesTotal - companyPurchasesTotal - companyClaimsTotal,
        facilityAggregateProfitMonth:
            (facilityRevenueTickTotal - facilityWagesTickTotal - facilityInputsTickTotal) * TICKS_PER_MONTH,
        overheadWages: companyWagesTotal - facilityWagesTickTotal * TICKS_PER_MONTH,
        depreciatedValue,
        depreciatedServiceValue,
        depreciatedGoodsValue,
        depreciatedNaturalValue,
        depreciatedExcessValue: depreciatedValue - depreciatedNaturalValue,
        maxStorageStarvation,
        highStarvationCompanies,
        storageDeptScale: storageDeptCount > 0 ? storageDeptScaleTotal / storageDeptCount : 0,
        storageDeptMaxScale: storageDeptCount > 0 ? storageDeptMaxScaleTotal / storageDeptCount : 0,
        companyWagesTotal,
        companyPurchasesTotal,
        companyClaimsTotal,
        companyRevenueTotal,
        recyclableCSInLosers,
        recyclableValueInLosers,
        ...facilityTypeMetrics,
        wealthTaxCollected,
        workerUtilization: totalSlots > 0 ? usedWorkers / totalSlots : 0,
        avgWage: wageCount > 0 ? wageSum / wageCount : 0,
        existentialAgentCount,
        nonExistentialAgentCount,
        existentialSlotCapacity,
        nonExistentialSlotCapacity,
        existentialUsedWorkers,
        nonExistentialUsedWorkers,
        existentialFillRatio: existentialSlotCapacity > 0 ? existentialUsedWorkers / existentialSlotCapacity : 0,
        nonExistentialFillRatio: nonExistentialSlotCapacity > 0 ? nonExistentialUsedWorkers / nonExistentialSlotCapacity : 0,
        foodChainFillRatio: foodChainSlotCapacity > 0 ? foodChainUsedWorkers / foodChainSlotCapacity : 0,
        existentialMaxScale,
        nonExistentialMaxScale,
        existentialOperatingScale,
        nonExistentialOperatingScale,
        existentialContractionIntegral,
        nonExistentialContractionIntegral,
        existentialNegativeProfitFacilities,
        nonExistentialNegativeProfitFacilities,
        existentialAtLowerBoundFacilities,
        nonExistentialAtLowerBoundFacilities,
        productionEfficiency: productionFacilityCount > 0 ? productionEfficiencySum / productionFacilityCount : 0,
        avgFacilityCondition: facilityCount > 0 ? facilityConditionSum / facilityCount : 1,
        avgWorkerEfficiency: productionFacilityCount > 0 ? workerEfficiencySum / productionFacilityCount : 1,
        avgResourceEfficiency: productionFacilityCount > 0 ? resourceEfficiencySum / productionFacilityCount : 1,
        avgConditionEfficiency: conditionEfficiencyCount > 0 ? conditionEfficiencySum / conditionEfficiencyCount : 1,
        avgMaxMaintenance: maxMaintenanceCount > 0 ? maxMaintenanceSum / maxMaintenanceCount : 1,
        facilitiesBelowFullMaintenance,
        hrScale: hrCount > 0 ? hrScaleSum / hrCount : 0,
        hrMaxScale: hrCount > 0 ? hrMaxScaleSum / hrCount : 0,
        hrSignal: hrCount > 0 ? hrSignalSum / hrCount : 0,
        hrExpansionIntegral: hrCount > 0 ? hrExpansionIntegralSum / hrCount : 0,
        avgHrBuffer: productionFacilityCount > 0 ? hrBufferSum / productionFacilityCount : 0,
        hrCoverageRatio: usedWorkers > 0 ? hrBufferSum / usedWorkers : 0,
        avgStorageStarvation: storageStarvationCount > 0 ? storageStarvationSum / storageStarvationCount : 0,
        maintenanceServicePrice: priceOf(planet, maintenanceServiceResourceType.name),
        maintenanceServiceVolume: maintenanceResult?.totalVolume ?? 0,
        maintenanceServiceDemand: maintenanceResult?.totalDemand ?? 0,
        maintenanceTotalSupply: maintTotalSupply,
        maintenanceUnfilledDemand: maintUnfilledDemand,
        maintenanceUnsoldSupply: maintUnsoldSupply,
        maintenanceUnfilledFrac: maintUnfilledFrac,
        maintenanceUnsoldFrac: maintUnsoldFrac,
        constructionServicePrice: priceOf(planet, constructionServiceResourceType.name),
        constructionServiceVolume: constructionResult?.totalVolume ?? 0,
        constructionServiceDemand: constructionResult?.totalDemand ?? 0,
        constructionFillRate,
        constructionUnfilledFrac,
        constructionUnsoldFrac,
        adminServicePrice: priceOf(planet, administrativeServiceResourceType.name),
        adminServiceVolume: adminResult?.totalVolume ?? 0,
        logisticsServicePrice: priceOf(planet, logisticsServiceResourceType.name),
        logisticsServiceVolume: logisticsResult?.totalVolume ?? 0,
        housingBuffer,
        constructionEmploymentShare,
        maintFacilityScale,
        maintFacilityMaxScale,
        maintFacilityCondition,
        maintFacilityOutput,
        maintFacilityCostFloor,
        maintFacilityRevenue,
        maintFacilityInputCosts,
        maintFacilityWageCosts,
        maintFacilityProfit,
        maintFacilitySmoothedSignal: maintFacilitySmoothedSignalAvg,
        maintFacilityExpansionIntegral: maintFacilityExpansionIntegralAvg,
        maintFacilityContractionIntegral: maintFacilityContractionIntegralAvg,
        maintFacilityOverallEfficiency: maintFacilityOverallEfficiencyAvg,
        maintFacilityResourceEfficiency: maintFacilityResourceEfficiencyAvg,
        maintFacilityWorkerEfficiency: maintFacilityWorkerEfficiencyAvg,
        maintFacilityConditionEfficiency: maintFacilityConditionEfficiencyAvg,
        maintInputEfficiencySteel: maintInputEfficiencySteelAvg,
        maintInputEfficiencyElectronics: maintInputEfficiencyElectronicsAvg,
        maintInputEfficiencyPlastic: maintInputEfficiencyPlasticAvg,
        maintSteelBuffer: maintSteelBufferAvg,
        maintElectronicsBuffer: maintElectronicsBufferAvg,
        maintPlasticBuffer: maintPlasticBufferAvg,
        fillRateSteel,
        fillRateElectronics,
        fillRatePlastic,
        fillRateIronOre,
        fillRateCoal,
        fillRateCopper,
        fillRateSiliconWafer,
        siliconWaferResourceEfficiency: siliconWaferResourceEfficiencyAvg,
        siliconWaferWorkerEfficiency: siliconWaferWorkerEfficiencyAvg,
        siliconWaferInputSand: siliconWaferInputSandAvg,
        siliconWaferInputChemical: siliconWaferInputChemicalAvg,
        siliconWaferInputWater: siliconWaferInputWaterAvg,
        fillRateSand: sandFillRate,
        sandTotalDemand,
        sandTotalSupply,
        sandUnfilledDemand,
        sandUnsoldSupply,
        sandMineScale: sandMineScaleAvg,
        sandMineMaxScale: sandMineMaxScaleAvg,
        sandMineCondition: sandMineConditionAvg,
        sandMineInputDepositEfficiency: sandMineInputDepositEfficiencyAvg,
        sandMineWorkerEfficiency: sandMineWorkerEfficiencyAvg,
        sandMineOverallEfficiency: sandMineOverallEfficiencyAvg,
        sandMineContractionIntegral: sandMineContractionIntegralAvg,
        sandMineExpansionIntegral: sandMineExpansionIntegralAvg,
        sandMineSmoothedSignal: sandMineSmoothedSignalAvg,
        coalTotalDemand,
        coalTotalSupply,
        coalUnfilledDemand,
        coalUnsoldSupply,
        coalMineScale: coalMineScaleAvg,
        coalMineMaxScale: coalMineMaxScaleAvg,
        coalMineCondition: coalMineConditionAvg,
        coalMineInputDepositEfficiency: coalMineInputDepositEfficiencyAvg,
        coalMineWorkerEfficiency: coalMineWorkerEfficiencyAvg,
        coalMineOverallEfficiency: coalMineOverallEfficiencyAvg,
        coalMineContractionIntegral: coalMineContractionIntegralAvg,
        coalMineExpansionIntegral: coalMineExpansionIntegralAvg,
        coalMineSmoothedSignal: coalMineSmoothedSignalAvg,
        ironMineScale: ironMineScaleAvg,
        ironMineMaxScale: ironMineMaxScaleAvg,
        ironMineCondition: ironMineConditionAvg,
        ironMineInputDepositEfficiency: ironMineInputDepositEfficiencyAvg,
        ironMineInputCoalEfficiency: ironMineInputCoalEfficiencyAvg,
        ironMineWorkerEfficiency: ironMineWorkerEfficiencyAvg,
        ironMineOverallEfficiency: ironMineOverallEfficiencyAvg,
        ironMineContractionIntegral: ironMineContractionIntegralAvg,
        ironMineExpansionIntegral: ironMineExpansionIntegralAvg,
        ironMineSmoothedSignal: ironMineSmoothedSignalAvg,
        ironSmelterScale: ironSmelterScaleAvg,
        ironSmelterMaxScale: ironSmelterMaxScaleAvg,
        ironSmelterCondition: ironSmelterConditionAvg,
        ironSmelterInputIronOre: ironSmelterInputIronOreAvg,
        ironSmelterInputCoal: ironSmelterInputCoalAvg,
        ironSmelterWorkerEfficiency: ironSmelterWorkerEfficiencyAvg,
        ironSmelterOverallEfficiency: ironSmelterOverallEfficiencyAvg,
        ironSmelterContractionIntegral: ironSmelterContractionIntegralAvg,
        ironSmelterExpansionIntegral: ironSmelterExpansionIntegralAvg,
        ironSmelterSmoothedSignal: ironSmelterSmoothedSignalAvg,
        ironSmelterOutput: ironSmelterOutputAvg,
        ironSmelterRevenue: ironSmelterRevenueAvg,
        ironSmelterInputCosts: ironSmelterInputCostsAvg,
        ironSmelterWageCosts: ironSmelterWageCostsAvg,
        ironSmelterProfit: ironSmelterProfitAvg,
        ironSmelterCostFloor,
        steelPrice,
        steelTotalDemand,
        steelTotalSupply,
        steelUnfilledDemand,
        steelUnsoldSupply,
        steelVolume,
        steelFillRate,
        oilRefineryScale: oilRefineryScaleAvg,
        oilRefineryRevenue: oilRefineryRevenueAvg,
        fuelPrice,
        plasticPrice,
        chemicalPrice,
        fuelCostFloor,
        plasticCostFloor,
        chemicalCostFloor,
        fuelFillRate,
        chemicalOverFuelPriceRatio,
        jointBundleCoverage,
        maintAggregateConsumption,
        maintSteadyStateDemand,
        maintCatchupBacklog,
        maintAggregateBuffer,
        maintFillRate,
        maintRepairSurgeRatio,
        constructionFacilityScale: constructionFacilityScaleAvg,
        constructionFacilityMaxScale: constructionFacilityMaxScaleAvg,
        constructionFacilityCondition,
        constructionFacilitySignal,
        restorationAggregateConsumption,
        priceCeilHits,
        priceFloorHits,
    };
}

export const METRIC_KEYS: string[] = [
    'tick',
    'totalPopulation',
    'employable',
    'employed',
    'unableToWork',
    'inEducation',
    'unoccNone',
    'unoccPrimary',
    'unoccSecondary',
    'unoccTertiary',
    'allocNone',
    'allocPrimary',
    'allocSecondary',
    'allocTertiary',
    'activeNone',
    'activePrimary',
    'activeSecondary',
    'activeTertiary',
    'wageNone',
    'wagePrimary',
    'wageSecondary',
    'wageTertiary',
    'capacityNone',
    'capacityPrimary',
    'capacitySecondary',
    'capacityTertiary',
    'slotsFilledNone',
    'slotsFilledPrimary',
    'slotsFilledSecondary',
    'slotsFilledTertiary',
    'slotFillNone',
    'slotFillPrimary',
    'slotFillSecondary',
    'slotFillTertiary',
    'overqualNone',
    'overqualPrimary',
    'overqualSecondary',
    'overqualTertiary',
    'vacancyWageNone',
    'vacancyWagePrimary',
    'vacancyWageSecondary',
    'vacancyWageTertiary',
    'tightnessNone',
    'tightnessPrimary',
    'tightnessSecondary',
    'tightnessTertiary',
    'reachUnoccNone',
    'reachUnoccPrimary',
    'reachUnoccSecondary',
    'reachUnoccTertiary',
    'fillNone',
    'fillPrimary',
    'fillSecondary',
    'fillTertiary',
    'fillSlotNone',
    'fillSlotPrimary',
    'fillSlotSecondary',
    'fillSlotTertiary',
    'dependencyRatio',
    'avgGroceryStarvation',
    'avgHealthcareStarvation',
    'maxGroceryStarvation',
    'starvationMildFraction',
    'starvationSevereFraction',
    'starvationFatalFraction',
    'deathsLastMonth',
    'deathsThisMonth',
    'birthsThisMonth',
    'meanWealth',
    'medianWealth',
    'wealthP10',
    'wealthP90',
    'wealthTotal',
    'redistributedTotal',
    'redistributedPerCapita',
    'governmentDebt',
    'governmentDeposits',
    'foodPrice',
    'wealthToFoodPrice',
    'waterPrice',
    'priceLevelRaw',
    'priceLevelRefined',
    'priceLevelManufactured',
    'priceLevelServices',
    'refinedToRawPriceRatio',
    'manufacturedToRawPriceRatio',
    'groceryFillRate',
    'groceryBuffer',
    'groceryTotalDemand',
    'groceryTotalSupply',
    'groceryTotalVolume',
    'gdpAnnual',
    'costOfLiving',
    'bankEquity',
    'bankDeposits',
    'bankLoans',
    'householdDeposits',
    'rolloverDenials',
    'debtWriteOffs',
    'bankruptcies',
    'refoundCount',
    'loanInterestCollected',
    'emergencyLoansGranted',
    'totalLoans',
    'loansWageCoverage',
    'loansBufferCoverage',
    'loansRollover',
    'loansStarter',
    'loansOther',
    'agentsInDistress',
    'totalAgentDeposits',
    'profitShareBonuses',
    'companyCount',
    'companyNetWorthMin',
    'companyNetWorthMedian',
    'companyNetWorthMax',
    'companyProfitMin',
    'companyProfitMedian',
    'companyProfitMax',
    'companyProfitP10',
    'companiesDeepLoss',
    'companiesProfitable',
    'companiesContracting',
    'companiesNearInsolvent',
    'companyNetWorthNegativeCount',
    'companyRunwayMin',
    'companyRunwayMedian',
    'companyDebtEquityMedian',
    'companyDebtRevenueMedian',
    'wealthTaxPayers',
    'lossMakingWealthTaxPayers',
    'wealthTaxPaidByLossMaking',
    'wealthTaxPaidByProfitable',
    'companiesUnderwater',
    'companiesUnderwaterEssential',
    'companiesOverCreditLimit',
    'overLimitLoanAmount',
    'totalFacilitiesCollateral',
    'totalMaxLoanAmount',
    'companiesWithRolloverLoans',
    'rolloverLoanPrincipal',
    'facilityLossCount',
    'facilityLossCaughtActual',
    'facilityLossCaughtBlend',
    'facilityFalsePositiveActual',
    'facilityEssentialLossCount',
    'facilityEssentialLossCaughtBlend',
    'facilityLossSum',
    'facilityProfitSum',
    'facilityLandInputCostSum',
    'expansionBlockedByProfit',
    'companyAggregateProfit',
    'facilityAggregateProfitMonth',
    'overheadWages',
    'depreciatedValue',
    'depreciatedServiceValue',
    'depreciatedGoodsValue',
    'depreciatedNaturalValue',
    'depreciatedExcessValue',
    'maxStorageStarvation',
    'highStarvationCompanies',
    'storageDeptScale',
    'storageDeptMaxScale',
    'companyWagesTotal',
    'companyPurchasesTotal',
    'companyClaimsTotal',
    'companyRevenueTotal',
    'recyclableCSInLosers',
    'recyclableValueInLosers',
    ...FACILITY_TYPE_KEYS.flatMap((key) => [
        `facilityCount_${key}`,
        `facilityProfit_${key}`,
        `facilityMargin_${key}`,
        `facilityPriceOverCost_${key}`,
        `facilitySignal_${key}`,
        `facilityCandidateSignal_${key}`,
        `facilityScale_${key}`,
        `facilityLandInputCosts_${key}`,
        `facilityLossCaughtActual_${key}`,
        `facilityLossCaughtBlend_${key}`,
    ]),
    'wealthTaxCollected',
    'workerUtilization',
    'avgWage',
    'existentialAgentCount',
    'nonExistentialAgentCount',
    'existentialSlotCapacity',
    'nonExistentialSlotCapacity',
    'existentialUsedWorkers',
    'nonExistentialUsedWorkers',
    'existentialFillRatio',
    'nonExistentialFillRatio',
    'foodChainFillRatio',
    'existentialMaxScale',
    'nonExistentialMaxScale',
    'existentialOperatingScale',
    'nonExistentialOperatingScale',
    'existentialContractionIntegral',
    'nonExistentialContractionIntegral',
    'existentialNegativeProfitFacilities',
    'nonExistentialNegativeProfitFacilities',
    'existentialAtLowerBoundFacilities',
    'nonExistentialAtLowerBoundFacilities',
    'productionEfficiency',
    'avgFacilityCondition',
    'avgWorkerEfficiency',
    'avgResourceEfficiency',
    'avgConditionEfficiency',
    'avgMaxMaintenance',
    'facilitiesBelowFullMaintenance',
    'hrScale',
    'hrMaxScale',
    'hrSignal',
    'hrExpansionIntegral',
    'avgHrBuffer',
    'hrCoverageRatio',
    'avgStorageStarvation',
    'maintenanceServicePrice',
    'maintenanceServiceVolume',
    'maintenanceServiceDemand',
    'maintenanceTotalSupply',
    'maintenanceUnfilledDemand',
    'maintenanceUnsoldSupply',
    'maintenanceUnfilledFrac',
    'maintenanceUnsoldFrac',
    'constructionServicePrice',
    'constructionServiceVolume',
    'constructionServiceDemand',
    'constructionFillRate',
    'constructionUnfilledFrac',
    'constructionUnsoldFrac',
    'adminServicePrice',
    'adminServiceVolume',
    'logisticsServicePrice',
    'logisticsServiceVolume',
    'housingBuffer',
    'constructionEmploymentShare',
    'maintFacilityScale',
    'maintFacilityMaxScale',
    'maintFacilityCondition',
    'maintFacilityOutput',
    'maintFacilityCostFloor',
    'maintFacilityRevenue',
    'maintFacilityInputCosts',
    'maintFacilityWageCosts',
    'maintFacilityProfit',
    'maintFacilitySmoothedSignal',
    'maintFacilityExpansionIntegral',
    'maintFacilityContractionIntegral',
    'maintFacilityOverallEfficiency',
    'maintFacilityResourceEfficiency',
    'maintFacilityWorkerEfficiency',
    'maintFacilityConditionEfficiency',
    'maintInputEfficiencySteel',
    'maintInputEfficiencyElectronics',
    'maintInputEfficiencyPlastic',
    'fillRateSteel',
    'fillRateElectronics',
    'fillRatePlastic',
    'fillRateIronOre',
    'fillRateCoal',
    'fillRateCopper',
    'fillRateSiliconWafer',
    'siliconWaferResourceEfficiency',
    'siliconWaferWorkerEfficiency',
    'siliconWaferInputSand',
    'siliconWaferInputChemical',
    'siliconWaferInputWater',
    'fillRateSand',
    'sandTotalDemand',
    'sandTotalSupply',
    'sandUnfilledDemand',
    'sandUnsoldSupply',
    'sandMineScale',
    'sandMineMaxScale',
    'sandMineCondition',
    'sandMineInputDepositEfficiency',
    'sandMineWorkerEfficiency',
    'sandMineOverallEfficiency',
    'sandMineContractionIntegral',
    'sandMineExpansionIntegral',
    'sandMineSmoothedSignal',
    'coalTotalDemand',
    'coalTotalSupply',
    'coalUnfilledDemand',
    'coalUnsoldSupply',
    'coalMineScale',
    'coalMineMaxScale',
    'coalMineCondition',
    'coalMineInputDepositEfficiency',
    'coalMineWorkerEfficiency',
    'coalMineOverallEfficiency',
    'coalMineContractionIntegral',
    'coalMineExpansionIntegral',
    'coalMineSmoothedSignal',
    'ironMineScale',
    'ironMineMaxScale',
    'ironMineCondition',
    'ironMineInputDepositEfficiency',
    'ironMineInputCoalEfficiency',
    'ironMineWorkerEfficiency',
    'ironMineOverallEfficiency',
    'ironMineContractionIntegral',
    'ironMineExpansionIntegral',
    'ironMineSmoothedSignal',
    'ironSmelterScale',
    'ironSmelterMaxScale',
    'ironSmelterCondition',
    'ironSmelterInputIronOre',
    'ironSmelterInputCoal',
    'ironSmelterWorkerEfficiency',
    'ironSmelterOverallEfficiency',
    'ironSmelterContractionIntegral',
    'ironSmelterExpansionIntegral',
    'ironSmelterSmoothedSignal',
    'ironSmelterOutput',
    'ironSmelterRevenue',
    'ironSmelterInputCosts',
    'ironSmelterWageCosts',
    'ironSmelterProfit',
    'ironSmelterCostFloor',
    'steelPrice',
    'steelTotalDemand',
    'steelTotalSupply',
    'steelUnfilledDemand',
    'steelUnsoldSupply',
    'steelVolume',
    'steelFillRate',
    'oilRefineryScale',
    'oilRefineryRevenue',
    'fuelPrice',
    'plasticPrice',
    'chemicalPrice',
    'fuelCostFloor',
    'plasticCostFloor',
    'chemicalCostFloor',
    'fuelFillRate',
    'chemicalOverFuelPriceRatio',
    'jointBundleCoverage',
    'maintSteelBuffer',
    'maintElectronicsBuffer',
    'maintPlasticBuffer',
    'maintAggregateConsumption',
    'maintSteadyStateDemand',
    'maintCatchupBacklog',
    'maintAggregateBuffer',
    'maintFillRate',
    'maintRepairSurgeRatio',
    'constructionFacilityScale',
    'constructionFacilityMaxScale',
    'constructionFacilityCondition',
    'constructionFacilitySignal',
    'restorationAggregateConsumption',
    'priceCeilHits',
    'priceFloorHits',
];

