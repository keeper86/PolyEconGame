/**
 * Slack-Based World Target Generator
 *
 * Uses the existing LP solver infrastructure to compute facility scales
 * that satisfy all supply-chain constraints with configurable slack.
 *
 * Run: npx tsx tools/facility-growth-model/computeTargets.ts
 */

import { ALL_FACILITY_ENTRIES } from '../../src/simulation/planet/productionFacilities';
import { allServices } from '../../src/simulation/market/serviceDefinitions';
import  camelCase from 'camelcase'
import {
    constructionServiceResourceType,
    maintenanceServiceResourceType,
} from '../../src/simulation/planet/services';
import { computePopulationServiceDemand } from '../../src/app/supply-chain/_components/populationDemandHelper';

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
    defaultSlack: 1.05, // 0% surplus on everything (1.5 = 50% surplus)
    floorScale: 1,
    services: {
        grocery: 1.3,
        healthcare: 1.3,
        logistics: 1.3,
        retail: 1.3,
        education: 1.3,
    },
    goods: {
        administration: 1.3,
        logistics: 1.3,
        construction: 1.3,
        maintenance: 1.3,
    },
};

const BALANCE_EPSILON = 0.001;

function resourceConstraintKey(name: string): string {
    return `res__${name}`;
}

function buildModel(slack: SlackConfig): {
    constraints: Record<string, { min: number }>;
    variables: Record<string, Record<string, number>>;
    constructionDemandPerTick: number;
} {
    const populationDemand = computePopulationServiceDemand(slack.population);

    const constraints: Record<string, { min: number }> = {};
    const variables: Record<string, Record<string, number>> = {};

    for (const entry of Object.values(ALL_FACILITY_ENTRIES)) {
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
            console.log(
                `  Service ${service.resource.name.padEnd(20)}: demand ${Math.round(demand).toLocaleString().padStart(12)} → min ${minDemand.toLocaleString().padStart(12)} (${factor.toFixed(1)}×${factor !== (slackOverride ?? slack.defaultSlack) ? ' default' : ''})`,
            );
        }
    }

    // Add construction demand: every non-construction facility needs construction service for expansion
    const constructionDemandPerTick = 7_000_000;
    const constructKey = resourceConstraintKey(constructionServiceResourceType.name);
    for (const entry of Object.values(ALL_FACILITY_ENTRIES)) {
        const f = entry.factory(TOOL_PLANET, TOOL_ID);
        if (f.name === 'Coal Power Plant') continue;
        if (f.produces.some((p) => p.resource.name === constructionServiceResourceType.name)) continue;        
    }
    if (constructKey in constraints && constructionDemandPerTick > 0) {
        const civilConstructions = Math.ceil(constructionDemandPerTick * 0.3);
        constraints[constructKey].min = (constraints[constructKey].min ?? 0) + civilConstructions;

        // Apply construction facility's own slack
        const slackOverride = slack.goods[constructionServiceResourceType.name.toLowerCase()];
        const factor = slackOverride ?? slack.defaultSlack;
        if (factor > 1) {
            constraints[constructKey].min = Math.ceil(constraints[constructKey].min * factor);
        }

        console.log(
            `  Construction service: ${civilConstructions.toLocaleString()} units/tick (${constructionDemandPerTick} facilities × 0.3) → slack ${factor.toFixed(1)}× → min ${Math.ceil(civilConstructions * factor).toLocaleString()}`,
        );
    }

    // Apply slack to all intermediate goods
    for (const [resKey, constraint] of Object.entries(constraints)) {
        const resName = resKey.replace(/^res__/, '');
        if (resKey === constructKey ) continue;

        const hasProducer = Object.values(variables).some((v) => (v[resKey] ?? 0) > 0);
        if (!hasProducer) continue;

        const slackOverride =
            slack.services[resName.toLowerCase()] ?? slack.goods[resName.toLowerCase()];
        const factor = slackOverride ?? slack.defaultSlack;
        const currentMin = constraint.min;

        if (currentMin > 0) {
            constraints[resKey].min = Math.ceil(currentMin * factor);
        }
    }

    return { constraints, variables, constructionDemandPerTick };
}

function main(): void {
    const pop = CONFIG.population;

    console.log('=== Slack-Based World Target Generator ===');
    console.log(`Population: ${pop.toLocaleString()}`);
    console.log(`Default slack: ${(CONFIG.defaultSlack - 1) * 100}%`);
    console.log('');

    const { constraints, variables, constructionDemandPerTick } =
        buildModel(CONFIG);

    const model = {
        optimize: 'obj',
        opType: 'min' as const,
        constraints,
        variables,
    };

    import('javascript-lp-solver')
        .then(({ default: solver }) => {
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
                    const testRaw = solver.Solve(testModel) as Record<
                        string,
                        number | boolean
                    > & { feasible: boolean };
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
            for (const entry of Object.values(ALL_FACILITY_ENTRIES)) {
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
            console.log(
                '┌──────────────────────────────────────┬──────────────┬────────────────────────────────┐',
            );
            console.log(
                '│ Facility                             │    TotalScale │ Workers needed                 │',
            );
            console.log(
                '├──────────────────────────────────────┼──────────────┼────────────────────────────────┤',
            );
            let totalWorkers = 0;
            for (const r of results) {
                totalWorkers += r.workers;
                console.log(
                    `│ ${r.name.padEnd(38)} │ ${r.scale.toLocaleString().padStart(12)} │ ${Math.round(r.workers).toLocaleString().padStart(30)} │`,
                );
            }
            console.log(
                '├──────────────────────────────────────┼──────────────┼────────────────────────────────┤',
            );
            console.log(
                `│ TOTAL                                 │              │ ${Math.round(totalWorkers).toLocaleString().padStart(30)} │`,
            );
            console.log(
                '└──────────────────────────────────────┴──────────────┴────────────────────────────────┘',
            );
            console.log('');
            console.log(`Population: ${pop.toLocaleString()}`);
            console.log(
                `Workforce needed: ${(totalWorkers / 1e6).toFixed(1)}M of ${pop.toLocaleString()} (${(totalWorkers / pop) * 100}%)`,
            );

            // Show resource balance
            console.log('\nResource balances at computed scales:');
            const balances: Record<string, { prod: number; cons: number }> = {};
            for (const r of results) {
                const entry = Object.values(ALL_FACILITY_ENTRIES).find(
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

            // Add ad-hoc construction consumption to balance display
            if (constructionServiceResourceType.name in balances && constructionDemandPerTick > 0) {
                const civilConstructions = Math.ceil(constructionDemandPerTick * 0.3);
                balances[constructionServiceResourceType.name].cons += civilConstructions;
            }

            console.log(
                'Resource              Production        Consumption         Balance          Ratio',
            );
            console.log('─'.repeat(80));
            const sorted = Object.entries(balances).sort((a, b) =>
                a[0].localeCompare(b[0]),
            );
            for (const [res, b] of sorted) {
                const balance = b.prod - b.cons;
                const ratio = b.cons > 0 ? b.prod / b.cons : Infinity;
                const flag = ratio >= 1.0 - BALANCE_EPSILON ? '✅' : '❌';
                console.log(
                    `${flag} ${res.padEnd(20)} ${b.prod.toLocaleString().padStart(14)} ${Math.round(b.cons).toLocaleString().padStart(14)} ` +
                        `${balance >= 0 ? '+' : ''}${Math.round(balance).toLocaleString().padStart(12)} ${ratio === Infinity ? '  Infinity' : ratio.toFixed(3).padStart(8)}`,
                );
            }

            // Also output the TARGETS code
            console.log(
                '\n\n=== COPY THIS INTO proceduralWorld.ts TARGETS ===\n',
            );
            console.log('const TARGETS: Record<string, FacilityTarget> = {');
            for (const r of results) {
                console.log(
                    `    ${camelCase(r.name)}: { totalScale: ${r.scale}, agentCount: Math.ceil(flatTargetFactor*${Math.ceil(r.scale / 150000)}) },`,
                );
            }
            console.log('};');
        })
        .catch((err) => {
            console.error('Failed to load solver:', err);
        });
}

main();