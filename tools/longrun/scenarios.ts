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
];

export function getScenario(name: string): Scenario | undefined {
    return SCENARIOS.find((s) => s.name === name);
}
