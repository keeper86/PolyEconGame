import { describe, expect, it } from 'vitest';

import {
    GOVERNMENT_OPERATING_BUFFER,
    RECYCLER_BASE_RECOVERY_EFFICIENCY,
    TICKS_PER_MONTH,
    WEALTH_TAX_ALLOWANCE,
    WEALTH_TAX_MONTHLY_RATE,
} from '../constants';
import { calculateCostsForConstruction } from '../planet/facility';
import { constructionServiceResourceType } from '../planet/services';
import { totalOutstandingLoans } from '../financial/loanTypes';
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
    governmentSupportTick,
    governmentTick,
    setWealthTaxAllowance,
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

    it('respects an override allowance, still scaling with construction inflation', () => {
        setWealthTaxAllowance(100_000_000);
        try {
            const { planet } = setupWorld();
            expect(wealthTaxAllowance(planet)).toBe(100_000_000);

            planet.marketPrices[constructionServiceResourceType.name] = 21;
            expect(wealthTaxAllowance(planet)).toBe(200_000_000);
        } finally {
            setWealthTaxAllowance(WEALTH_TAX_ALLOWANCE);
        }
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
        expect(tax).toBeCloseTo(2 * 416_666.67, 1);
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
    it('collects the tax into the budget without redistributing', () => {
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
        expect(gov.assets[PLANET_ID]!.deposits).toBeCloseTo(expectedTax);
        expect(planet.bank.householdDeposits).toBe(householdBefore);
        expect(company.assets[PLANET_ID]!.deposits).toBeCloseTo(2_000_000_000 - expectedTax);
    });
});

describe('governmentSupportTick', () => {
    function makeUnemployedPlanet(gov: ReturnType<typeof makeGovernmentAgent>): ReturnType<typeof makePlanet> {
        const planet = makePlanet({ governmentId: gov.id });
        const cat = planet.population.demography[70].unoccupied.none;
        cat.total = 1000;
        cat.wealth = { mean: 0, variance: 0 };
        return planet;
    }

    it('credits the unemployed with the insurance and funds it via the credit line', () => {
        const gov = makeGovernmentAgent('gov-1', PLANET_ID);
        const planet = makeUnemployedPlanet(gov);
        const gameState = makeGameState([planet], [gov, planet.recycler]);
        const householdBefore = planet.bank.householdDeposits;
        const depositsBefore = planet.bank.deposits;
        const loansBefore = planet.bank.loans;
        const cat = planet.population.demography[70].unoccupied.none;
        const wealthBefore = cat.total * cat.wealth.mean;
        const govDepositsBefore = gov.assets[PLANET_ID]!.deposits;

        const spent = governmentSupportTick(gameState, planet);

        expect(spent).toBeGreaterThan(0);
        expect(spent).toBeCloseTo((1000 * 0.85 * (planet.wagePerEdu.none ?? 1)) / TICKS_PER_MONTH);
        expect(gov.assets[PLANET_ID]!.deposits).toBe(govDepositsBefore);
        expect(planet.bank.governmentDebt).toBeCloseTo(spent);
        expect(planet.bank.loans).toBeCloseTo(loansBefore + spent);
        expect(planet.bank.deposits).toBeCloseTo(depositsBefore + spent);
        expect(planet.bank.householdDeposits).toBeCloseTo(householdBefore + spent);
        expect(cat.total * cat.wealth.mean).toBeCloseTo(wealthBefore + spent);
        expect(planet.governmentSupportVolume).toBeCloseTo(spent);
    });

    it('keeps the government operating cash untouched', () => {
        const gov = makeGovernmentAgent('gov-1', PLANET_ID);
        const planet = makeUnemployedPlanet(gov);
        gov.assets[PLANET_ID]!.deposits = 100_000_000_000;
        const gameState = makeGameState([planet], [gov, planet.recycler]);

        const spent = governmentSupportTick(gameState, planet);

        expect(spent).toBeGreaterThan(0);
        expect(gov.assets[PLANET_ID]!.deposits).toBe(100_000_000_000);
        expect(planet.bank.governmentDebt).toBeCloseTo(spent);
    });

    it('repays the debt from the operating surplus above the buffer', () => {
        const gov = makeGovernmentAgent('gov-1', PLANET_ID);
        const planet = makeUnemployedPlanet(gov);
        gov.assets[PLANET_ID]!.deposits = GOVERNMENT_OPERATING_BUFFER + 20_000_000;
        planet.bank.governmentDebt = 50_000_000;
        planet.bank.loans = 50_000_000;
        const gameState = makeGameState([planet], [gov, planet.recycler]);

        governmentTick(gameState, planet, gov);

        expect(planet.bank.governmentDebt).toBeLessThan(50_000_000);
        expect(planet.bank.governmentDebt).toBeGreaterThan(0);
        expect(gov.assets[PLANET_ID]!.deposits).toBe(GOVERNMENT_OPERATING_BUFFER);
    });

    it('keeps the loans decomposition invariant across support and repayment', () => {
        const gov = makeGovernmentAgent('gov-1', PLANET_ID);
        const planet = makeUnemployedPlanet(gov);
        gov.assets[PLANET_ID]!.deposits = GOVERNMENT_OPERATING_BUFFER + 100_000;
        const gameState = makeGameState([planet], [gov, planet.recycler]);

        const spent = governmentSupportTick(gameState, planet);

        expect(spent).toBeGreaterThan(0);
        expect(planet.bank.governmentDebt).toBeCloseTo(spent);
        expect(planet.bank.loans).toBeCloseTo(planet.bank.governmentDebt);

        governmentTick(gameState, planet, gov);

        const expectedLoans = totalOutstandingLoans(gov.assets[PLANET_ID]!.activeLoans) + planet.bank.governmentDebt;
        expect(planet.bank.governmentDebt).toBeLessThan(spent);
        expect(expectedLoans).toBeCloseTo(planet.bank.loans);
    });

    it('does nothing when nobody is unemployed', () => {
        const gov = makeGovernmentAgent('gov-1', PLANET_ID);
        const planet = makePlanet({ governmentId: gov.id });
        gov.assets[PLANET_ID]!.deposits = 10_000_000;
        const gameState = makeGameState([planet], [gov, planet.recycler]);

        const spent = governmentSupportTick(gameState, planet);

        expect(spent).toBe(0);
        expect(gov.assets[PLANET_ID]!.deposits).toBe(10_000_000);
    });
});
