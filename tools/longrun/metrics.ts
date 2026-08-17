import { PRICE_CEIL, PRICE_FLOOR, TICKS_PER_YEAR } from '../../src/simulation/constants';
import { totalOutstandingLoans } from '../../src/simulation/financial/loanTypes';
import { computeCostOfLiving } from '../../src/simulation/market/serviceDefinitions';
import { computeFacilityConditionEfficiency, queryStorageFacility } from '../../src/simulation/planet/facility';
import { facilityMaintenanceConsumptionPerTick } from '../../src/simulation/planet/facilityMaintenance';
import type { GameState, Planet } from '../../src/simulation/planet/planet';
import { TRADABLE_RESOURCES } from '../../src/simulation/planet/resourceCatalog';
import {
    chemicalResourceType,
    coalResourceType,
    copperResourceType,
    electronicsResourceType,
    ironOreResourceType,
    plasticResourceType,
    sandResourceType,
    siliconWaferResourceType,
    steelResourceType,
    waterResourceType,
} from '../../src/simulation/planet/resources';
import { coalDepositResourceType, ironOreDepositResourceType, sandDepositResourceType } from '../../src/simulation/planet/landBoundResources';
import {
    administrativeServiceResourceType,
    constructionServiceResourceType,
    groceryServiceResourceType,
    logisticsServiceResourceType,
    maintenanceServiceResourceType,
} from '../../src/simulation/planet/services';
import { educationLevelKeys } from '../../src/simulation/population/education';
import { OCCUPATIONS } from '../../src/simulation/population/population';
import { facilityNameToKey } from './solverDiagnostic';

export type MetricMap = Record<string, number>;

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
    let groceryStarvationWeighted = 0;
    let healthcareStarvationWeighted = 0;
    let deathsLastMonth = 0;
    let deathsThisMonth = 0;
    let maxGroceryStarvation = 0;
    let starvationMild = 0;
    let starvationSevere = 0;
    let starvationFatal = 0;
    let wealthWeighted = 0;

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
    let agentsInDistress = 0;
    let totalLoans = 0;
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
    let ironMineWorkerEfficiency = 0;
    let ironMineOverallEfficiency = 0;
    let ironMineCount = 0;
    let ironSmelterScale = 0;
    let ironSmelterMaxScale = 0;
    let ironSmelterCondition = 0;
    let ironSmelterInputIronOre = 0;
    let ironSmelterInputCoal = 0;
    let ironSmelterWorkerEfficiency = 0;
    let ironSmelterOverallEfficiency = 0;
    let ironSmelterCount = 0;

    for (const agent of gameState.agents.values()) {
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }
        totalAgentDeposits += assets.deposits;
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
        usedWorkers += assets.usedWorkers;
        let agentSlots = 0;
        for (const edu of educationLevelKeys) {
            const slots = assets.totalSlotCapacity[edu] ?? 0;
            totalSlots += slots;
            agentSlots += slots;
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
                ironMineWorkerEfficiency += minValue(facility.lastTickResults?.workerEfficiency);
                ironMineOverallEfficiency += facility.lastTickResults?.overallEfficiency ?? 0;
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
                ironSmelterCount += 1;
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
            }

            if (isConstructionFacility(facility.name)) {
                constructionFacilityScale += facility.scale;
                constructionFacilityMaxScale += facility.maxScale;
                constructionFacilityConditionWeighted += (facility.maintenanceStatus ?? 1) * facility.scale;
                constructionFacilitySmoothedSignal += facility.pidState?.smoothedSignal ?? 0;
                constructionFacilityCount += 1;
            }

            const pid = facility.pidState;
            const profitEma = pid?.profitEMA ?? 0;
            const contractionIntegral = pid?.contractionIntegral ?? 0;
            const atLowerBound = facility.scale <= facility.maxScale * 0.1 + 1e-9;
            if (isExistentialFacility(facility.name)) {
                existentialMaxScale += facility.maxScale;
                existentialOperatingScale += facility.scale;
                existentialContractionIntegral += contractionIntegral;
                if (profitEma < 0) {
                    existentialNegativeProfitFacilities += 1;
                }
                if (atLowerBound) {
                    existentialAtLowerBoundFacilities += 1;
                }
            } else {
                nonExistentialMaxScale += facility.maxScale;
                nonExistentialOperatingScale += facility.scale;
                nonExistentialContractionIntegral += contractionIntegral;
                if (profitEma < 0) {
                    nonExistentialNegativeProfitFacilities += 1;
                }
                if (atLowerBound) {
                    nonExistentialAtLowerBoundFacilities += 1;
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
    }

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

    const gdpAnnual =
        Object.values(planet.avgMarketResult).reduce((sum, r) => sum + r.clearingPrice * r.totalVolume, 0) * TICKS_PER_YEAR;

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

    const constructionResult = planet.lastMarketResult[constructionServiceResourceType.name];
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
    const ironMineWorkerEfficiencyAvg = ironMineCount > 0 ? ironMineWorkerEfficiency / ironMineCount : 0;
    const ironMineOverallEfficiencyAvg = ironMineCount > 0 ? ironMineOverallEfficiency / ironMineCount : 0;
    const ironSmelterScaleAvg = ironSmelterCount > 0 ? ironSmelterScale / ironSmelterCount : 0;
    const ironSmelterMaxScaleAvg = ironSmelterCount > 0 ? ironSmelterMaxScale / ironSmelterCount : 0;
    const ironSmelterConditionAvg = ironSmelterCount > 0 ? ironSmelterCondition / ironSmelterCount : 1;
    const ironSmelterInputIronOreAvg = ironSmelterCount > 0 ? ironSmelterInputIronOre / ironSmelterCount : 0;
    const ironSmelterInputCoalAvg = ironSmelterCount > 0 ? ironSmelterInputCoal / ironSmelterCount : 0;
    const ironSmelterWorkerEfficiencyAvg = ironSmelterCount > 0 ? ironSmelterWorkerEfficiency / ironSmelterCount : 0;
    const ironSmelterOverallEfficiencyAvg = ironSmelterCount > 0 ? ironSmelterOverallEfficiency / ironSmelterCount : 0;

    const meanWealth = totalPopulation > 0 ? wealthWeighted / totalPopulation : 0;
    const foodPrice = priceOf(planet, groceryServiceResourceType.name);

    return {
        tick: gameState.tick,
        totalPopulation,
        employable,
        employed,
        unableToWork,
        inEducation,
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
        groceryTotalDemand: groceryResult?.totalDemand ?? 0,
        groceryTotalSupply: groceryResult?.totalSupply ?? 0,
        groceryTotalVolume: groceryResult?.totalVolume ?? 0,
        gdpAnnual,
        costOfLiving: computeCostOfLiving(planet, false),
        bankEquity: planet.bank.equity,
        bankDeposits: planet.bank.deposits,
        bankLoans: planet.bank.loans,
        householdDeposits: planet.bank.householdDeposits,
        totalLoans,
        loansWageCoverage,
        loansBufferCoverage,
        loansRollover,
        loansStarter,
        loansOther,
        agentsInDistress,
        totalAgentDeposits,
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
        constructionUnfilledFrac,
        constructionUnsoldFrac,
        adminServicePrice: priceOf(planet, administrativeServiceResourceType.name),
        adminServiceVolume: adminResult?.totalVolume ?? 0,
        logisticsServicePrice: priceOf(planet, logisticsServiceResourceType.name),
        logisticsServiceVolume: logisticsResult?.totalVolume ?? 0,
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
        ironMineWorkerEfficiency: ironMineWorkerEfficiencyAvg,
        ironMineOverallEfficiency: ironMineOverallEfficiencyAvg,
        ironSmelterScale: ironSmelterScaleAvg,
        ironSmelterMaxScale: ironSmelterMaxScaleAvg,
        ironSmelterCondition: ironSmelterConditionAvg,
        ironSmelterInputIronOre: ironSmelterInputIronOreAvg,
        ironSmelterInputCoal: ironSmelterInputCoalAvg,
        ironSmelterWorkerEfficiency: ironSmelterWorkerEfficiencyAvg,
        ironSmelterOverallEfficiency: ironSmelterOverallEfficiencyAvg,
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
    'groceryTotalDemand',
    'groceryTotalSupply',
    'groceryTotalVolume',
    'gdpAnnual',
    'costOfLiving',
    'bankEquity',
    'bankDeposits',
    'bankLoans',
    'householdDeposits',
    'totalLoans',
    'loansWageCoverage',
    'loansBufferCoverage',
    'loansRollover',
    'loansStarter',
    'loansOther',
    'agentsInDistress',
    'totalAgentDeposits',
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
    'constructionUnfilledFrac',
    'constructionUnsoldFrac',
    'adminServicePrice',
    'adminServiceVolume',
    'logisticsServicePrice',
    'logisticsServiceVolume',
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
    'ironMineWorkerEfficiency',
    'ironMineOverallEfficiency',
    'ironSmelterScale',
    'ironSmelterMaxScale',
    'ironSmelterCondition',
    'ironSmelterInputIronOre',
    'ironSmelterInputCoal',
    'ironSmelterWorkerEfficiency',
    'ironSmelterOverallEfficiency',
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

