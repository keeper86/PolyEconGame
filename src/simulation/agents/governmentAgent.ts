import {
    GOVERNMENT_OPERATING_BUFFER,
    POPULATION_WEALTH_TAX_ALLOWANCE_MONTHS,
    POPULATION_WEALTH_TAX_MONTHLY_RATE,
    PRICE_LEVEL_REFERENCE,
    TICKS_PER_MONTH,
    WAGE_START,
    WEALTH_TAX_ALLOWANCE,
    WEALTH_TAX_MONTHLY_RATE,
} from '../constants';
import { computeFacilitiesValue, computeShipsValue, constructionValuationPrice } from '../financial/assetValuation';
import { repayLoansOldestFirst, totalOutstandingLoans } from '../financial/loanTypes';
import { distributeWealthChangeTracked } from '../financial/wealthOps';
import { generalPriceLevel } from '../market/priceLevel';
import { SERVICE_DEFINITIONS, referenceMonthlyIncome, serviceDemandFactor } from '../market/serviceDefinitions';
import { forEachPopulationCohort, type EducationLevelType, type Occupation } from '../population/population';
import type { Agent, GameState, Planet } from '../planet/planet';
import { groceryServiceResourceType } from '../planet/services';
import type { ShipCapitalMarket } from '../ships/ships';

export const SUPPORT_STARVATION_TRIGGER = 0.1;
export const SUPPORT_FOOD_DAYS_PER_TICK = 0.9;
export const SUPPORT_WEALTH_CAP_FOOD_DAYS = 1;

let wealthTaxAllowanceOverride: number | undefined = undefined;
let governmentSupportEnabled = true;

export function setGovernmentSupportEnabled(enabled: boolean): void {
    governmentSupportEnabled = enabled;
}

export function setWealthTaxAllowance(allowance: number): void {
    wealthTaxAllowanceOverride = allowance;
}

export const wealthTaxAllowance = (planet: Planet): number => {
    const base = wealthTaxAllowanceOverride ?? WEALTH_TAX_ALLOWANCE;
    const inflationFactor = Math.max(1, generalPriceLevel(planet) / PRICE_LEVEL_REFERENCE);
    return base * inflationFactor;
};

export const computeCompanyNetWorth = (agent: Agent, planet: Planet, shipCapitalMarket: ShipCapitalMarket): number => {
    const assets = agent.assets[planet.id];
    if (!assets) {
        return 0;
    }
    const cashBalance = assets.deposits - totalOutstandingLoans(assets.activeLoans);
    const facilitiesValue = computeFacilitiesValue(assets, constructionValuationPrice(planet));
    return cashBalance + facilitiesValue + computeShipsValue(agent, shipCapitalMarket, planet.marketPrices);
};

export const computeWealthTax = (agent: Agent, planet: Planet, shipCapitalMarket: ShipCapitalMarket): number => {
    if (agent.id === planet.governmentId || agent.id === planet.recycler.id || agent.agentRole !== undefined) {
        return 0;
    }
    const netWorth = computeCompanyNetWorth(agent, planet, shipCapitalMarket);
    return Math.max(0, netWorth - wealthTaxAllowance(planet)) * WEALTH_TAX_MONTHLY_RATE;
};

export const collectWealthTax = (gameState: GameState, planet: Planet): number => {
    const govAssets = gameState.agents.get(planet.governmentId)?.assets[planet.id];
    if (!govAssets) {
        return 0;
    }
    let total = 0;
    for (const agent of gameState.agents.values()) {
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }
        const tax = computeWealthTax(agent, planet, gameState.shipCapitalMarket);
        if (tax <= 0) {
            continue;
        }
        const paid = Math.min(tax, Math.max(0, 0.1 * assets.deposits));
        if (paid <= 0) {
            continue;
        }
        assets.deposits -= paid;
        assets.monthAcc.wealthTaxPaid += paid;
        total += paid;
    }
    govAssets.deposits += total;
    return total;
};

let populationWealthTaxEnabled = true;

export function setPopulationWealthTaxEnabled(enabled: boolean): void {
    populationWealthTaxEnabled = enabled;
}

export const collectPopulationWealthTax = (gameState: GameState, planet: Planet): number => {
    if (!populationWealthTaxEnabled) {
        return 0;
    }
    const govAssets = gameState.agents.get(planet.governmentId)?.assets[planet.id];
    if (!govAssets) {
        return 0;
    }
    const demography = planet.population.demography;

    let total = 0;
    for (let age = 0; age < demography.length; age++) {
        forEachPopulationCohort(demography[age], (cat, occ, edu) => {
            if (cat.total <= 0) {
                return;
            }
            const allowance =
                (planet.wagePerEdu[edu] ?? WAGE_START) * TICKS_PER_MONTH * POPULATION_WEALTH_TAX_ALLOWANCE_MONTHS;
            if (cat.wealth.mean <= allowance) {
                return;
            }
            const perCapitaTax = (cat.wealth.mean - allowance) * POPULATION_WEALTH_TAX_MONTHLY_RATE;
            const oldMean = cat.wealth.mean;
            const newMean = Math.max(0, oldMean - perCapitaTax);
            const actualPerCapita = oldMean - newMean;
            if (actualPerCapita <= 0) {
                return;
            }
            cat.wealth = { mean: newMean, variance: cat.wealth.variance };
            total += actualPerCapita * cat.total;
        });
    }
    if (total <= 0) {
        return 0;
    }
    govAssets.deposits += total;
    planet.bank.householdDeposits -= total;
    return total;
};

export const governmentTick = (gameState: GameState, planet: Planet, agent: Agent) => {
    if (agent.id !== planet.governmentId) {
        throw new Error(`Tick called on non-government agent ${agent.id} of planet ${planet.id}`);
    }
    collectWealthTax(gameState, planet);
    collectPopulationWealthTax(gameState, planet);
    const assets = agent.assets[planet.id];
    if (!assets) {
        return;
    }
    const loanTotal = totalOutstandingLoans(assets.activeLoans);
    if (loanTotal > 0 && assets.deposits > GOVERNMENT_OPERATING_BUFFER) {
        const repayment = Math.min(loanTotal, assets.deposits - GOVERNMENT_OPERATING_BUFFER);
        const actualRepaid = repayLoansOldestFirst(assets.activeLoans, repayment);
        assets.deposits -= actualRepaid;
        planet.bank.loans -= actualRepaid;
        planet.bank.deposits -= actualRepaid;
    }
};

export const governmentSupportTick = (gameState: GameState, planet: Planet): number => {
    if (!governmentSupportEnabled) {
        return 0;
    }
    const assets = gameState.agents.get(planet.governmentId)?.assets[planet.id];
    if (!assets || assets.deposits <= 0) {
        return 0;
    }
    const foodPrice = planet.marketPrices[groceryServiceResourceType.name] ?? 0;
    if (foodPrice <= 0) {
        return 0;
    }
    const grocery = SERVICE_DEFINITIONS.grocery;
    const demandFactor = serviceDemandFactor(planet, grocery);
    const referenceIncome = referenceMonthlyIncome(planet);

    const claims: Array<{ age: number; occ: Occupation; edu: EducationLevelType; payment: number }> = [];
    let claimed = 0;
    for (let age = 0; age < planet.population.demography.length; age++) {
        forEachPopulationCohort(planet.population.demography[age], (category, occ, edu) => {
            if (category.total <= 0) {
                return;
            }
            if (category.services.grocery.starvationLevel < SUPPORT_STARVATION_TRIGGER) {
                return;
            }
            const dailyFoodCost =
                grocery.fillRatePerPersonPerTick(age, occ, category.wealth, referenceIncome) * demandFactor * foodPrice;
            if (dailyFoodCost <= 0) {
                return;
            }
            const wealthCap = SUPPORT_WEALTH_CAP_FOOD_DAYS * dailyFoodCost;
            const payment = Math.min(SUPPORT_FOOD_DAYS_PER_TICK * dailyFoodCost, wealthCap - category.wealth.mean);
            if (payment <= 0) {
                return;
            }
            claims.push({ age, occ, edu, payment });
            claimed += payment * category.total;
        });
    }
    if (claimed <= 0) {
        return 0;
    }

    const scale = Math.min(1, assets.deposits / claimed);
    let total = 0;
    for (const claim of claims) {
        total += distributeWealthChangeTracked(
            planet.population.demography,
            claim.age,
            claim.occ,
            claim.edu,
            claim.payment * scale,
        );
    }
    if (total <= 0) {
        return 0;
    }

    assets.deposits -= total;
    planet.bank.householdDeposits += total;
    planet.governmentSupportVolume += total;
    return total;
};
