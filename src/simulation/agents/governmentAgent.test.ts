import { describe, expect, it } from 'vitest';

import { RECYCLER_BASE_RECOVERY_EFFICIENCY, WEALTH_TAX_ALLOWANCE, WEALTH_TAX_MONTHLY_RATE } from '../constants';
import { calculateCostsForConstruction } from '../planet/facility';
import { constructionServiceResourceType } from '../planet/services';
import {
    makeAgent,
    makeGameState,
    makeGovernmentAgent,
    makePlanet,
    makePopulationByEducation,
    makeProductionFacility,
} from '../utils/testHelper';
import {
    collectWealthTax,
    computeCompanyNetWorth,
    computeWealthTax,
    governmentTick,
    wealthTaxAllowance,
} from './governmentAgent';

const PLANET_ID = 'p';

function setupWorld(companyDeposits = 0): {
    gameState: ReturnType<typeof makeGameState>;
    planet: ReturnType<typeof makePlanet>;
    gov: ReturnType<typeof makeGovernmentAgent>;
    company: ReturnType<typeof makeAgent>;
} {
    const gov = makeGovernmentAgent('gov-1', PLANET_ID);
    const company = makeAgent('co-1', PLANET_ID);
    company.assets[PLANET_ID]!.deposits = companyDeposits;
    const planet = makePlanet({ governmentId: gov.id });
    const gameState = makeGameState([planet], [gov, company, planet.recycler]);
    return { gameState, planet, gov, company };
}

function completedFacilityValue(csPrice: number): number {
    const completedCS = calculateCostsForConstruction('raw', 0, 1).cost * RECYCLER_BASE_RECOVERY_EFFICIENCY;
    return completedCS * csPrice;
}

describe('wealthTaxAllowance', () => {
    it('returns the base allowance at the initial construction price', () => {
        const { planet } = setupWorld();
        expect(wealthTaxAllowance(planet)).toBe(WEALTH_TAX_ALLOWANCE);
    });

    it('scales with construction service inflation and never shrinks below the base', () => {
        const { planet } = setupWorld();
        planet.marketPrices[constructionServiceResourceType.name] = 21;
        expect(wealthTaxAllowance(planet)).toBe(2 * WEALTH_TAX_ALLOWANCE);

        planet.marketPrices[constructionServiceResourceType.name] = 0.5;
        expect(wealthTaxAllowance(planet)).toBe(WEALTH_TAX_ALLOWANCE);
    });
});

describe('computeWealthTax', () => {
    it('does not tax net worth at or below the allowance', () => {
        const { gameState, planet, company } = setupWorld(1_000_000);
        expect(computeWealthTax(company, planet, gameState.shipCapitalMarket)).toBe(0);
    });

    it('taxes WEALTH_TAX_MONTHLY_RATE on the net worth above the allowance', () => {
        const { gameState, planet, company } = setupWorld(2_000_000_000);
        const tax = computeWealthTax(company, planet, gameState.shipCapitalMarket);
        expect(tax).toBeCloseTo((2_000_000_000 - WEALTH_TAX_ALLOWANCE) * WEALTH_TAX_MONTHLY_RATE);
        expect(tax).toBeCloseTo(416_666.67, 1);
    });

    it('never taxes the government, the recycler, or role agents', () => {
        const { gameState, planet, gov } = setupWorld();
        gov.assets[PLANET_ID]!.deposits = 2_000_000_000;
        planet.recycler.assets[PLANET_ID]!.deposits = 2_000_000_000;
        const trader = makeAgent('trader-1', PLANET_ID, 'Trader', { agentRole: 'arbitrage_trader' });
        trader.assets[PLANET_ID]!.deposits = 2_000_000_000;

        expect(computeWealthTax(gov, planet, gameState.shipCapitalMarket)).toBe(0);
        expect(computeWealthTax(planet.recycler, planet, gameState.shipCapitalMarket)).toBe(0);
        expect(computeWealthTax(trader, planet, gameState.shipCapitalMarket)).toBe(0);
    });

    it('values facilities with the capped construction price', () => {
        const { gameState, planet, company } = setupWorld(0);
        company.assets[PLANET_ID]!.productionFacilities = [
            makeProductionFacility(undefined, { maxScale: 1, scale: 1, construction: null }),
        ];
        planet.marketPrices[constructionServiceResourceType.name] = 100;
        planet.lastProductionCostFloors[constructionServiceResourceType.name] = 10;

        const netWorth = computeCompanyNetWorth(company, planet, gameState.shipCapitalMarket);
        expect(netWorth).toBeCloseTo(completedFacilityValue(20));
        expect(netWorth).not.toBeCloseTo(completedFacilityValue(100));
    });
});

describe('collectWealthTax', () => {
    it('transfers the tax from company deposits without creating money', () => {
        const { gameState, planet, gov, company } = setupWorld(2_000_000_000);
        const companyBefore = company.assets[PLANET_ID]!.deposits;
        const govBefore = gov.assets[PLANET_ID]!.deposits;

        const total = collectWealthTax(gameState, planet);

        const expectedTax = (2_000_000_000 - WEALTH_TAX_ALLOWANCE) * WEALTH_TAX_MONTHLY_RATE;
        expect(total).toBeCloseTo(expectedTax);
        expect(company.assets[PLANET_ID]!.deposits).toBeCloseTo(companyBefore - total);
        expect(gov.assets[PLANET_ID]!.deposits).toBeCloseTo(govBefore + total);
        expect(company.assets[PLANET_ID]!.deposits + gov.assets[PLANET_ID]!.deposits).toBeCloseTo(
            companyBefore + govBefore,
        );
    });

    it('caps the payment at available deposits for illiquid companies', () => {
        const { gameState, planet, company } = setupWorld(0);
        company.assets[PLANET_ID]!.productionFacilities = [
            makeProductionFacility(undefined, { maxScale: 6000, scale: 6000, construction: null }),
        ];
        planet.marketPrices[constructionServiceResourceType.name] = 21;
        planet.lastProductionCostFloors[constructionServiceResourceType.name] = 10;

        const tax = computeWealthTax(company, planet, gameState.shipCapitalMarket);
        expect(tax).toBeGreaterThan(0);
        expect(collectWealthTax(gameState, planet)).toBe(0);
        expect(company.assets[PLANET_ID]!.deposits).toBe(0);
    });
});

describe('governmentTick', () => {
    it('collects the tax into the budget and redistributes it per capita to households', () => {
        const gov = makeGovernmentAgent('gov-1', PLANET_ID);
        const company = makeAgent('co-1', PLANET_ID);
        company.assets[PLANET_ID]!.deposits = 2_000_000_000;
        const planet = makePlanet({
            governmentId: gov.id,
            population: makePopulationByEducation({ none: 1000 }),
        });
        const gameState = makeGameState([planet], [gov, company, planet.recycler]);
        const householdBefore = planet.bank.householdDeposits;

        governmentTick(gameState, planet, gov);

        const expectedTax = (2_000_000_000 - WEALTH_TAX_ALLOWANCE) * WEALTH_TAX_MONTHLY_RATE;
        expect(planet.bank.householdDeposits).toBeCloseTo(householdBefore + expectedTax);
        expect(gov.assets[PLANET_ID]!.deposits).toBe(0);
        expect(company.assets[PLANET_ID]!.deposits).toBeCloseTo(2_000_000_000 - expectedTax);
    });
});
