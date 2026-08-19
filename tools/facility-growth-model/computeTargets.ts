/**
 * Slack-Based World Target Generator
 *
 * Uses the existing LP solver infrastructure to compute facility scales
 * that satisfy all supply-chain constraints with configurable slack.
 *
 * Run: npx tsx tools/facility-growth-model/computeTargets.ts
 */

import { ALL_PRODUCTION_FACILITY_ENTRIES } from '../../src/simulation/planet/productionFacilities';
import { allServices } from '../../src/simulation/market/serviceDefinitions';
import camelCase from 'camelcase';
import {
    administrativeServiceResourceType,
    constructionServiceResourceType,
    logisticsServiceResourceType,
    maintenanceServiceResourceType,
} from '../../src/simulation/planet/services';
import { computePopulationServiceDemand } from '../../src/app/supply-chain/_components/populationDemandHelper';
import {
    ESTIMATED_HR_OVERHEAD,
    HR_WORLD_BUFFER,
    PRODUCED_HR_QUANTITY,
    PRODUCED_STORAGE_QUANTITY,
    USED_QUANTITY,
    storageDepartmentFacilityType,
} from '../../src/simulation/planet/specialFacilities';
import {
    FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK,
    MAINTENANCE_SERVICE_PER_STATUS_UNIT,
    MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE,
    SR_HOLDING_COST_PER_TON,
    TICKS_PER_MONTH,
    TICKS_PER_YEAR,
} from '../../src/simulation/constants';
import { calculateCostsForConstruction, getFacilityType, type ProductionFacility } from '../../src/simulation/planet/facility';
import solver from 'javascript-lp-solver';

const TOOL_PLANET = 'tool';
const TOOL_ID = 'preview';

interface SlackConfig {
    population: number;
    services: Record<string, number>; // service resource name (lowercase) → slack multiplier
    goods: Record<string, number>; // goods resource name (lowercase) → slack multiplier
    defaultSlack: number; // default multiplier for all produced goods
    floorScale: number; // minimum scale for every facility type
}

const CONFIG: SlackConfig = {
    population: 8_000_000_000,
    defaultSlack: 1.2, // 0% surplus on everything (1.5 = 50% surplus)
    floorScale: 1,
    services: {
        grocery: 1.5,
        healthcare: 1.5,
        logistics: 1.5,
        retail: 1.5,
        education: 1.5,
        service: 1.5,
    },
    goods: {
        administration: 1.5,
        logistics: 1.5,
        construction: 1.4,
        maintenance: 1.4,
    },
};

const RESTORATION_RATE_PER_TICK =
    (FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK / MAINTENANCE_SERVICE_PER_STATUS_UNIT) *
    MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE;
const EXPANSION_HEADROOM_PER_YEAR = 0.025;
const EXPANSION_RATE_PER_TICK = EXPANSION_HEADROOM_PER_YEAR / TICKS_PER_YEAR;
const BALANCE_EPSILON = 0.001;

const STORAGE_MOVEMENT_FACTOR = 2;
const TARGET_SCALE_PER_AGENT = 150_000;

function resourceConstraintKey(name: string): string {
    return `res__${name}`;
}

const HR_ADMIN_PER_WORKER = (HR_WORLD_BUFFER * ESTIMATED_HR_OVERHEAD * USED_QUANTITY) / (PRODUCED_HR_QUANTITY / 2);

const stoTemplate = storageDepartmentFacilityType(TOOL_PLANET, TOOL_ID);
const STO_WORKERS_PER_SCALE =
    (stoTemplate.workerRequirement.none ?? 0) +
    (stoTemplate.workerRequirement.primary ?? 0) +
    (stoTemplate.workerRequirement.secondary ?? 0) +
    (stoTemplate.workerRequirement.tertiary ?? 0);
const STO_LOGISTICS_PER_SCALE = stoTemplate.needs.find(
    (n) => n.resource.name === logisticsServiceResourceType.name,
)!.quantity;
const STO_ADMIN_PER_SCALE = stoTemplate.needs.find(
    (n) => n.resource.name === administrativeServiceResourceType.name,
)!.quantity;

const HR_SCALE_PER_WORKER = 1 / ((2 / 3) * PRODUCED_HR_QUANTITY);

function constructionDemandPerScaleFor(facility: ProductionFacility): number {
    const perScaleCost = calculateCostsForConstruction(getFacilityType(facility), 0, 1).cost;
    return (RESTORATION_RATE_PER_TICK + EXPANSION_RATE_PER_TICK) * perScaleCost;
}

function buildModel(
    slack: SlackConfig,
    quiet = false,
): {
    constraints: Record<string, { min: number }>;
    variables: Record<string, Record<string, number>>;
} {
    const populationDemand = computePopulationServiceDemand(slack.population);

    const constraints: Record<string, { min: number }> = {};
    const variables: Record<string, Record<string, number>> = {};

    const adminKey = resourceConstraintKey(administrativeServiceResourceType.name);
    const adminSlack = slack.goods[administrativeServiceResourceType.name.toLowerCase()] ?? slack.defaultSlack;
    const logisticsKey = resourceConstraintKey(logisticsServiceResourceType.name);

    for (const entry of Object.values(ALL_PRODUCTION_FACILITY_ENTRIES)) {
        const f = entry.factory(TOOL_PLANET, TOOL_ID);
        const varCoeffs: Record<string, number> = { obj: 1 };
        const name = f.name;

        for (const prod of f.produces) {
            if (prod.resource.level === 'source') continue;
            const key = resourceConstraintKey(prod.resource.name);
            varCoeffs[key] = (varCoeffs[key] ?? 0) + prod.quantity;
            if (!constraints[key]) constraints[key] = { min: 0 };
        }

        for (const need of f.needs) {
            if (need.resource.level === 'source') continue;
            const key = resourceConstraintKey(need.resource.name);
            varCoeffs[key] = (varCoeffs[key] ?? 0) - need.quantity;
            if (!constraints[key]) constraints[key] = { min: 0 };
        }

        const workersPerScale =
            (f.workerRequirement.none ?? 0) +
            (f.workerRequirement.primary ?? 0) +
            (f.workerRequirement.secondary ?? 0) +
            (f.workerRequirement.tertiary ?? 0);

        const producedMass = f.produces.reduce(
            (sum, p) => (p.resource.massPerQuantity > 0 ? sum + p.quantity * p.resource.massPerQuantity : sum),
            0,
        );
        const consumedMass = f.needs.reduce(
            (sum, n) =>
                n.resource.form !== 'landBoundResource' && n.resource.massPerQuantity > 0
                    ? sum + n.quantity * n.resource.massPerQuantity
                    : sum,
            0,
        );
        const throughputMass = producedMass + consumedMass;
        const movement = STORAGE_MOVEMENT_FACTOR * throughputMass;
        const holding = throughputMass * TICKS_PER_MONTH * SR_HOLDING_COST_PER_TON;
        const storageScalePerProdScale = (movement + holding) / PRODUCED_STORAGE_QUANTITY;

        const storageLogisticsPerScale = storageScalePerProdScale * STO_LOGISTICS_PER_SCALE;
        const storageAdminPerScale = storageScalePerProdScale * STO_ADMIN_PER_SCALE;
        const storageWorkersPerScale = storageScalePerProdScale * STO_WORKERS_PER_SCALE;

        const hrAdminDemandPerScale = (workersPerScale + storageWorkersPerScale) * HR_ADMIN_PER_WORKER * adminSlack;
        if (hrAdminDemandPerScale > 0) {
            varCoeffs[adminKey] = (varCoeffs[adminKey] ?? 0) - hrAdminDemandPerScale;
            if (!constraints[adminKey]) constraints[adminKey] = { min: 0 };
        }

        if (storageLogisticsPerScale > 0) {
            varCoeffs[logisticsKey] = (varCoeffs[logisticsKey] ?? 0) - storageLogisticsPerScale;
            if (!constraints[logisticsKey]) constraints[logisticsKey] = { min: 0 };
        }
        if (storageAdminPerScale > 0) {
            varCoeffs[adminKey] = (varCoeffs[adminKey] ?? 0) - storageAdminPerScale;
            if (!constraints[adminKey]) constraints[adminKey] = { min: 0 };
        }

        if (FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK > 0) {
            const maintenanceKey = resourceConstraintKey(maintenanceServiceResourceType.name);
            varCoeffs[maintenanceKey] =
                (varCoeffs[maintenanceKey] ?? 0) - FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK;
            if (!constraints[maintenanceKey]) constraints[maintenanceKey] = { min: 0 };

            const storageMaintenance = storageScalePerProdScale * FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK;
            if (storageMaintenance > 0) {
                varCoeffs[maintenanceKey] = (varCoeffs[maintenanceKey] ?? 0) - storageMaintenance;
            }

            const hrMaintenance =
                (workersPerScale + storageWorkersPerScale) *
                HR_SCALE_PER_WORKER *
                FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK;
            if (hrMaintenance > 0) {
                varCoeffs[maintenanceKey] = (varCoeffs[maintenanceKey] ?? 0) - hrMaintenance;
            }
        }

        const constructionDemandPerScale = constructionDemandPerScaleFor(f);
        if (constructionDemandPerScale > 0) {
            const constructionKey = resourceConstraintKey(constructionServiceResourceType.name);
            varCoeffs[constructionKey] = (varCoeffs[constructionKey] ?? 0) - constructionDemandPerScale;
            if (!constraints[constructionKey]) constraints[constructionKey] = { min: 0 };
        }

        variables[name] = varCoeffs;
    }

    // Add population service demand with slack
    for (const service of allServices) {
        const key = resourceConstraintKey(service.resource.name);
        if (constraints[key]) {
            const demand = populationDemand[service.resource.name] ?? 0;
            const slackOverride = slack.services[service.resource.name.toLowerCase()];
            const factor = slackOverride ?? slack.defaultSlack;
            const minDemand = Math.ceil(demand * factor);
            if (minDemand > 0) {
                constraints[key].min = Math.max(constraints[key].min ?? 0, minDemand);
            }
            if (!quiet) {
                console.log(
                    `  Service ${service.resource.name.padEnd(20)}: demand ${Math.round(demand).toLocaleString().padStart(12)} → min ${minDemand.toLocaleString().padStart(12)} (${factor.toFixed(1)}×${factor !== (slackOverride ?? slack.defaultSlack) ? ' default' : ''})`,
                );
            }
        }
    }

    // Apply slack to all intermediate goods
    for (const [resKey, constraint] of Object.entries(constraints)) {
        const resName = resKey.replace(/^res__/, '');

        const hasProducer = Object.values(variables).some((v) => (v[resKey] ?? 0) > 0);
        if (!hasProducer) continue;

        const slackOverride = slack.services[resName.toLowerCase()] ?? slack.goods[resName.toLowerCase()];
        const factor = slackOverride ?? slack.defaultSlack;
        const currentMin = constraint.min;

        if (currentMin > 0) {
            constraints[resKey].min = Math.ceil(currentMin * factor);
        }
    }

    return { constraints, variables };
}

export interface TargetScalesResult {
    feasible: boolean;
    scales: Record<string, number>;
    constructionDemandPerTick: number;
}

function totalConstructionDemand(rawScales: Record<string, number | boolean>): number {
    let total = 0;
    for (const entry of Object.values(ALL_PRODUCTION_FACILITY_ENTRIES)) {
        const f = entry.factory(TOOL_PLANET, TOOL_ID);
        if (f.name === 'Coal Power Plant') continue;
        const scale = (rawScales[f.name] as number | undefined) ?? 0;
        total += scale * constructionDemandPerScaleFor(f);
    }
    return total;
}

export function computeTargetScales(population: number, slackOverrides: Partial<SlackConfig> = {}): TargetScalesResult {
    const config: SlackConfig = { ...CONFIG, ...slackOverrides, population };
    const { constraints, variables } = buildModel(config, true);

    const model = {
        optimize: 'obj',
        opType: 'min' as const,
        constraints,
        variables,
    };

    const raw = solver.Solve(model) as Record<string, number | boolean> & {
        feasible: boolean;
        result: number;
    };

    if (!raw.feasible) {
        return { feasible: false, scales: {}, constructionDemandPerTick: 0 };
    }

    const scales: Record<string, number> = {};
    for (const [key, entry] of Object.entries(ALL_PRODUCTION_FACILITY_ENTRIES)) {
        const f = entry.factory(TOOL_PLANET, TOOL_ID);
        if (f.name === 'Coal Power Plant') {
            continue;
        }
        const scale = (raw[f.name] as number | undefined) ?? 0;
        const finalScale = Math.max(config.floorScale, Math.round(scale));
        if (finalScale > 0) {
            scales[key] = finalScale;
        }
    }
    return { feasible: true, scales, constructionDemandPerTick: totalConstructionDemand(raw) };
}

function main(): void {
    const pop = CONFIG.population;

    console.log('=== Slack-Based World Target Generator ===');
    console.log(`Population: ${pop.toLocaleString()}`);
    console.log(`Default slack: ${(CONFIG.defaultSlack - 1) * 100}%`);
    console.log('');

    const { constraints, variables } = buildModel(CONFIG);

    const model = {
        optimize: 'obj',
        opType: 'min' as const,
        constraints,
        variables,
    };

    const raw = solver.Solve(model) as Record<string, number | boolean> & {
        feasible: boolean;
        result: number;
    };

    if (!raw.feasible) {
        console.log('\n❌ INFEASIBLE — Cannot satisfy all constraints');
        console.log('\nDiagnosing by removing each constraint one by one...\n');
        for (const [key, constraint] of Object.entries(constraints)) {
            const resName = key.replace(/^res__/, '');
            const testModel = {
                optimize: 'obj',
                opType: 'min' as const,
                constraints: { ...constraints, [key]: { min: 0 } },
                variables,
            };
            const testRaw = solver.Solve(testModel) as Record<string, number | boolean> & { feasible: boolean };
            if (!testRaw.feasible) {
                console.log(
                    `  ❌ "${resName}" (min ${constraint.min?.toLocaleString()}) — removing doesn't help, system still broken`,
                );
            } else {
                console.log(
                    `  ⚠ "${resName}" (min ${constraint.min?.toLocaleString()}) — system feasible without this`,
                );
            }
        }
        return;
    }

    console.log('\n✅ FEASIBLE');
    console.log(`\nObjective value: ${raw.result?.toFixed(2)}`);
    console.log('');

    // Collect scales, enforcing floor
    const results: {
        name: string;
        scale: number;
        workers: number;
        type: string;
    }[] = [];
    for (const entry of Object.values(ALL_PRODUCTION_FACILITY_ENTRIES)) {
        const f = entry.factory(TOOL_PLANET, TOOL_ID);
        if (f.name === 'Coal Power Plant') continue;
        const scale = (raw[f.name] as number | undefined) ?? 0;
        const finalScale = Math.max(CONFIG.floorScale, Math.round(scale));
        if (finalScale > 0 || scale > 0) {
            const workers =
                ((f.workerRequirement.none ?? 0) +
                    (f.workerRequirement.primary ?? 0) +
                    (f.workerRequirement.secondary ?? 0) +
                    (f.workerRequirement.tertiary ?? 0)) *
                finalScale;
            const type = entry.primaryOutputLevel;
            results.push({ name: f.name, scale: finalScale, workers, type });
        }
    }

    results.sort((a, b) => a.name.localeCompare(b.name));

    console.log('TARGETS (ready to paste into proceduralWorld.ts):');
    console.log('┌──────────────────────────────────────┬──────────────┬────────────────────────────────┐');
    console.log('│ Facility                             │    TotalScale │ Workers needed                 │');
    console.log('├──────────────────────────────────────┼──────────────┼────────────────────────────────┤');
    let totalWorkers = 0;
    for (const r of results) {
        totalWorkers += r.workers;
        console.log(
            `│ ${r.name.padEnd(38)} │ ${r.scale.toLocaleString().padStart(12)} │ ${Math.round(r.workers).toLocaleString().padStart(30)} │`,
        );
    }
    console.log('├──────────────────────────────────────┼──────────────┼────────────────────────────────┤');
    console.log(
        `│ TOTAL                                 │              │ ${Math.round(totalWorkers).toLocaleString().padStart(30)} │`,
    );
    console.log('└──────────────────────────────────────┴──────────────┴────────────────────────────────┘');
    console.log('');
    console.log(`Population: ${pop.toLocaleString()}`);
    console.log(
        `Workforce needed: ${(totalWorkers / 1e6).toFixed(1)}M of ${pop.toLocaleString()} (${(totalWorkers / pop) * 100}%)`,
    );

    // Show resource balance
    console.log('\nResource balances at computed scales:');
    const balances: Record<string, { prod: number; cons: number }> = {};
    for (const r of results) {
        const entry = Object.values(ALL_PRODUCTION_FACILITY_ENTRIES).find(
            (e) => e.factory(TOOL_PLANET, TOOL_ID).name === r.name,
        )!;
        const f = entry.factory(TOOL_PLANET, TOOL_ID);
        for (const prod of f.produces) {
            if (prod.resource.level === 'source') continue;
            balances[prod.resource.name] = balances[prod.resource.name] ?? {
                prod: 0,
                cons: 0,
            };
            balances[prod.resource.name].prod += prod.quantity * r.scale;
        }
        for (const need of f.needs) {
            if (need.resource.level === 'source') continue;
            balances[need.resource.name] = balances[need.resource.name] ?? {
                prod: 0,
                cons: 0,
            };
            balances[need.resource.name].cons += need.quantity * r.scale;
        }
    }
    const popDemand = computePopulationServiceDemand(pop);
    for (const service of allServices) {
        const demand = popDemand[service.resource.name] ?? 0;
        if (demand > 0) {
            balances[service.resource.name] = balances[service.resource.name] ?? {
                prod: 0,
                cons: 0,
            };
            balances[service.resource.name].cons += demand;
        }
    }

    // Add HR department administration consumption to balance display
    balances[administrativeServiceResourceType.name] = balances[administrativeServiceResourceType.name] ?? {
        prod: 0,
        cons: 0,
    };
    const hrAdminConsumption = totalWorkers * HR_ADMIN_PER_WORKER;
    balances[administrativeServiceResourceType.name].cons += hrAdminConsumption;

    // Add storage department consumption to balance display
    let totalStorageLogistics = 0;
    let totalStorageAdmin = 0;
    for (const r of results) {
        const entry = Object.values(ALL_PRODUCTION_FACILITY_ENTRIES).find(
            (e) => e.factory(TOOL_PLANET, TOOL_ID).name === r.name,
        )!;
        const f = entry.factory(TOOL_PLANET, TOOL_ID);
        const producedMass = f.produces.reduce(
            (sum, p) => (p.resource.massPerQuantity > 0 ? sum + p.quantity * p.resource.massPerQuantity : sum),
            0,
        );
        const consumedMass = f.needs.reduce(
            (sum, n) =>
                n.resource.form !== 'landBoundResource' && n.resource.massPerQuantity > 0
                    ? sum + n.quantity * n.resource.massPerQuantity
                    : sum,
            0,
        );
        const throughputMass = producedMass + consumedMass;
        const movement = STORAGE_MOVEMENT_FACTOR * throughputMass;
        const holding = throughputMass * TICKS_PER_MONTH * SR_HOLDING_COST_PER_TON;
        const stoScale = ((movement + holding) / PRODUCED_STORAGE_QUANTITY) * r.scale;
        totalStorageLogistics += stoScale * STO_LOGISTICS_PER_SCALE;
        totalStorageAdmin += stoScale * STO_ADMIN_PER_SCALE;
    }
    balances[logisticsServiceResourceType.name] = balances[logisticsServiceResourceType.name] ?? { prod: 0, cons: 0 };
    balances[logisticsServiceResourceType.name].cons += totalStorageLogistics;
    balances[administrativeServiceResourceType.name].cons += totalStorageAdmin;

    balances[constructionServiceResourceType.name] = balances[constructionServiceResourceType.name] ?? {
        prod: 0,
        cons: 0,
    };
    balances[constructionServiceResourceType.name].cons += totalConstructionDemand(raw);

    balances[maintenanceServiceResourceType.name] = balances[maintenanceServiceResourceType.name] ?? {
        prod: 0,
        cons: 0,
    };
    for (const r of results) {
        balances[maintenanceServiceResourceType.name].cons += r.scale * FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK;
    }

    console.log('Resource              Production        Consumption         Balance          Ratio');
    console.log('─'.repeat(80));
    const sorted = Object.entries(balances).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [res, b] of sorted) {
        const balance = b.prod - b.cons;
        const ratio = b.cons > 0 ? b.prod / b.cons : Infinity;
        const flag = ratio >= 1.0 - BALANCE_EPSILON ? '✅' : '❌';
        console.log(
            `${flag} ${res.padEnd(20)} ${b.prod.toLocaleString().padStart(14)} ${Math.round(b.cons).toLocaleString().padStart(14)} ` +
                `${balance >= 0 ? '+' : ''}${Math.round(balance).toLocaleString().padStart(12)} ${ratio === Infinity ? '  Infinity' : ratio.toFixed(3).padStart(8)}`,
        );
    }

    // Write per-billion constants to targets.ts
    const popB = pop / 1_000_000_000;
    const lines: string[] = [
        '// THIS FILE IS AUTO-GENERATED by tools/facility-growth-model/computeTargets.ts',
        '// Run: npx tsx tools/facility-growth-model/computeTargets.ts',
        '',
        'export const FACILITY_SCALE_PER_BILLION: Record<string, number> = {',
    ];
    for (const r of results) {
        const perB = r.scale / popB;
        lines.push(`    ${camelCase(r.name)}: ${perB},`);
    }
    lines.push('};');
    lines.push('');
    lines.push(`export const TARGET_SCALE_PER_AGENT = ${TARGET_SCALE_PER_AGENT};`);
    lines.push('');

    const fs = require('fs');
    const path = require('path');
    const targetPath = path.resolve(__dirname, '../../src/simulation/initialUniverse/targets.ts');
    fs.writeFileSync(targetPath, lines.join('\n'));
    console.log(`\nWrote ${targetPath}`);
}

if (require.main === module) {
    main();
}
