import {
    GOVERNMENT_OPERATING_BUFFER,
    MIN_WAGE,
    POPULATION_WEALTH_TAX_ALLOWANCE_MONTHS,
    POPULATION_WEALTH_TAX_MONTHLY_RATE,
    TICKS_PER_MONTH,
    UNEMPLOYMENT_INSURANCE_RATE_EDUCATION,
    UNEMPLOYMENT_INSURANCE_RATE_UNABLE,
    UNEMPLOYMENT_INSURANCE_RATE_UNOCCUPIED,
    WEALTH_TAX_ALLOWANCE,
    WEALTH_TAX_MONTHLY_RATE,
} from '../constants';
import { computeFacilitiesValue, computeShipsValue, constructionValuationPrice } from '../financial/assetValuation';
import { repayLoansOldestFirst, totalOutstandingLoans } from '../financial/loanTypes';
import { distributeWealthChangeTracked } from '../financial/wealthOps';
import { initialMarketPrices } from '../initialUniverse/initialMarketPrices';
import { forEachPopulationCohort, type EducationLevelType, type Occupation } from '../population/population';
import type { Agent, GameState, Planet } from '../planet/planet';
import { constructionServiceResourceType, groceryServiceResourceType } from '../planet/services';
import type { ShipCapitalMarket } from '../ships/ships';

const INSURANCE_RATES: Partial<Record<Occupation, number>> = {
    education: UNEMPLOYMENT_INSURANCE_RATE_EDUCATION,
    unoccupied: UNEMPLOYMENT_INSURANCE_RATE_UNOCCUPIED,
    unableToWork: UNEMPLOYMENT_INSURANCE_RATE_UNABLE,
};

export const INSURANCE_WEALTH_CAP_DAYS = 2;
let wealthTaxAllowanceOverride: number | undefined = undefined;

let supportEmployedOverride: boolean | undefined = undefined;
let supportWealthCapDaysOverride: number | undefined = undefined;
let supportFoodAffordabilityOverride: number | undefined = undefined;
let governmentSupportEnabled = true;

export function setGovernmentSupportEnabled(enabled: boolean): void {
    governmentSupportEnabled = enabled;
}

export function setSupportEmployed(enabled: boolean): void {
    supportEmployedOverride = enabled;
}

export function setSupportWealthCapDays(days: number): void {
    supportWealthCapDaysOverride = days;
}

export function setSupportFoodAffordabilityMultiplier(multiplier: number): void {
    supportFoodAffordabilityOverride = multiplier;
}

export function setWealthTaxAllowance(allowance: number): void {
    wealthTaxAllowanceOverride = allowance;
}

export const wealthTaxAllowance = (planet: Planet): number => {
    const base = wealthTaxAllowanceOverride ?? WEALTH_TAX_ALLOWANCE;
    const csMarketPrice = planet.marketPrices[constructionServiceResourceType.name] ?? 0;
    const initialCsPrice = initialMarketPrices[constructionServiceResourceType.name] ?? 1;
    const inflationFactor = csMarketPrice > 0 ? Math.max(1, csMarketPrice / initialCsPrice) : 1;
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
                (planet.wagePerEdu[edu] ?? MIN_WAGE) * TICKS_PER_MONTH * POPULATION_WEALTH_TAX_ALLOWANCE_MONTHS;
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
    const base = Math.max(planet.wagePerEdu.none ?? 0, MIN_WAGE);
    if (base <= 0) {
        return 0;
    }
    const supportEmployed = supportEmployedOverride ?? false;
    const wealthCapDays = supportWealthCapDaysOverride ?? INSURANCE_WEALTH_CAP_DAYS;
    const affordabilityMultiplier = supportFoodAffordabilityOverride ?? 0;
    const foodPrice = planet.marketPrices[groceryServiceResourceType.name] ?? 0;

    const claims: Array<{ age: number; occ: Occupation; edu: EducationLevelType; payment: number }> = [];
    let claimed = 0;
    for (let age = 0; age < planet.population.demography.length; age++) {
        forEachPopulationCohort(planet.population.demography[age], (category, occ, edu) => {
            if (category.total <= 0) {
                return;
            }
            const rate = INSURANCE_RATES[occ];
            const employed = occ === 'employed';
            const effectiveRate = rate ?? (supportEmployed && employed ? UNEMPLOYMENT_INSURANCE_RATE_UNOCCUPIED : 0);
            if (effectiveRate <= 0 && affordabilityMultiplier <= 0) {
                return;
            }
            const insuranceDaily = effectiveRate * base;
            const affordabilityDaily = affordabilityMultiplier * foodPrice;
            const dailyInsurance = Math.max(insuranceDaily, affordabilityDaily);
            if (dailyInsurance <= 0) {
                return;
            }
            const wealthCap = wealthCapDays * dailyInsurance;
            const payment = Math.min(dailyInsurance, wealthCap - category.wealth.mean);
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
