import type { BenchmarkWorldConfig } from './world';

export interface MetricBand {
    metric: string;
    horizonYears: number;
    windowYears: number;
    min?: number;
    max?: number;
    relativeToStart?: boolean;
}

export interface Scenario {
    name: string;
    description: string;
    seed: number;
    years: number;
    world: BenchmarkWorldConfig;
    bands: MetricBand[];
}

export const SCENARIOS: Scenario[] = [
    {
        name: 'baseline',
        description: 'Balanced economy — control run that must stay stable over the full horizon.',
        seed: 1001,
        years: 30,
        world: {},
        bands: [
            { metric: 'totalPopulation', horizonYears: 30, windowYears: 3, relativeToStart: true, min: 0.8, max: 1.2 },
            { metric: 'avgGroceryStarvation', horizonYears: 30, windowYears: 3, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 30, windowYears: 3, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 30, windowYears: 3, min: 0.5 },
            { metric: 'constructionServicePrice', horizonYears: 10, windowYears: 3, relativeToStart: true, max: 3 },
        ],
    },
    {
        name: 'bankruptcyHaircut',
        description:
            'Bankruptcy restructure writes off only 50% of outstanding debt; the remaining 50% rolls over on the refounded company at a 5% loan rate. Tests whether halving the per-bankruptcy equity loss while raising interest income keeps the banking system stable over 30 years.',
        seed: 1001,
        years: 30,
        world: { bankruptcyWriteOffFraction: 0.5, loanRatePerYear: 0.05 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 30, windowYears: 3, relativeToStart: true, min: 0.8, max: 1.2 },
            { metric: 'avgGroceryStarvation', horizonYears: 30, windowYears: 3, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 30, windowYears: 3, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 30, windowYears: 3, min: 0.5 },
        ],
    },
    {
        name: 'interest10',
        description:
            'Bankruptcy restructure writes off 100% of debt, but new and rollover loans carry a 10% annual rate. Tests how far interest income can be pushed to reduce the bank equity drain.',
        seed: 1001,
        years: 30,
        world: { loanRatePerYear: 0.1 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 30, windowYears: 3, relativeToStart: true, min: 0.8, max: 1.2 },
            { metric: 'avgGroceryStarvation', horizonYears: 30, windowYears: 3, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 30, windowYears: 3, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 30, windowYears: 3, min: 0.5 },
        ],
    },
    {
        name: 'policyRateController',
        description:
            'The policy rate is steered by the flow-balance controller, targeting smoothed (interest collected - debt written off) per loan at zero. Tests whether the bank equity drain and money-supply growth become stationary.',
        seed: 1001,
        years: 30,
        world: { policyRateController: true },
        bands: [
            { metric: 'totalPopulation', horizonYears: 30, windowYears: 3, relativeToStart: true, min: 0.8, max: 1.2 },
            { metric: 'avgGroceryStarvation', horizonYears: 30, windowYears: 3, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 30, windowYears: 3, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 30, windowYears: 3, min: 0.5 },
            { metric: 'policyRate', horizonYears: 30, windowYears: 3, min: 0.0025, max: 0.05 },
        ],
    },

    {
        name: 'interest5-wo66',
        description:
            '5% loan rate with a 66% bankruptcy debt write-off; the remaining 33% of debt rolls over on the refounded company. Tests whether a two-thirds haircut at the new baseline rate keeps the banking system stable with less equity drain.',
        seed: 1001,
        years: 30,
        world: { loanRatePerYear: 0.05, bankruptcyWriteOffFraction: 0.66 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 30, windowYears: 3, relativeToStart: true, min: 0.8, max: 1.2 },
            { metric: 'avgGroceryStarvation', horizonYears: 30, windowYears: 3, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 30, windowYears: 3, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 30, windowYears: 3, min: 0.5 },
        ],
    },
    {
        name: 'interest7.5-wo75',
        description:
            '7.5% loan rate with a 75% bankruptcy debt write-off; the remaining 25% of debt rolls over on the refounded company. Tests a middle path between the 5% baseline and the 10% stress case.',
        seed: 1001,
        years: 30,
        world: { loanRatePerYear: 0.075, bankruptcyWriteOffFraction: 0.75 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 30, windowYears: 3, relativeToStart: true, min: 0.8, max: 1.2 },
            { metric: 'avgGroceryStarvation', horizonYears: 30, windowYears: 3, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 30, windowYears: 3, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 30, windowYears: 3, min: 0.5 },
        ],
    },
    {
        name: 'interest5-wo95',
        description:
            '5% loan rate with a 95% bankruptcy debt write-off; only 5% of debt rolls over on the refounded company. Tests the low-retention end of the write-off spectrum after 66% was found to be unstable.',
        seed: 1001,
        years: 30,
        world: { loanRatePerYear: 0.05, bankruptcyWriteOffFraction: 0.95 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 30, windowYears: 3, relativeToStart: true, min: 0.8, max: 1.2 },
            { metric: 'avgGroceryStarvation', horizonYears: 30, windowYears: 3, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 30, windowYears: 3, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 30, windowYears: 3, min: 0.5 },
        ],
    },
    {
        name: 'interest5-wo90',
        description:
            '5% loan rate with a 90% bankruptcy debt write-off; only 10% of debt rolls over on the refounded company. Tests the low-retention end of the write-off spectrum after 66% was found to be unstable.',
        seed: 1001,
        years: 30,
        world: { loanRatePerYear: 0.05, bankruptcyWriteOffFraction: 0.9 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 30, windowYears: 3, relativeToStart: true, min: 0.8, max: 1.2 },
            { metric: 'avgGroceryStarvation', horizonYears: 30, windowYears: 3, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 30, windowYears: 3, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 30, windowYears: 3, min: 0.5 },
        ],
    },
    {
        name: 'waterCapped',
        description: 'Water source is capped and cannot be extended; population must shrink to carrying capacity.',
        seed: 1002,
        years: 30,
        world: { waterPoolQuantity: 20_000 },
        bands: [
            { metric: 'waterPrice', horizonYears: 5, windowYears: 2, relativeToStart: true, min: 2 },
            { metric: 'totalPopulation', horizonYears: 20, windowYears: 3, relativeToStart: true, max: 0.85 },
            { metric: 'avgGroceryStarvation', horizonYears: 20, windowYears: 3, min: 0.05 },
        ],
    },
    {
        name: 'lowEmployable',
        description: 'Only 40% of the working-age population is employable; labor is the binding constraint.',
        seed: 1003,
        years: 30,
        world: { employableFraction: 0.4 },
        bands: [
            { metric: 'dependencyRatio', horizonYears: 5, windowYears: 2, min: 2 },
            { metric: 'avgWage', horizonYears: 5, windowYears: 2, min: 5 },
            { metric: 'workerUtilization', horizonYears: 5, windowYears: 2, max: 0.7 },
        ],
    },
    {
        name: 'rawRichManuPoor',
        description: 'Abundant raw+refined supply, scarce manufactured+services — bottleneck is manufacturing capacity.',
        seed: 1004,
        years: 30,
        world: { rawPoolFactor: 3, lowTierScaleFactor: 1.5, highTierScaleFactor: 0.3 },
        bands: [
            { metric: 'manufacturedToRawPriceRatio', horizonYears: 5, windowYears: 2, relativeToStart: true, min: 1.3 },
            { metric: 'priceLevelServices', horizonYears: 5, windowYears: 2, relativeToStart: true, min: 1.2 },
        ],
    },
    {
        name: 'rawPoorManuRich',
        description: 'Scarce raw+refined supply, abundant manufactured+services — manufacturing idles on missing inputs.',
        seed: 1005,
        years: 30,
        world: { rawPoolFactor: 0.3, lowTierScaleFactor: 0.3, highTierScaleFactor: 3 },
        bands: [
            { metric: 'manufacturedToRawPriceRatio', horizonYears: 5, windowYears: 2, relativeToStart: true, max: 0.7 },
            { metric: 'totalPopulation', horizonYears: 20, windowYears: 3, relativeToStart: true, max: 0.95 },
        ],
    },
    {
        name: 'isolationSolverSeed',
        description:
            'Isolation A: seed facilities at 2.25× LP-solver scale (maintenance/admin keep baseline) instead of FACILITY_SCALE_PER_BILLION, removing the 16–30M× construction-chain over-seeding.',
        seed: 1001,
        years: 20,
        world: { solverSeedSlack: 2.25 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 20, windowYears: 3, relativeToStart: true, min: 0.8, max: 1.2 },
            { metric: 'avgGroceryStarvation', horizonYears: 20, windowYears: 3, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 20, windowYears: 3, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 20, windowYears: 3, min: 0.5 },
        ],
    },
    {
        name: 'maintenanceRich',
        description:
            'Isolation B1: 3× maintenance capacity. Distinguishes raw steady-state capacity + catch-up-repair surge (H1/H4) from clearing/buffer dynamics (H2) and price runaway (H3).',
        seed: 1001,
        years: 10,
        world: { maintenanceScaleFactor: 3 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 10, windowYears: 3, relativeToStart: true, min: 0.8, max: 1.2 },
            { metric: 'avgFacilityCondition', horizonYears: 10, windowYears: 3, min: 0.9 },
            { metric: 'groceryFillRate', horizonYears: 10, windowYears: 3, min: 0.6 },
            { metric: 'maintenanceServicePrice', horizonYears: 10, windowYears: 3, relativeToStart: true, max: 3 },
        ],
    },
    {
        name: 'maintenanceBufferDeep',
        description:
            'Isolation B2: 30-tick maintenance buffer (vs 3). Distinguishes stock/flow buffer oscillation (H2) from capacity and price dynamics.',
        seed: 1001,
        years: 10,
        world: { maintenanceBufferTicks: 30 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 10, windowYears: 3, relativeToStart: true, min: 0.8, max: 1.2 },
            { metric: 'avgFacilityCondition', horizonYears: 10, windowYears: 3, min: 0.9 },
            { metric: 'groceryFillRate', horizonYears: 10, windowYears: 3, min: 0.6 },
            { metric: 'maintenanceServicePrice', horizonYears: 10, windowYears: 3, relativeToStart: true, max: 3 },
        ],
    },
    {
        name: 'maintenanceRichBufferDeep',
        description:
            'Isolation B3: 3× capacity AND 30-tick buffer. Tests whether the collapse needs both fixes together.',
        seed: 1001,
        years: 10,
        world: { maintenanceScaleFactor: 3, maintenanceBufferTicks: 30 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 10, windowYears: 3, relativeToStart: true, min: 0.8, max: 1.2 },
            { metric: 'avgFacilityCondition', horizonYears: 10, windowYears: 3, min: 0.9 },
            { metric: 'groceryFillRate', horizonYears: 10, windowYears: 3, min: 0.6 },
            { metric: 'maintenanceServicePrice', horizonYears: 10, windowYears: 3, relativeToStart: true, max: 3 },
        ],
    },
    {
        name: 'singleAgent',
        description:
            'Isolation F: 1 agent per product (monopoly). Removes intra-product competition and split-scale rounding; ~3x fewer agents, faster ticks.',
        seed: 1001,
        years: 10,
        world: { agentsPerProduct: 1 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 10, windowYears: 3, relativeToStart: true, min: 0.8, max: 1.2 },
            { metric: 'groceryFillRate', horizonYears: 10, windowYears: 3, min: 0.6 },
        ],
    },
    {
        name: 'wealthTax',
        description:
            'Company wealth tax (0.5%/yr on net worth above the inflation-indexed 1B allowance), collected monthly. The budget is transferred daily to dependents as needs-based support (government as first supporter, inter-population transfers cover the rest). 1 agent per product, 50-year stability and growth.',
        seed: 1001,
        years: 50,
        world: { agentsPerProduct: 1 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 50, windowYears: 3, relativeToStart: true, min: 0.8, max: 2 },
            { metric: 'avgGroceryStarvation', horizonYears: 50, windowYears: 3, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 50, windowYears: 3, min: 0.6 },
            { metric: 'medianWealth', horizonYears: 50, windowYears: 5, relativeToStart: true, min: 1.0 },
        ],
    },
    {
        name: 'longrun-baseline',
        description:
            '600-year control run with as-is parameters. Reference for the long-run cost-spring and bankruptcy variants.',
        seed: 1001,
        years: 600,
        world: {},
        bands: [
            { metric: 'totalPopulation', horizonYears: 100, windowYears: 10, relativeToStart: true, min: 0.8, max: 2 },
            { metric: 'totalPopulation', horizonYears: 600, windowYears: 30, relativeToStart: true, min: 0.5, max: 8 },
            { metric: 'avgGroceryStarvation', horizonYears: 600, windowYears: 30, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 600, windowYears: 30, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 600, windowYears: 30, min: 0.5 },
            { metric: 'bankEquity', horizonYears: 600, windowYears: 30, min: 0 },
        ],
    },
    {
        name: 'longrun-wo50',
        description:
            '600-year run with BANKRUPTCY_DEBT_WRITE_OFF_FRACTION = 0.5 (half the debt rolls over on the refounded company at the default 5% rate).',
        seed: 1001,
        years: 600,
        world: { bankruptcyWriteOffFraction: 0.5 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 100, windowYears: 10, relativeToStart: true, min: 0.8, max: 2 },
            { metric: 'totalPopulation', horizonYears: 600, windowYears: 30, relativeToStart: true, min: 0.5, max: 8 },
            { metric: 'avgGroceryStarvation', horizonYears: 600, windowYears: 30, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 600, windowYears: 30, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 600, windowYears: 30, min: 0.5 },
            { metric: 'bankEquity', horizonYears: 600, windowYears: 30, min: 0 },
        ],
    },
    {
        name: 'longrun-spring040',
        description:
            '600-year run with agent personality costSpringStrength = 0.4 (ceiling/floor spring pulls price back to cost harder).',
        seed: 1001,
        years: 600,
        world: { costSpringStrength: 0.4 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 100, windowYears: 10, relativeToStart: true, min: 0.8, max: 2 },
            { metric: 'totalPopulation', horizonYears: 600, windowYears: 30, relativeToStart: true, min: 0.5, max: 8 },
            { metric: 'avgGroceryStarvation', horizonYears: 600, windowYears: 30, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 600, windowYears: 30, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 600, windowYears: 30, min: 0.5 },
            { metric: 'bankEquity', horizonYears: 600, windowYears: 30, min: 0 },
        ],
    },
    {
        name: 'interest2',
        description:
            '30-year run at a 2% loan interest rate (baseline is 5%). Proxy for a central bank that keeps rates low to slow the compounding of the loan book.',
        seed: 1001,
        years: 30,
        world: { loanRatePerYear: 0.02 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 30, windowYears: 3, relativeToStart: true, min: 0.8, max: 1.2 },
            { metric: 'avgGroceryStarvation', horizonYears: 30, windowYears: 3, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 30, windowYears: 3, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 30, windowYears: 3, min: 0.5 },
        ],
    },
    {
        name: 'wealthTaxPop',
        description:
            '30-year run with a wealth tax on rich population cohorts: per-capita wealth above 120 months of the education-level wage is taxed at 2%/yr; revenue goes to the government budget (support spending).',
        seed: 1001,
        years: 30,
        world: { populationWealthTax: true },
        bands: [
            { metric: 'totalPopulation', horizonYears: 30, windowYears: 3, relativeToStart: true, min: 0.8, max: 1.2 },
            { metric: 'avgGroceryStarvation', horizonYears: 30, windowYears: 3, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 30, windowYears: 3, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 30, windowYears: 3, min: 0.5 },
        ],
    },
    {
        name: 'interest2-wealthTaxPop',
        description:
            '30-year run combining 2% loan interest and the population wealth tax. Tests whether low rates + wealth redistribution together slow loan compounding.',
        seed: 1001,
        years: 30,
        world: { loanRatePerYear: 0.02, populationWealthTax: true },
        bands: [
            { metric: 'totalPopulation', horizonYears: 30, windowYears: 3, relativeToStart: true, min: 0.8, max: 1.2 },
            { metric: 'avgGroceryStarvation', horizonYears: 30, windowYears: 3, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 30, windowYears: 3, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 30, windowYears: 3, min: 0.5 },
        ],
    },
    {
        name: 'refineryFirmAsk',
        description:
            '30-year run where refinery agents sell with a soft-min ask of 3x cost (automatedCostFloorBuffer), price cuts capped at 1% (priceAdjustMaxDown 0.99) and a sell-through target of 0.5. Tests whether pricing the joint-output refinery above cost keeps it alive and changes the economy. High dose: collapses at ~y16 from cost-push inflation.',
        seed: 1001,
        years: 30,
        world: { refineryMinAskMultiplier: 3, refineryPriceAdjustMaxDown: 0.99, refineryTargetSellThrough: 0.5 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 30, windowYears: 3, relativeToStart: true, min: 0.8, max: 1.2 },
            { metric: 'avgGroceryStarvation', horizonYears: 30, windowYears: 3, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 30, windowYears: 3, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 30, windowYears: 3, min: 0.5 },
        ],
    },
    {
        name: 'refineryBreakEven',
        description:
            '30-year run where refinery agents sell with a soft-min ask of 1.3x cost (just above break-even), price cuts capped at 2% (priceAdjustMaxDown 0.98) and a sell-through target of 0.65. The moderate dose of the refineryFirmAsk experiment: cover cost without a 3x markup inflation spiral.',
        seed: 1001,
        years: 30,
        world: { refineryMinAskMultiplier: 1.3, refineryPriceAdjustMaxDown: 0.98, refineryTargetSellThrough: 0.65 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 30, windowYears: 3, relativeToStart: true, min: 0.8, max: 1.2 },
            { metric: 'avgGroceryStarvation', horizonYears: 30, windowYears: 3, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 30, windowYears: 3, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 30, windowYears: 3, min: 0.5 },
        ],
    },
    {
        name: 'longrun-interest1',
        description:
            '600-year baseline-economy run at a 1% loan interest rate. Tests whether the loan-book compounding (and the y499 collapse) scales with the interest rate.',
        seed: 1001,
        years: 600,
        world: { loanRatePerYear: 0.01 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 100, windowYears: 10, relativeToStart: true, min: 0.8, max: 2 },
            { metric: 'totalPopulation', horizonYears: 600, windowYears: 30, relativeToStart: true, min: 0.5, max: 8 },
            { metric: 'avgGroceryStarvation', horizonYears: 600, windowYears: 30, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 600, windowYears: 30, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 600, windowYears: 30, min: 0.5 },
        ],
    },
    {
        name: 'longrun-interest2',
        description:
            '600-year baseline-economy run at a 2% loan interest rate. Tests whether the loan-book compounding (and the y499 collapse) scales with the interest rate.',
        seed: 1001,
        years: 600,
        world: { loanRatePerYear: 0.02 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 100, windowYears: 10, relativeToStart: true, min: 0.8, max: 2 },
            { metric: 'totalPopulation', horizonYears: 600, windowYears: 30, relativeToStart: true, min: 0.5, max: 8 },
            { metric: 'avgGroceryStarvation', horizonYears: 600, windowYears: 30, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 600, windowYears: 30, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 600, windowYears: 30, min: 0.5 },
        ],
    },
    {
        name: 'longrun-interest3',
        description:
            '600-year baseline-economy run at a 3% loan interest rate. Tests whether the loan-book compounding (and the y499 collapse) scales with the interest rate.',
        seed: 1001,
        years: 600,
        world: { loanRatePerYear: 0.03 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 100, windowYears: 10, relativeToStart: true, min: 0.8, max: 2 },
            { metric: 'totalPopulation', horizonYears: 600, windowYears: 30, relativeToStart: true, min: 0.5, max: 8 },
            { metric: 'avgGroceryStarvation', horizonYears: 600, windowYears: 30, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 600, windowYears: 30, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 600, windowYears: 30, min: 0.5 },
        ],
    },
    {
        name: 'longrun-interest4',
        description:
            '600-year baseline-economy run at a 4% loan interest rate. Tests whether the loan-book compounding (and the y499 collapse) scales with the interest rate.',
        seed: 1001,
        years: 600,
        world: { loanRatePerYear: 0.04 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 100, windowYears: 10, relativeToStart: true, min: 0.8, max: 2 },
            { metric: 'totalPopulation', horizonYears: 600, windowYears: 30, relativeToStart: true, min: 0.5, max: 8 },
            { metric: 'avgGroceryStarvation', horizonYears: 600, windowYears: 30, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 600, windowYears: 30, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 600, windowYears: 30, min: 0.5 },
        ],
    },
    {
        name: 'longrun-interest1-ref',
        description:
            '600-year run at 1% loan interest PLUS the break-even refinery pricing (soft-min ask 1.3x, price cuts capped at 2%, sell-through 0.65). Tests whether keeping the refinery profitable prevents the collapse.',
        seed: 1001,
        years: 600,
        world: { loanRatePerYear: 0.01, refineryMinAskMultiplier: 1.3, refineryPriceAdjustMaxDown: 0.98, refineryTargetSellThrough: 0.65 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 100, windowYears: 10, relativeToStart: true, min: 0.8, max: 2 },
            { metric: 'totalPopulation', horizonYears: 600, windowYears: 30, relativeToStart: true, min: 0.5, max: 8 },
            { metric: 'avgGroceryStarvation', horizonYears: 600, windowYears: 30, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 600, windowYears: 30, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 600, windowYears: 30, min: 0.5 },
        ],
    },
    {
        name: 'longrun-interest2-ref',
        description:
            '600-year run at 2% loan interest PLUS the break-even refinery pricing (soft-min ask 1.3x, price cuts capped at 2%, sell-through 0.65). Tests whether keeping the refinery profitable prevents the collapse.',
        seed: 1001,
        years: 600,
        world: { loanRatePerYear: 0.02, refineryMinAskMultiplier: 1.3, refineryPriceAdjustMaxDown: 0.98, refineryTargetSellThrough: 0.65 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 100, windowYears: 10, relativeToStart: true, min: 0.8, max: 2 },
            { metric: 'totalPopulation', horizonYears: 600, windowYears: 30, relativeToStart: true, min: 0.5, max: 8 },
            { metric: 'avgGroceryStarvation', horizonYears: 600, windowYears: 30, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 600, windowYears: 30, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 600, windowYears: 30, min: 0.5 },
        ],
    },
    {
        name: 'longrun-interest3-ref',
        description:
            '600-year run at 3% loan interest PLUS the break-even refinery pricing (soft-min ask 1.3x, price cuts capped at 2%, sell-through 0.65). Tests whether keeping the refinery profitable prevents the collapse.',
        seed: 1001,
        years: 600,
        world: { loanRatePerYear: 0.03, refineryMinAskMultiplier: 1.3, refineryPriceAdjustMaxDown: 0.98, refineryTargetSellThrough: 0.65 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 100, windowYears: 10, relativeToStart: true, min: 0.8, max: 2 },
            { metric: 'totalPopulation', horizonYears: 600, windowYears: 30, relativeToStart: true, min: 0.5, max: 8 },
            { metric: 'avgGroceryStarvation', horizonYears: 600, windowYears: 30, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 600, windowYears: 30, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 600, windowYears: 30, min: 0.5 },
        ],
    },
    {
        name: 'longrun-interest4-ref',
        description:
            '600-year run at 4% loan interest PLUS the break-even refinery pricing (soft-min ask 1.3x, price cuts capped at 2%, sell-through 0.65). Tests whether keeping the refinery profitable prevents the collapse.',
        seed: 1001,
        years: 600,
        world: { loanRatePerYear: 0.04, refineryMinAskMultiplier: 1.3, refineryPriceAdjustMaxDown: 0.98, refineryTargetSellThrough: 0.65 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 100, windowYears: 10, relativeToStart: true, min: 0.8, max: 2 },
            { metric: 'totalPopulation', horizonYears: 600, windowYears: 30, relativeToStart: true, min: 0.5, max: 8 },
            { metric: 'avgGroceryStarvation', horizonYears: 600, windowYears: 30, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 600, windowYears: 30, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 600, windowYears: 30, min: 0.5 },
        ],
    },
    {
        name: 'longrun-interest1-ratio',
        description:
            '600-year run at 1% loan interest with the break-even refinery pricing AND the consumption-matched refinery output ratio (fuel 90 / plastic 62 / chemical 48). Tests whether matching the by-product ratio to the economy demand stabilizes the collapse.',
        seed: 1001,
        years: 600,
        world: { loanRatePerYear: 0.01, refineryMinAskMultiplier: 1.3, refineryPriceAdjustMaxDown: 0.98, refineryTargetSellThrough: 0.65 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 100, windowYears: 10, relativeToStart: true, min: 0.8, max: 2 },
            { metric: 'totalPopulation', horizonYears: 600, windowYears: 30, relativeToStart: true, min: 0.5, max: 8 },
            { metric: 'avgGroceryStarvation', horizonYears: 600, windowYears: 30, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 600, windowYears: 30, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 600, windowYears: 30, min: 0.5 },
        ],
    },
    {
        name: 'longrun-oil2x',
        description:
            '600-year baseline run with DOUBLE the oil reservoir (2e9 vs 1e9). Tests whether the collapse is purely oil-resource depletion: with twice the oil, the collapse should move well past y600.',
        seed: 1001,
        years: 600,
        world: { oilReservoirMultiplier: 2 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 100, windowYears: 10, relativeToStart: true, min: 0.8, max: 2 },
            { metric: 'totalPopulation', horizonYears: 600, windowYears: 30, relativeToStart: true, min: 0.5, max: 8 },
            { metric: 'avgGroceryStarvation', horizonYears: 600, windowYears: 30, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 600, windowYears: 30, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 600, windowYears: 30, min: 0.5 },
        ],
    },
    {
        name: 'longrun-interest4-ratio',
        description:
            '600-year run at 4% loan interest with the break-even refinery pricing AND the consumption-matched refinery output ratio (fuel 90 / plastic 62 / chemical 48). Tests whether matching the by-product ratio to the economy demand stabilizes the collapse.',
        seed: 1001,
        years: 600,
        world: { loanRatePerYear: 0.04, refineryMinAskMultiplier: 1.3, refineryPriceAdjustMaxDown: 0.98, refineryTargetSellThrough: 0.65 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 100, windowYears: 10, relativeToStart: true, min: 0.8, max: 2 },
            { metric: 'totalPopulation', horizonYears: 600, windowYears: 30, relativeToStart: true, min: 0.5, max: 8 },
            { metric: 'avgGroceryStarvation', horizonYears: 600, windowYears: 30, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 600, windowYears: 30, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 600, windowYears: 30, min: 0.5 },
        ],
    },
    {
        name: 'longrun-resources10',
        description:
            '6000-year baseline run with ALL resource pools scaled x10 (renewable and non-renewable). Tests whether the collapse is purely finite-resource exhaustion: with 10x iron/oil/coal/etc the depletion clock should move from ~y500 to ~y5000 if that is the only constraint.',
        seed: 1001,
        years: 6000,
        world: { resourceMultiplier: 10 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 1000, windowYears: 30, relativeToStart: true, min: 0.8, max: 200 },
            { metric: 'totalPopulation', horizonYears: 6000, windowYears: 30, relativeToStart: true, min: 0.5, max: 5000 },
            { metric: 'avgGroceryStarvation', horizonYears: 6000, windowYears: 30, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 6000, windowYears: 30, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 6000, windowYears: 30, min: 0.5 },
        ],
    },
    {
        name: 'storage-controller',
        description:
            'Baseline economy with the storage-based expansion/contraction controller. Production is driven by a PID on the storage error against a 3-month own-production target; capacity expands at a constant rate while the storage is below target and contracts gently while above target. Direct test of the chainModel.ts finding that the pure-feedback inventory controller survives 600y at every growth rate without relying on any aggregate demand data.',
        seed: 1001,
        years: 30,
        world: { resourceMultiplier: 100 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 30, windowYears: 3, relativeToStart: true, min: 0.8, max: 1.2 },
            { metric: 'avgGroceryStarvation', horizonYears: 30, windowYears: 3, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 30, windowYears: 3, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 30, windowYears: 3, min: 0.5 },
            { metric: 'constructionServicePrice', horizonYears: 10, windowYears: 3, relativeToStart: true, max: 3 },
        ],
    },
    {
        name: 'competitive-6agent',
        description:
            "Robustness of the tuned default (random) personalities under real competition. 6 agents per product, RANDOM personalities (generateAgentPersonality - the 'more competitive' sell-pressure variant), storage-based controller, high resource multiplier, oil x500 to push the finite-resource clock off the horizon, seed 1001 for reproducibility. Tests whether diversity of aggressive/competitive random sellers is long-run stable vs a 1-agent-per-product fixed world. Target: hold stable long-term.",
        seed: 1001,
        years: 10000,
        world: { agentsPerProduct: 6, resourceMultiplier: 100 },
        bands: [
            { metric: 'totalPopulation', horizonYears: 500, windowYears: 25, relativeToStart: true, min: 0.5, max: 8 },
            { metric: 'avgGroceryStarvation', horizonYears: 500, windowYears: 25, max: 0.25 },
            { metric: 'groceryFillRate', horizonYears: 500, windowYears: 25, min: 0.6 },
            { metric: 'avgFacilityCondition', horizonYears: 500, windowYears: 25, min: 0.5 },
        ],
    },
];

export function getScenario(name: string): Scenario | undefined {
    return SCENARIOS.find((s) => s.name === name);
}
