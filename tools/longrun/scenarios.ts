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
];

export function getScenario(name: string): Scenario | undefined {
    return SCENARIOS.find((s) => s.name === name);
}
