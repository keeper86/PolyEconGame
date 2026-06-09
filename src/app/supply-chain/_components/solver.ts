import { getServiceDefinitionByResourceName } from '@/simulation/market/serviceDefinitions';
import { ALL_FACILITY_ENTRIES } from '@/simulation/planet/productionFacilities';
import {
    administrativeServiceResourceType,
    constructionServiceResourceType,
    groceryServiceResourceType,
    healthcareServiceResourceType,
    logisticsServiceResourceType,
    retailServiceResourceType,
} from '@/simulation/planet/services';
import type { Model, SolveResult } from 'javascript-lp-solver';
import solver from 'javascript-lp-solver';

export type SolverObjective = 'scale' | 'labor' | 'power';

export interface SolverConfig {
    population: number;

    allowedFacilities: Set<string>;
    objective: SolverObjective;
}

export interface ServiceDiagnostic {
    serviceName: string;

    hasProducer: boolean;

    constraintRegistered: boolean;

    feasibleInIsolation: boolean;
}

export interface SolverDiagnostic {
    feasibleWithoutPower: boolean;

    per_service: ServiceDiagnostic[];

    unproducableResources: string[];

    registeredConstraints: string[];
}

export interface SolverResult {
    status: 'feasible' | 'infeasible';

    scales: Record<string, number>;
    objectiveValue: number;

    serviceCoverage: Record<string, number>;

    workerTotals?: {
        none: number;
        primary: number;
        secondary: number;
        tertiary: number;
        total: number;
    };

    diagnostic?: SolverDiagnostic;
}

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

function resourceConstraintKey(name: string): string {
    return `res__${name}`;
}

const POWER_CONSTRAINT_KEY = 'power__balance';

function buildLPModel(config: SolverConfig): Model {
    const { population, allowedFacilities, objective } = config;

    const constraints: Model['constraints'] = {};
    const variables: Model['variables'] = {};

    constraints[POWER_CONSTRAINT_KEY] = { max: 0 };

    for (const entry of ALL_FACILITY_ENTRIES) {
        const f = entry.factory(TOOL_PLANET, TOOL_ID);

        if (!allowedFacilities.has(f.name)) {
            continue;
        }

        let cost = 1;
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

        for (const prod of f.produces) {
            if (prod.resource.level === 'source') {
                continue;
            }
            const key = resourceConstraintKey(prod.resource.name);
            varCoeffs[key] = (varCoeffs[key] ?? 0) + prod.quantity;

            if (!constraints[key]) {
                constraints[key] = { min: 0 };
            }
        }

        for (const need of f.needs) {
            if (need.resource.level === 'source') {
                continue;
            }
            const key = resourceConstraintKey(need.resource.name);
            varCoeffs[key] = (varCoeffs[key] ?? 0) - need.quantity;

            if (!constraints[key]) {
                constraints[key] = { min: 0 };
            }
        }

        variables[f.name] = varCoeffs;
    }

    for (const svc of DEMANDED_SERVICES) {
        const key = resourceConstraintKey(svc.name);
        if (constraints[key]) {
            const def = getServiceDefinitionByResourceName(svc.name);
            const perPerson = def?.consumptionRatePerPersonPerTick ?? 0;
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

function diagnoseInfeasibility(config: SolverConfig): SolverDiagnostic {
    const modelNoPower = buildLPModel(config);
    delete (modelNoPower.constraints as Record<string, unknown>)[POWER_CONSTRAINT_KEY];
    for (const varCoeffs of Object.values(modelNoPower.variables)) {
        delete (varCoeffs as Record<string, unknown>)[POWER_CONSTRAINT_KEY];
    }
    const rawNoPower = solver.Solve(modelNoPower) as SolveResult;
    const feasibleWithoutPower = rawNoPower.feasible;

    const fullModel = buildLPModel(config);
    const registeredConstraints = Object.keys(fullModel.constraints);

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

    const per_service: ServiceDiagnostic[] = DEMANDED_SERVICES.map((svc) => {
        const key = resourceConstraintKey(svc.name);
        const constraintRegistered = key in fullModel.constraints;

        const hasProducer = ALL_FACILITY_ENTRIES.some((entry) => {
            const f = entry.factory(TOOL_PLANET, TOOL_ID);
            return config.allowedFacilities.has(f.name) && f.produces.some((p) => p.resource.name === svc.name);
        });

        const isolatedModel = buildLPModel(config);
        delete (isolatedModel.constraints as Record<string, unknown>)[POWER_CONSTRAINT_KEY];
        for (const varCoeffs of Object.values(isolatedModel.variables)) {
            delete (varCoeffs as Record<string, unknown>)[POWER_CONSTRAINT_KEY];
        }

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

    const scales: Record<string, number> = {};
    for (const entry of ALL_FACILITY_ENTRIES) {
        const name = entry.factory(TOOL_PLANET, TOOL_ID).name;
        const val = raw[name];
        if (typeof val === 'number' && val > 0.0001) {
            scales[name] = Math.round(val * 100) / 100;
        }
    }

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
        const def = getServiceDefinitionByResourceName(svc.name);
        const perPerson = def?.consumptionRatePerPersonPerTick ?? 0;
        const demandForSvc = config.population * perPerson;
        serviceCoverage[svc.name] = demandForSvc > 0 ? supplyPerTick / demandForSvc : 1;
    }

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
