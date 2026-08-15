import { solveSupplyChain } from '../../src/app/supply-chain/_components/solver';
import { FACILITY_SCALE_PER_BILLION } from '../../src/simulation/initialUniverse/targets';
import { allServices } from '../../src/simulation/market/serviceDefinitions';
import type { GameState } from '../../src/simulation/planet/planet';
import { ALL_PRODUCTION_FACILITY_ENTRIES, type FacilityType } from '../../src/simulation/planet/productionFacilities';
import { computeTargetScales } from '../facility-growth-model/computeTargets';

const TOOL_PLANET = 'tool';
const TOOL_ID = 'preview';

const ALL_KEYS = Object.keys(ALL_PRODUCTION_FACILITY_ENTRIES) as FacilityType[];
const NAME_TO_KEY = new Map<string, FacilityType>(
    ALL_KEYS.map((key) => [ALL_PRODUCTION_FACILITY_ENTRIES[key].factory(TOOL_PLANET, TOOL_ID).name, key]),
);

export function facilityNameToKey(name: string): FacilityType | undefined {
    return NAME_TO_KEY.get(name);
}

export interface FacilityClassification {
    populationFacing: Set<FacilityType>;
    endogenous: Set<FacilityType>;
}

export function classifyFacilities(): FacilityClassification {
    const producers: Record<string, FacilityType[]> = {};
    for (const key of ALL_KEYS) {
        const f = ALL_PRODUCTION_FACILITY_ENTRIES[key].factory(TOOL_PLANET, TOOL_ID);
        if (f.name === 'Coal Power Plant') {
            continue;
        }
        for (const prod of f.produces) {
            if (prod.resource.level === 'source') {
                continue;
            }
            (producers[prod.resource.name] ??= []).push(key);
        }
    }

    const populationFacing = new Set<FacilityType>();
    const visitedResources = new Set<string>();
    const queue: string[] = allServices.map((service) => service.resource.name);
    while (queue.length > 0) {
        const resourceName = queue.shift()!;
        if (visitedResources.has(resourceName)) {
            continue;
        }
        visitedResources.add(resourceName);
        for (const key of producers[resourceName] ?? []) {
            populationFacing.add(key);
            const f = ALL_PRODUCTION_FACILITY_ENTRIES[key].factory(TOOL_PLANET, TOOL_ID);
            for (const need of f.needs) {
                if (need.resource.level === 'source') {
                    continue;
                }
                queue.push(need.resource.name);
            }
        }
    }

    const endogenous = new Set<FacilityType>();
    for (const key of ALL_KEYS) {
        if (key === 'coalPowerPlant') {
            continue;
        }
        if (!populationFacing.has(key)) {
            endogenous.add(key);
        }
    }
    return { populationFacing, endogenous };
}

export function computeSolverScales(population: number): Record<string, number> {
    const allowedFacilities = new Set<string>();
    for (const key of ALL_KEYS) {
        if (key === 'coalPowerPlant') {
            continue;
        }
        allowedFacilities.add(ALL_PRODUCTION_FACILITY_ENTRIES[key].factory(TOOL_PLANET, TOOL_ID).name);
    }

    const result = solveSupplyChain({ population, allowedFacilities, objective: 'scale' });
    if (result.status !== 'feasible') {
        return {};
    }

    const scales: Record<string, number> = {};
    for (const [name, scale] of Object.entries(result.scales)) {
        const key = facilityNameToKey(name);
        if (key) {
            scales[key] = scale;
        }
    }
    return scales;
}

export function computeSeededScales(population: number): Record<string, number> {
    const popB = population / 1_000_000_000;
    const scales: Record<string, number> = {};
    for (const [key, scalePerB] of Object.entries(FACILITY_SCALE_PER_BILLION)) {
        scales[key] = Math.max(1, Math.round(scalePerB * popB));
    }
    return scales;
}

export function sampleActualScales(gameState: GameState): Record<string, number> {
    const planet = gameState.planets.values().next().value;
    if (!planet) {
        return {};
    }
    const scales: Record<string, number> = {};
    for (const agent of gameState.agents.values()) {
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }
        for (const facility of assets.productionFacilities) {
            const key = facilityNameToKey(facility.name);
            if (!key) {
                continue;
            }
            scales[key] = (scales[key] ?? 0) + facility.scale;
        }
    }
    return scales;
}

export function sampleInFlightConstruction(gameState: GameState): number {
    const planet = gameState.planets.values().next().value;
    if (!planet) {
        return 0;
    }
    let total = 0;
    for (const agent of gameState.agents.values()) {
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }
        for (const facility of assets.productionFacilities) {
            total += facility.construction?.totalConstructionServiceRequired ?? 0;
        }
    }
    return total;
}

function sumScales(keys: Iterable<FacilityType>, scales: Record<string, number>): number {
    let sum = 0;
    for (const key of keys) {
        sum += scales[key] ?? 0;
    }
    return sum;
}

function ratio(numerator: number, denominator: number): number {
    if (denominator <= 0) {
        return numerator > 0 ? Number.POSITIVE_INFINITY : 0;
    }
    return numerator / denominator;
}

export interface ScaleComparison {
    population: number;
    solver: Record<string, number>;
    targets: Record<string, number>;
    seeded: Record<string, number>;
    actual: Record<string, number>;
    classification: FacilityClassification;
    constructionDemandPerTick: number;
    inFlightConstruction: number;
}

export function buildScaleComparison(population: number, actual: Record<string, number>): ScaleComparison {
    const targetResult = computeTargetScales(population);
    return {
        population,
        solver: computeSolverScales(population),
        targets: targetResult.scales,
        seeded: computeSeededScales(population),
        actual,
        classification: classifyFacilities(),
        constructionDemandPerTick: targetResult.constructionDemandPerTick,
        inFlightConstruction: 0,
    };
}

export interface GroupedGaps {
    populationFacing: GroupGap;
    endogenous: GroupGap;
}

interface GroupGap {
    solver: number;
    targets: number;
    seeded: number;
    actual: number;
    actualToSolver: number;
    actualToTargets: number;
    actualToSeeded: number;
    targetsToSolver: number;
}

export function computeGroupedGaps(comparison: ScaleComparison): GroupedGaps {
    const { solver, targets, seeded, actual, classification } = comparison;
    const popSolver = sumScales(classification.populationFacing, solver);
    const popTargets = sumScales(classification.populationFacing, targets);
    const popSeeded = sumScales(classification.populationFacing, seeded);
    const popActual = sumScales(classification.populationFacing, actual);

    const endoSolver = sumScales(classification.endogenous, solver);
    const endoTargets = sumScales(classification.endogenous, targets);
    const endoSeeded = sumScales(classification.endogenous, seeded);
    const endoActual = sumScales(classification.endogenous, actual);

    return {
        populationFacing: {
            solver: popSolver,
            targets: popTargets,
            seeded: popSeeded,
            actual: popActual,
            actualToSolver: ratio(popActual, popSolver),
            actualToTargets: ratio(popActual, popTargets),
            actualToSeeded: ratio(popActual, popSeeded),
            targetsToSolver: ratio(popTargets, popSolver),
        },
        endogenous: {
            solver: endoSolver,
            targets: endoTargets,
            seeded: endoSeeded,
            actual: endoActual,
            actualToSolver: ratio(endoActual, endoSolver),
            actualToTargets: ratio(endoActual, endoTargets),
            actualToSeeded: ratio(endoActual, endoSeeded),
            targetsToSolver: ratio(endoTargets, endoSolver),
        },
    };
}

export function computeGapMetrics(
    population: number,
    actual: Record<string, number>,
    inFlightConstruction: number,
): Record<string, number> {
    const comparison = buildScaleComparison(population, actual);
    const gaps = computeGroupedGaps(comparison);
    return {
        scalePopFacingSolver: gaps.populationFacing.solver,
        scalePopFacingTargets: gaps.populationFacing.targets,
        scalePopFacingSeeded: gaps.populationFacing.seeded,
        scalePopFacingActual: gaps.populationFacing.actual,
        scalePopFacingActualToSolver: gaps.populationFacing.actualToSolver,
        scalePopFacingActualToTargets: gaps.populationFacing.actualToTargets,
        scalePopFacingActualToSeeded: gaps.populationFacing.actualToSeeded,
        scalePopFacingTargetsToSolver: gaps.populationFacing.targetsToSolver,
        scaleEndogenousSolver: gaps.endogenous.solver,
        scaleEndogenousTargets: gaps.endogenous.targets,
        scaleEndogenousSeeded: gaps.endogenous.seeded,
        scaleEndogenousActual: gaps.endogenous.actual,
        scaleEndogenousActualToTargets: gaps.endogenous.actualToTargets,
        scaleEndogenousActualToSeeded: gaps.endogenous.actualToSeeded,
        inFlightConstruction,
    };
}

function fmt(value: number): string {
    if (!Number.isFinite(value)) {
        return '      ∞';
    }
    if (Math.abs(value) >= 1000) {
        return value.toFixed(0).padStart(8);
    }
    return value.toFixed(2).padStart(8);
}

function ratioText(numerator: number, denominator: number): string {
    return ratio(numerator, denominator).toFixed(2).padStart(8);
}

export function formatScaleComparison(comparison: ScaleComparison): string {
    const { solver, targets, seeded, actual, classification } = comparison;
    const gaps = computeGroupedGaps(comparison);

    const lines: string[] = [];
    lines.push(`Population: ${comparison.population.toLocaleString()}`);
    lines.push('');
    lines.push(
        'Grouped scale sums (solver = just-in-time, targets = computeTargets, seeded = FACILITY_SCALE_PER_BILLION × pop):',
    );
    lines.push('──────────────────────────────────────────────────────────────────────────────────────────────');
    lines.push(
        'Group              │      Solver │     Targets │      Seeded │      Actual │ act/solv │ act/tgt │ act/seed │ tgt/solv',
    );
    lines.push(
        '────────────────────┼─────────────┼─────────────┼─────────────┼─────────────┼──────────┼─────────┼──────────┼─────────',
    );

    const pop = gaps.populationFacing;
    const endo = gaps.endogenous;
    lines.push(
        `populationFacing    │ ${fmt(pop.solver)} │ ${fmt(pop.targets)} │ ${fmt(pop.seeded)} │ ${fmt(pop.actual)} │ ${ratioText(pop.actual, pop.solver)} │ ${ratioText(pop.actual, pop.targets)} │ ${ratioText(pop.actual, pop.seeded)} │ ${ratioText(pop.targets, pop.solver)}`,
    );
    lines.push(
        `endogenous (const.) │ ${fmt(endo.solver)} │ ${fmt(endo.targets)} │ ${fmt(endo.seeded)} │ ${fmt(endo.actual)} │ ${ratioText(endo.actual, endo.solver)} │ ${ratioText(endo.actual, endo.targets)} │ ${ratioText(endo.actual, endo.seeded)} │ ${ratioText(endo.targets, endo.solver)}`,
    );
    lines.push('');
    lines.push(
        `computeTargets assumed construction demand: ${comparison.constructionDemandPerTick.toLocaleString()} units/tick (fixed, not population-scaled)`,
    );
    lines.push(`In-flight construction backlog in sim: ${comparison.inFlightConstruction.toLocaleString()} units`);
    lines.push('');
    lines.push('Per-facility scales (group: P = population-facing, E = endogenous):');
    lines.push(
        '──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────',
    );
    lines.push(
        'Facility                  Grp │    Solver │   Targets │    Seeded │    Actual │ act/solv │ act/tgt │ act/seed │ tgt/solv',
    );
    lines.push(
        '───────────────────────────┬───┼───────────┼───────────┼───────────┼───────────┼──────────┼─────────┼──────────┼─────────',
    );

    const sortedKeys = [...ALL_KEYS].filter((key) => key !== 'coalPowerPlant').sort();
    for (const key of sortedKeys) {
        const group = classification.populationFacing.has(key) ? 'P' : classification.endogenous.has(key) ? 'E' : '?';
        const s = solver[key] ?? 0;
        const t = targets[key] ?? 0;
        const sd = seeded[key] ?? 0;
        const a = actual[key] ?? 0;
        const name = ALL_PRODUCTION_FACILITY_ENTRIES[key].factory(TOOL_PLANET, TOOL_ID).name.padEnd(25).slice(0, 25);
        lines.push(
            `${name} ${group} │ ${fmt(s)} │ ${fmt(t)} │ ${fmt(sd)} │ ${fmt(a)} │ ${ratioText(a, s)} │ ${ratioText(a, t)} │ ${ratioText(a, sd)} │ ${ratioText(t, s)}`,
        );
    }
    return lines.join('\n');
}
