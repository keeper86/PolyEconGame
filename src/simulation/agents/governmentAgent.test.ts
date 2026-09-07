import { afterEach, describe, expect, it } from 'vitest';

import {
    GOVERNMENT_OPERATING_BUFFER,
    GOVERNMENT_SUPPORT_LOAN_TICKS,
    POPULATION_WEALTH_TAX_ALLOWANCE_MONTHS,
    POPULATION_WEALTH_TAX_MONTHLY_RATE,
    RECYCLER_BASE_RECOVERY_EFFICIENCY,
    TICKS_PER_MONTH,
    WEALTH_TAX_ALLOWANCE,
    WEALTH_TAX_MONTHLY_RATE,
} from '../constants';
import { calculateCostsForConstruction } from '../planet/facility';
import { constructionServiceResourceType } from '../planet/services';
import { computeFacilitiesValue, constructionValuationPrice } from '../financial/assetValuation';
import type { Planet } from '../planet/planet';
import { makeLoan, totalOutstandingLoans } from '../financial/loanTypes';
import { checkMonetaryConservation } from '../invariants';
import {
    makeAgent,
    makeAgentPlanetAssets,
    makeGameState,
    makeGovernmentAgent,
    makePlanet,
    makePopulationByEducation,
    makeProductionFacility,
} from '../utils/testHelper';
import {
    collectPopulationWealthTax,
    collectWealthTax,
    computeCompanyNetWorth,
    computeWealthTax,
    governmentSupportTick,
    governmentTick,
    setPopulationWealthTaxEnabled,
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
    // No facility capital by default: storage shells are player-built and not auto-granted.
    company.assets[PLANET_ID]!.storage.department = null;
    const planet = makePlanet({ governmentId: gov.id });
    const gameState = makeGameState([planet], [gov, company, planet.recycler]);
    return { gameState, planet, gov, company };
}

function completedFacilityValue(csPrice: number): number {
    const completedCS = calculateCostsForConstruction('raw', 0, 1).cost * RECYCLER_BASE_RECOVERY_EFFICIENCY;
    return completedCS * csPrice;
}

// A company's three storage shells are physical capital and count in its facility valuation. This
// isolates their constant contribution at the planet's current construction-service valuation price.
function storageShellCapital(planet: Planet): number {
    const assets = makeAgentPlanetAssets(PLANET_ID);
    assets.storage.department = null;
    return computeFacilitiesValue(assets, constructionValuationPrice(planet));
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
        const expectedTax =
            Math.max(0, 2_000_000_000 + storageShellCapital(planet) - wealthTaxAllowance(planet)) *
            WEALTH_TAX_MONTHLY_RATE;
        expect(tax).toBeCloseTo(expectedTax);
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
        expect(netWorth).toBeCloseTo(completedFacilityValue(20) + storageShellCapital(planet));
        expect(netWorth).not.toBeCloseTo(completedFacilityValue(100) + storageShellCapital(planet));
    });
});

describe('collectWealthTax', () => {
    it('transfers the tax from company deposits without creating money', () => {
        const { gameState, planet, gov, company } = setupWorld(2_000_000_000);
        const companyBefore = company.assets[PLANET_ID]!.deposits;
        const govBefore = gov.assets[PLANET_ID]!.deposits;

        const total = collectWealthTax(gameState, planet);

        const expectedTax =
            Math.max(0, 2_000_000_000 + storageShellCapital(planet) - wealthTaxAllowance(planet)) *
            WEALTH_TAX_MONTHLY_RATE;
        expect(total).toBeCloseTo(expectedTax);
        expect(company.assets[PLANET_ID]!.monthAcc.wealthTaxPaid).toBeCloseTo(expectedTax);
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
        company.assets[PLANET_ID]!.storage.department = null;
        const planet = makePlanet({
            governmentId: gov.id,
            population: makePopulationByEducation({ none: 1000 }),
        });
        const gameState = makeGameState([planet], [gov, company, planet.recycler]);
        const householdBefore = planet.bank.householdDeposits;

        governmentTick(gameState, planet, gov);

        const expectedTax =
            Math.max(0, 2_000_000_000 + storageShellCapital(planet) - wealthTaxAllowance(planet)) *
            WEALTH_TAX_MONTHLY_RATE;
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

    it('credits the unemployed and funds it with a 3-month support loan when cash runs short', () => {
        const gov = makeGovernmentAgent('gov-1', PLANET_ID);
        const planet = makeUnemployedPlanet(gov);
        const gameState = makeGameState([planet], [gov, planet.recycler]);
        const householdBefore = planet.bank.householdDeposits;
        const depositsBefore = planet.bank.deposits;
        const loansBefore = planet.bank.loans;
        const cat = planet.population.demography[70].unoccupied.none;
        const wealthBefore = cat.total * cat.wealth.mean;

        const spent = governmentSupportTick(gameState, planet);

        const perTickSupport = 1000 * 0.5 * (planet.wagePerEdu.none ?? 1);
        expect(spent).toBeCloseTo(perTickSupport);
        expect(spent).toBeGreaterThan(0);

        const govLoans = gov.assets[PLANET_ID]!.activeLoans;
        expect(govLoans).toHaveLength(1);
        expect(govLoans[0]!.type).toBe('governmentSupport');
        expect(govLoans[0]!.annualInterestRate).toBe(0);
        expect(totalOutstandingLoans(govLoans)).toBeCloseTo(GOVERNMENT_SUPPORT_LOAN_TICKS * perTickSupport);

        expect(gov.assets[PLANET_ID]!.deposits).toBeCloseTo(GOVERNMENT_SUPPORT_LOAN_TICKS * perTickSupport - spent);
        expect(planet.bank.loans).toBeCloseTo(loansBefore + GOVERNMENT_SUPPORT_LOAN_TICKS * perTickSupport);
        expect(planet.bank.deposits).toBeCloseTo(depositsBefore + GOVERNMENT_SUPPORT_LOAN_TICKS * perTickSupport);
        expect(planet.bank.householdDeposits).toBeCloseTo(householdBefore + spent);
        expect(cat.total * cat.wealth.mean).toBeCloseTo(wealthBefore + spent);
        expect(planet.governmentSupportVolume).toBeCloseTo(spent);
    });

    it('pays support from the budget without borrowing when funds are sufficient', () => {
        const gov = makeGovernmentAgent('gov-1', PLANET_ID);
        const planet = makeUnemployedPlanet(gov);
        gov.assets[PLANET_ID]!.deposits = 100_000_000_000;
        const gameState = makeGameState([planet], [gov, planet.recycler]);
        const loansBefore = planet.bank.loans;

        const spent = governmentSupportTick(gameState, planet);

        expect(spent).toBeGreaterThan(0);
        expect(gov.assets[PLANET_ID]!.activeLoans).toHaveLength(0);
        expect(planet.bank.loans).toBe(loansBefore);
        expect(gov.assets[PLANET_ID]!.deposits).toBeCloseTo(100_000_000_000 - spent);
    });

    it('repays support loans from the operating surplus above the buffer', () => {
        const gov = makeGovernmentAgent('gov-1', PLANET_ID);
        const planet = makeUnemployedPlanet(gov);
        gov.assets[PLANET_ID]!.deposits = GOVERNMENT_OPERATING_BUFFER + 20_000_000;
        gov.assets[PLANET_ID]!.activeLoans.push(makeLoan('governmentSupport', 50_000_000, 0, 1, 3600, true));
        planet.bank.loans = 50_000_000;
        planet.bank.deposits = GOVERNMENT_OPERATING_BUFFER + 20_000_000;
        const gameState = makeGameState([planet], [gov, planet.recycler]);

        governmentTick(gameState, planet, gov);

        expect(totalOutstandingLoans(gov.assets[PLANET_ID]!.activeLoans)).toBe(30_000_000);
        expect(planet.bank.loans).toBe(30_000_000);
        expect(planet.bank.deposits).toBe(GOVERNMENT_OPERATING_BUFFER);
        expect(gov.assets[PLANET_ID]!.deposits).toBe(GOVERNMENT_OPERATING_BUFFER);
    });

    it('keeps the loans decomposition invariant across support and repayment', () => {
        const gov = makeGovernmentAgent('gov-1', PLANET_ID);
        const planet = makeUnemployedPlanet(gov);
        const gameState = makeGameState([planet], [gov, planet.recycler]);

        governmentSupportTick(gameState, planet);

        expect(totalOutstandingLoans(gov.assets[PLANET_ID]!.activeLoans)).toBeGreaterThan(0);
        const issues = checkMonetaryConservation(gameState.agents, new Map([[planet.id, planet]]));
        expect(issues).toEqual([]);
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

describe('collectPopulationWealthTax', () => {
    function makeTaxWorld(
        richMean: number,
        richCount: number,
    ): {
        gameState: ReturnType<typeof makeGameState>;
        planet: ReturnType<typeof makePlanet>;
        gov: ReturnType<typeof makeGovernmentAgent>;
    } {
        const gov = makeGovernmentAgent('gov-1', PLANET_ID);
        const planet = makePlanet({ governmentId: gov.id });
        const rich = planet.population.demography[70].unoccupied.none;
        rich.total = richCount;
        rich.wealth = { mean: richMean, variance: 0 };
        const poor = planet.population.demography[40].unoccupied.none;
        poor.total = 10_000;
        poor.wealth = { mean: 5, variance: 0 };
        const householdDeposits = richCount * richMean + 10_000 * 5;
        planet.bank.householdDeposits = householdDeposits;
        planet.bank.deposits = householdDeposits;
        planet.bank.writeOffs = householdDeposits;
        const gameState = makeGameState([planet], [gov, planet.recycler]);
        return { gameState, planet, gov };
    }

    afterEach(() => {
        setPopulationWealthTaxEnabled(false);
    });

    it('does nothing when disabled', () => {
        setPopulationWealthTaxEnabled(false);
        const { gameState, planet, gov } = makeTaxWorld(10_000, 100);
        const rich = planet.population.demography[70].unoccupied.none;
        const meanBefore = rich.wealth.mean;

        const total = collectPopulationWealthTax(gameState, planet);

        expect(total).toBe(0);
        expect(rich.wealth.mean).toBe(meanBefore);
        expect(gov.assets[PLANET_ID]!.deposits).toBe(0);
    });

    it('taxes rich cohorts above the income-based allowance and credits the government', () => {
        setPopulationWealthTaxEnabled(true);
        const { gameState, planet, gov } = makeTaxWorld(10_000, 100);
        const rich = planet.population.demography[70].unoccupied.none;
        const allowance = (planet.wagePerEdu.none ?? 1) * TICKS_PER_MONTH * POPULATION_WEALTH_TAX_ALLOWANCE_MONTHS;
        const perCapitaTax = (10_000 - allowance) * POPULATION_WEALTH_TAX_MONTHLY_RATE;
        const householdBefore = planet.bank.householdDeposits;
        const govDepBefore = gov.assets[PLANET_ID]!.deposits;

        const total = collectPopulationWealthTax(gameState, planet);

        expect(total).toBeCloseTo(perCapitaTax * 100);
        expect(rich.wealth.mean).toBeCloseTo(10_000 - perCapitaTax);
        expect(gov.assets[PLANET_ID]!.deposits).toBeCloseTo(govDepBefore + total);
        expect(planet.bank.householdDeposits).toBeCloseTo(householdBefore - total);
        expect(planet.bank.householdDeposits).toBeCloseTo(100 * rich.wealth.mean + 10_000 * 5);
        const issues = checkMonetaryConservation(gameState.agents, new Map([[planet.id, planet]]));
        expect(issues).toEqual([]);
    });

    it('taxes nothing when all cohorts are at or below the allowance', () => {
        setPopulationWealthTaxEnabled(true);
        const { gameState, planet, gov } = makeTaxWorld(10, 100);
        const total = collectPopulationWealthTax(gameState, planet);
        expect(total).toBe(0);
        expect(gov.assets[PLANET_ID]!.deposits).toBe(0);
    });
});
