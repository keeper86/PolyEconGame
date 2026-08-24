import { WEALTH_TAX_ALLOWANCE, WEALTH_TAX_MONTHLY_RATE } from '../constants';
import { computeFacilitiesValue, computeShipsValue, constructionValuationPrice } from '../financial/assetValuation';
import { totalOutstandingLoans } from '../financial/loanTypes';
import { initialMarketPrices } from '../initialUniverse/initialMarketPrices';
import { governmentSupport } from '../market/intergenerationalTransfers';
import type { Agent, GameState, Planet } from '../planet/planet';
import { constructionServiceResourceType } from '../planet/services';
import type { ShipCapitalMarket } from '../ships/ships';

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
};

export const governmentSupportTick = (gameState: GameState, planet: Planet): number => {
    const assets = gameState.agents.get(planet.governmentId)?.assets[planet.id];
    if (!assets || assets.deposits <= 0) {
        return 0;
    }
    const spent = governmentSupport(planet, assets.deposits);
    if (spent <= 0) {
        return 0;
    }
    assets.deposits -= spent;
    planet.bank.householdDeposits += spent;
    planet.governmentSupportVolume += spent;
    return spent;
};
