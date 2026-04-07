/**
 * Linear-programming based auto-solver for the supply-chain tool.
 *
 * Given a target population (and therefore a target demand for each of the 6
 * population services) and an optional allow-list of facility types, it finds
 * a set of facility scales that:
 *   • meets all service-demand constraints
 *   • keeps every intermediate resource in balance (produced ≥ consumed)
 *   • ensures power production ≥ power consumption
 *
 * Objective options:
 *   'scale'  — minimise total scale (sum of x[i])       → fewest facilities
 *   'labor'  — minimise total head-count requirement     → least workforce
 *   'power'  — minimise net power consumption            → least energy cost
 */

import solver from 'javascript-lp-solver';
import { ALL_FACILITY_ENTRIES } from '@/simulation/planet/productionFacilities';
import { SERVICE_PER_PERSON_PER_TICK } from '@/simulation/constants';
import { SERVICE_DEFINITION_BY_RESOURCE_NAME } from '@/simulation/market/populationDemand';
import {
    groceryServiceResourceType,
    healthcareServiceResourceType,
    administrativeServiceResourceType,
    logisticsServiceResourceType,
    retailServiceResourceType,
    constructionServiceResourceType,
} from '@/simulation/planet/services';
import type { Model, SolveResult } from 'javascript-lp-solver';

// ─── Public types ────────────────────────────────────────────────────────────

export type SolverObjective = 'scale' | 'labor' | 'power';

export interface SolverConfig {
    population: number;
    /** Names of facilities that may be built. All others are held at 0. */
    allowedFacilities: Set<string>;
    objective: SolverObjective;
}

export interface ServiceDiagnostic {
    serviceName: string;
    /** At least one allowed facility produces this service. */
    hasProducer: boolean;
    /** Demand constraint was actually registered in the LP model (i.e. some facility references it). */
    constraintRegistered: boolean;
    /** Solving with ONLY this service's demand constraint (no others, no power) is feasible. */
    feasibleInIsolation: boolean;
}

export interface SolverDiagnostic {
    /** Solving with the power constraint removed. */
    feasibleWithoutPower: boolean;
    /** Solving with all service demands but no power constraint. */
    per_service: ServiceDiagnostic[];
    /** Resource names that appear in the model but have no facility that produces them (all-negative coefficients). */
    unproducableResources: string[];
    /** Raw constraint keys that exist in the model, for inspection. */
    registeredConstraints: string[];
}

export interface SolverResult {
    status: 'feasible' | 'infeasible';
    /** Recommended scale per facility (only facilities with scale > 0 are listed). */
    scales: Record<string, number>;
    objectiveValue: number;
    /** Service coverage ratios at the recommended scales, e.g. { 'Grocery Service': 1.0 }. */
    serviceCoverage: Record<string, number>;
    /** Worker totals required by the solution, aggregated by role and overall. Present when status === 'feasible'. */
    workerTotals?: {
        none: number;
        primary: number;
        secondary: number;
        tertiary: number;
        total: number;
    };
    /** Only present when status === 'infeasible'. */
    diagnostic?: SolverDiagnostic;
}

// ─── Demanded services ───────────────────────────────────────────────────────

const DEMANDED_SERVICES = [
    groceryServiceResourceType,
    healthcareServiceResourceType,
    administrativeServiceResourceType,
    logisticsServiceResourceType,
    retailServiceResourceType,
    constructionServiceResourceType,
];

const TOOL_PLANET = 'tool';
const TOOL_ID = 'preview';

// ─── Constraint name helpers ─────────────────────────────────────────────────

function resourceConstraintKey(name: string): string {
    return `res__${name}`;
}

const POWER_CONSTRAINT_KEY = 'power__balance';

// ─── Model builder ───────────────────────────────────────────────────────────

function buildLPModel(config: SolverConfig): Model {
    const { population, allowedFacilities, objective } = config;

    const constraints: Model['constraints'] = {};
    const variables: Model['variables'] = {};

    // Power balance: Σ(powerConsumptionPerTick[i] * x[i]) ≤ 0
    // (consumption ≤ production, negative value = produces power)
    constraints[POWER_CONSTRAINT_KEY] = { max: 0 };

    for (const entry of ALL_FACILITY_ENTRIES) {
        const f = entry.factory(TOOL_PLANET, TOOL_ID);

        if (!allowedFacilities.has(f.name)) {
            // Skip disallowed facilities – their implicit bound is 0
            continue;
        }

        // Objective coefficient
        let cost = 1; // 'scale' objective
        if (objective === 'labor') {
            cost =
                (f.workerRequirement.none ?? 0) +
                (f.workerRequirement.primary ?? 0) +
                (f.workerRequirement.secondary ?? 0) +
                (f.workerRequirement.tertiary ?? 0);
        } else if (objective === 'power') {
            cost = Math.max(0, f.powerConsumptionPerTick);
        }

        const varCoeffs: Record<string, number> = {
            obj: cost,
            [POWER_CONSTRAINT_KEY]: f.powerConsumptionPerTick,
        };

        // Resource production coefficients (positive = net supply)
        for (const prod of f.produces) {
            if (prod.resource.level === 'source') {
                continue;
            } // land-bound outputs are ignored
            const key = resourceConstraintKey(prod.resource.name);
            varCoeffs[key] = (varCoeffs[key] ?? 0) + prod.quantity;
            // Ensure constraint exists
            if (!constraints[key]) {
                constraints[key] = { min: 0 };
            }
        }

        // Resource consumption coefficients (negative = net demand)
        for (const need of f.needs) {
            if (need.resource.level === 'source') {
                continue;
            } // source deposits are unlimited externals
            const key = resourceConstraintKey(need.resource.name);
            varCoeffs[key] = (varCoeffs[key] ?? 0) - need.quantity;
            // Ensure constraint exists (consumed resource may not have a producer yet)
            if (!constraints[key]) {
                constraints[key] = { min: 0 };
            }
        }

        variables[f.name] = varCoeffs;
    }

    // Service demand constraints: production ≥ demand (use per-service consumption rates when available)
    for (const svc of DEMANDED_SERVICES) {
        const key = resourceConstraintKey(svc.name);
        if (constraints[key]) {
            const def = SERVICE_DEFINITION_BY_RESOURCE_NAME.get(svc.name);
            const perPerson = def?.consumptionRatePerPersonPerTick ?? SERVICE_PER_PERSON_PER_TICK;
            (constraints[key] as { min?: number; max?: number }).min = population * perPerson;
        }
    }

    const model: Model = {
        optimize: 'obj',
        opType: 'min',
        constraints,
        variables,
    };

    return model;
}

// ─── Public solve function ────────────────────────────────────────────────────

function diagnoseInfeasibility(config: SolverConfig): SolverDiagnostic {
    // ── 1. Try without the power constraint ──────────────────────────────────
    const modelNoPower = buildLPModel(config);
    delete (modelNoPower.constraints as Record<string, unknown>)[POWER_CONSTRAINT_KEY];
    for (const varCoeffs of Object.values(modelNoPower.variables)) {
        delete (varCoeffs as Record<string, unknown>)[POWER_CONSTRAINT_KEY];
    }
    const rawNoPower = solver.Solve(modelNoPower) as SolveResult;
    const feasibleWithoutPower = rawNoPower.feasible;

    // ── 2. Collect which constraints are registered ───────────────────────────
    const fullModel = buildLPModel(config);
    const registeredConstraints = Object.keys(fullModel.constraints);

    // ── 3. Find resources that can never be produced (all coefficients ≤ 0) ──
    const resourceCoeffMax: Record<string, number> = {};
    for (const varCoeffs of Object.values(fullModel.variables)) {
        for (const [key, coeff] of Object.entries(varCoeffs as Record<string, number>)) {
            if (!key.startsWith('res__')) {
                continue;
            }
            resourceCoeffMax[key] = Math.max(resourceCoeffMax[key] ?? -Infinity, coeff);
        }
    }
    const unproducableResources = Object.entries(resourceCoeffMax)
        .filter(([, max]) => max <= 0)
        .map(([key]) => key.replace(/^res__/, ''));

    // ── 4. Per-service diagnostics ────────────────────────────────────────────
    const per_service: ServiceDiagnostic[] = DEMANDED_SERVICES.map((svc) => {
        const key = resourceConstraintKey(svc.name);
        const constraintRegistered = key in fullModel.constraints;

        // Check if any allowed facility produces this service
        const hasProducer = ALL_FACILITY_ENTRIES.some((entry) => {
            const f = entry.factory(TOOL_PLANET, TOOL_ID);
            return config.allowedFacilities.has(f.name) && f.produces.some((p) => p.resource.name === svc.name);
        });

        // Try solving with ONLY this one service demand, no power constraint
        const isolatedModel = buildLPModel(config);
        delete (isolatedModel.constraints as Record<string, unknown>)[POWER_CONSTRAINT_KEY];
        for (const varCoeffs of Object.values(isolatedModel.variables)) {
            delete (varCoeffs as Record<string, unknown>)[POWER_CONSTRAINT_KEY];
        }
        // Strip demand min from all OTHER services
        for (const otherSvc of DEMANDED_SERVICES) {
            if (otherSvc.name === svc.name) {
                continue;
            }
            const otherKey = resourceConstraintKey(otherSvc.name);
            if (otherKey in isolatedModel.constraints) {
                (isolatedModel.constraints[otherKey] as { min?: number }).min = 0;
            }
        }
        const rawIsolated = solver.Solve(isolatedModel) as SolveResult;

        return {
            serviceName: svc.name,
            hasProducer,
            constraintRegistered,
            feasibleInIsolation: rawIsolated.feasible,
        };
    });

    return { feasibleWithoutPower, per_service, unproducableResources, registeredConstraints };
}

export function solveSupplyChain(config: SolverConfig): SolverResult {
    if (config.population <= 0) {
        return { status: 'feasible', scales: {}, objectiveValue: 0, serviceCoverage: {} };
    }

    const model = buildLPModel(config);
    const raw = solver.Solve(model) as SolveResult;

    if (!raw.feasible) {
        const diagnostic = diagnoseInfeasibility(config);
        return { status: 'infeasible', scales: {}, objectiveValue: 0, serviceCoverage: {}, diagnostic };
    }

    // Extract scales, rounding tiny values to 0
    const scales: Record<string, number> = {};
    for (const entry of ALL_FACILITY_ENTRIES) {
        const name = entry.factory(TOOL_PLANET, TOOL_ID).name;
        const val = raw[name];
        if (typeof val === 'number' && val > 0.0001) {
            scales[name] = Math.round(val * 100) / 100;
        }
    }

    // Compute service coverage at the suggested scales
    const serviceCoverage: Record<string, number> = {};
    for (const svc of DEMANDED_SERVICES) {
        let supplyPerTick = 0;
        for (const entry of ALL_FACILITY_ENTRIES) {
            const f = entry.factory(TOOL_PLANET, TOOL_ID);
            const scale = scales[f.name] ?? 0;
            for (const prod of f.produces) {
                if (prod.resource.name === svc.name) {
                    supplyPerTick += prod.quantity * scale;
                }
            }
        }
        const def = SERVICE_DEFINITION_BY_RESOURCE_NAME.get(svc.name);
        const perPerson = def?.consumptionRatePerPersonPerTick ?? SERVICE_PER_PERSON_PER_TICK;
        const demandForSvc = config.population * perPerson;
        serviceCoverage[svc.name] = demandForSvc > 0 ? supplyPerTick / demandForSvc : 1;
    }

    // Compute aggregated worker totals required by the solution
    const rawWorkerTotals = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    for (const entry of ALL_FACILITY_ENTRIES) {
        const f = entry.factory(TOOL_PLANET, TOOL_ID);
        const scale = scales[f.name] ?? 0;
        if (scale <= 0) {
            continue;
        }
        rawWorkerTotals.none += (f.workerRequirement.none ?? 0) * scale;
        rawWorkerTotals.primary += (f.workerRequirement.primary ?? 0) * scale;
        rawWorkerTotals.secondary += (f.workerRequirement.secondary ?? 0) * scale;
        rawWorkerTotals.tertiary += (f.workerRequirement.tertiary ?? 0) * scale;
    }
    const workerTotals = {
        none: Math.round(rawWorkerTotals.none * 100) / 100,
        primary: Math.round(rawWorkerTotals.primary * 100) / 100,
        secondary: Math.round(rawWorkerTotals.secondary * 100) / 100,
        tertiary: Math.round(rawWorkerTotals.tertiary * 100) / 100,
    };
    const workerTotalOverall =
        Math.round((workerTotals.none + workerTotals.primary + workerTotals.secondary + workerTotals.tertiary) * 100) /
        100;

    return {
        status: 'feasible',
        scales,
        objectiveValue: typeof raw.result === 'number' ? raw.result : 0,
        serviceCoverage,
        workerTotals: { ...workerTotals, total: workerTotalOverall },
    };
}
