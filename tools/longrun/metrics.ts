import { PRICE_CEIL, PRICE_FLOOR, TICKS_PER_YEAR } from '../../src/simulation/constants';
import { totalOutstandingLoans } from '../../src/simulation/financial/loanTypes';
import { computeCostOfLiving } from '../../src/simulation/market/serviceDefinitions';
import type { GameState, Planet } from '../../src/simulation/planet/planet';
import { TRADABLE_RESOURCES } from '../../src/simulation/planet/resourceCatalog';
import { waterResourceType } from '../../src/simulation/planet/resources';
import { groceryServiceResourceType } from '../../src/simulation/planet/services';
import { educationLevelKeys } from '../../src/simulation/population/education';
import { OCCUPATIONS } from '../../src/simulation/population/population';

export type MetricMap = Record<string, number>;

function priceOf(planet: Planet, name: string): number {
    const result = planet.lastMarketResult[name];
    if (result && result.totalVolume > 0 && result.clearingPrice > 0) {
        return result.clearingPrice;
    }
    return planet.marketPrices[name] ?? 0;
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

    for (const cohort of planet.population.demography) {
        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                const cat = cohort[occ][edu];
                if (cat.total <= 0) {
                    continue;
                }
                totalPopulation += cat.total;
                groceryStarvationWeighted += cat.total * cat.services.grocery.starvationLevel;
                healthcareStarvationWeighted += cat.total * cat.services.healthcare.starvationLevel;
                deathsLastMonth += cat.deaths.countLastMonth;
                deathsThisMonth += cat.deaths.countThisMonth;
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

    for (const agent of gameState.agents.values()) {
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }
        totalAgentDeposits += assets.deposits;
        if (assets.deposits < 0) {
            agentsInDistress += 1;
        }
        totalLoans += totalOutstandingLoans(assets.activeLoans);
        usedWorkers += assets.usedWorkers;
        for (const edu of educationLevelKeys) {
            totalSlots += assets.totalSlotCapacity[edu] ?? 0;
        }
        for (const facility of assets.productionFacilities) {
            productionFacilityCount += 1;
            productionEfficiencySum += facility.lastTickResults?.overallEfficiency ?? 0;
            facilityConditionSum += facility.maintenanceStatus ?? 1;
            facilityCount += 1;
        }
        if (assets.humanResourcesDepartment) {
            facilityConditionSum += assets.humanResourcesDepartment.maintenanceStatus ?? 1;
            facilityCount += 1;
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
        deathsLastMonth,
        deathsThisMonth,
        foodPrice: priceOf(planet, groceryServiceResourceType.name),
        waterPrice: priceOf(planet, waterResourceType.name),
        priceLevelRaw: tierAveragePrice(planet, 'raw'),
        priceLevelRefined: tierAveragePrice(planet, 'refined'),
        priceLevelManufactured: tierAveragePrice(planet, 'manufactured'),
        priceLevelServices: tierAveragePrice(planet, 'services'),
        refinedToRawPriceRatio: tierAveragePrice(planet, 'raw') > 0 ? tierAveragePrice(planet, 'refined') / tierAveragePrice(planet, 'raw') : 0,
        manufacturedToRawPriceRatio:
            tierAveragePrice(planet, 'raw') > 0 ? tierAveragePrice(planet, 'manufactured') / tierAveragePrice(planet, 'raw') : 0,
        groceryFillRate,
        gdpAnnual,
        costOfLiving: computeCostOfLiving(planet, false),
        bankEquity: planet.bank.equity,
        bankDeposits: planet.bank.deposits,
        totalLoans,
        agentsInDistress,
        totalAgentDeposits,
        workerUtilization: totalSlots > 0 ? usedWorkers / totalSlots : 0,
        avgWage: wageCount > 0 ? wageSum / wageCount : 0,
        productionEfficiency: productionFacilityCount > 0 ? productionEfficiencySum / productionFacilityCount : 0,
        avgFacilityCondition: facilityCount > 0 ? facilityConditionSum / facilityCount : 1,
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
    'deathsLastMonth',
    'deathsThisMonth',
    'foodPrice',
    'waterPrice',
    'priceLevelRaw',
    'priceLevelRefined',
    'priceLevelManufactured',
    'priceLevelServices',
    'refinedToRawPriceRatio',
    'manufacturedToRawPriceRatio',
    'groceryFillRate',
    'gdpAnnual',
    'costOfLiving',
    'bankEquity',
    'bankDeposits',
    'totalLoans',
    'agentsInDistress',
    'totalAgentDeposits',
    'workerUtilization',
    'avgWage',
    'productionEfficiency',
    'avgFacilityCondition',
    'priceCeilHits',
    'priceFloorHits',
];

