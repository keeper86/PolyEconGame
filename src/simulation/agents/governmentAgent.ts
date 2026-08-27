import {
    GOVERNMENT_OPERATING_BUFFER,
    GOVERNMENT_SUPPORT_LOAN_TICKS,
    MIN_WAGE,
    TICKS_PER_MONTH,
    UNEMPLOYMENT_INSURANCE_RATE_EDUCATION,
    UNEMPLOYMENT_INSURANCE_RATE_UNABLE,
    UNEMPLOYMENT_INSURANCE_RATE_UNOCCUPIED,
    WEALTH_TAX_ALLOWANCE,
    WEALTH_TAX_MONTHLY_RATE,
} from '../constants';
import { computeFacilitiesValue, computeShipsValue, constructionValuationPrice } from '../financial/assetValuation';
import { grantLoan, repayLoansOldestFirst, totalOutstandingLoans } from '../financial/loanTypes';
import { distributeWealthChangeTracked } from '../financial/wealthOps';
import { initialMarketPrices } from '../initialUniverse/initialMarketPrices';
import { forEachPopulationCohort, type Occupation } from '../population/population';
import type { Agent, GameState, Planet } from '../planet/planet';
import { constructionServiceResourceType } from '../planet/services';
import type { ShipCapitalMarket } from '../ships/ships';

const INSURANCE_RATES: Partial<Record<Occupation, number>> = {
    education: UNEMPLOYMENT_INSURANCE_RATE_EDUCATION,
    unoccupied: UNEMPLOYMENT_INSURANCE_RATE_UNOCCUPIED,
    unableToWork: UNEMPLOYMENT_INSURANCE_RATE_UNABLE,
};

let wealthTaxAllowanceOverride: number | undefined = undefined;
let governmentOperatingBufferOverride: number | undefined = undefined;

export function setWealthTaxAllowance(allowance: number): void {
    wealthTaxAllowanceOverride = allowance;
}

export function setGovernmentOperatingBuffer(buffer: number): void {
    governmentOperatingBufferOverride = buffer;
}

export const governmentOperatingBuffer = (): number => governmentOperatingBufferOverride ?? GOVERNMENT_OPERATING_BUFFER;

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

export const governmentTick = (gameState: GameState, planet: Planet, agent: Agent) => {
    if (agent.id !== planet.governmentId) {
        throw new Error(`Tick called on non-government agent ${agent.id} of planet ${planet.id}`);
    }
    collectWealthTax(gameState, planet);
    const assets = agent.assets[planet.id];
    if (!assets) {
        return;
    }
    const loanTotal = totalOutstandingLoans(assets.activeLoans);
    if (loanTotal > 0 && assets.deposits > governmentOperatingBuffer()) {
        const repayment = Math.min(loanTotal, assets.deposits - governmentOperatingBuffer());
        const actualRepaid = repayLoansOldestFirst(assets.activeLoans, repayment);
        assets.deposits -= actualRepaid;
        planet.bank.loans -= actualRepaid;
        planet.bank.deposits -= actualRepaid;
    }
};

export const governmentSupportTick = (gameState: GameState, planet: Planet): number => {
    const assets = gameState.agents.get(planet.governmentId)?.assets[planet.id];
    if (!assets) {
        return 0;
    }
    const base = Math.max(planet.wagePerEdu.none ?? 0, MIN_WAGE);
    if (base <= 0) {
        return 0;
    }
    let total = 0;
    for (let age = 0; age < planet.population.demography.length; age++) {
        forEachPopulationCohort(planet.population.demography[age], (category, occ, edu) => {
            if (category.total <= 0) {
                return;
            }
            const rate = INSURANCE_RATES[occ];
            if (!rate) {
                return;
            }
            const monthlyInsurance = rate * base;
            if (category.wealth.mean >= monthlyInsurance) {
                return;
            }
            total += distributeWealthChangeTracked(
                planet.population.demography,
                age,
                occ,
                edu,
                monthlyInsurance / TICKS_PER_MONTH,
            );
        });
    }
    if (total <= 0) {
        return 0;
    }

    if (assets.deposits < total) {
        const shortfall = GOVERNMENT_SUPPORT_LOAN_TICKS * total - assets.deposits;
        const loan = grantLoan(assets, planet.bank, shortfall, 'governmentSupport', gameState.tick);
        loan.annualInterestRate = 0;
    }
    assets.deposits -= total;
    planet.bank.householdDeposits += total;
    planet.governmentSupportVolume += total;
    return total;
};
