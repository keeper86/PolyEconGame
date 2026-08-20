import { MONTHS_PER_YEAR, WEALTH_TAX_ALLOWANCE, WEALTH_TAX_ANNUAL_RATE } from '../constants';
import { computeFacilitiesValue, computeShipsValue, constructionValuationPrice } from '../financial/assetValuation';
import { totalOutstandingLoans } from '../financial/loanTypes';
import { initialMarketPrices } from '../initialUniverse/initialMarketPrices';
import { educationLevelKeys } from '../population/education';
import type { PopulationCategory } from '../population/population';
import { MAX_AGE } from '../population/population';
import type { Agent, GameState, Planet } from '../planet/planet';
import { constructionServiceResourceType } from '../planet/services';
import type { ShipCapitalMarket } from '../ships/ships';

let wealthTaxDisabled = false;
let wealthTaxAnnualRateOverride: number | null = null;

export function setWealthTaxDisabled(disabled: boolean): void {
    wealthTaxDisabled = disabled;
}

export function setWealthTaxAnnualRate(annualRate: number): void {
    wealthTaxAnnualRateOverride = annualRate;
}

export const wealthTaxAllowance = (planet: Planet): number => {
    const csMarketPrice = planet.marketPrices[constructionServiceResourceType.name] ?? 0;
    const initialCsPrice = initialMarketPrices[constructionServiceResourceType.name] ?? 1;
    const inflationFactor = csMarketPrice > 0 ? Math.max(1, csMarketPrice / initialCsPrice) : 1;
    return WEALTH_TAX_ALLOWANCE * inflationFactor;
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
    if (wealthTaxDisabled) {
        return 0;
    }
    if (agent.id === planet.governmentId || agent.id === planet.recycler.id || agent.agentRole !== undefined) {
        return 0;
    }
    const netWorth = computeCompanyNetWorth(agent, planet, shipCapitalMarket);
    const annualRate = wealthTaxAnnualRateOverride ?? WEALTH_TAX_ANNUAL_RATE;
    return Math.max(0, netWorth - wealthTaxAllowance(planet)) * (annualRate / MONTHS_PER_YEAR);
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
        total += paid;
    }
    govAssets.deposits += total;
    return total;
};

export const governmentTick = (gameState: GameState, planet: Planet, agent: Agent) => {
    if (agent.id !== planet.governmentId) {
        throw new Error(`Tick called on non-government agent ${agent.id} of planet ${planet.id}`);
    }

    const assets = agent.assets[planet.id];
    if (!assets) {
        return;
    }
    collectWealthTax(gameState, planet);
    if (assets.deposits <= 0) {
        return;
    }

    const cells: PopulationCategory[] = [];
    for (let age = 0; age <= MAX_AGE; age++) {
        const ageCohort = planet.population.demography[age];
        if (!ageCohort) {
            continue;
        }
        const unableToWork = ageCohort.unableToWork;
        for (const edu of educationLevelKeys) {
            const cat = unableToWork[edu];
            if (cat.total > 0) {
                cells.push(cat);
            }
            const eduCat = ageCohort.education[edu];
            if (eduCat.total > 0) {
                cells.push(eduCat);
            }
            const unemployedCat = ageCohort.unoccupied[edu];
            if (unemployedCat.total > 0) {
                cells.push(unemployedCat);
            }
        }
    }

    if (cells.length === 0) {
        return;
    }

    cells.sort((a, b) => a.wealth.mean - b.wealth.mean);

    let remainingBudget = assets.deposits;
    let cumulativePop = 0;
    let T = cells[cells.length - 1].wealth.mean;

    for (let i = 0; i < cells.length; i++) {
        cumulativePop += cells[i].total;
        const currentLevel = cells[i].wealth.mean;
        const nextLevel = i + 1 < cells.length ? cells[i + 1].wealth.mean : Infinity;

        if (nextLevel === Infinity) {
            T = currentLevel + remainingBudget / cumulativePop;
            break;
        }

        const stepHeight = nextLevel - currentLevel;
        const cost = stepHeight * cumulativePop;

        if (remainingBudget <= cost) {
            T = currentLevel + remainingBudget / cumulativePop;
            break;
        }

        remainingBudget -= cost;
    }

    let totalDistributed = 0;
    for (const cat of cells) {
        if (cat.wealth.mean < T) {
            const delta = (T - cat.wealth.mean) * cat.total;
            totalDistributed += delta;
            cat.wealth = { mean: T, variance: cat.wealth.variance };
        }
    }

    planet.bank.householdDeposits += totalDistributed;
    assets.deposits -= totalDistributed;
};
