import type { ResourceQuantity } from '../../src/simulation/planet/claims';
import { ALL_PRODUCTION_FACILITY_ENTRIES } from '../../src/simulation/planet/productionFacilities';
import {
    ESSENTIAL_LABOUR_FACTOR,
    isEssentialGood,
    LABOUR_MULTIPLIER,
    LABOUR_PER_UNIT,
    labourPerUnitOf,
    MINIMUM_WORKERS_PER_SCALE,
    OPTIONAL_LABOUR_FACTOR,
} from '../../src/simulation/workforce/workerRequirements';

const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toFixed(1) : v.toFixed(4));

const rawLabour = (flows: ResourceQuantity[]): number =>
    flows.reduce((sum, entry) => sum + entry.quantity * labourPerUnitOf(entry.resource), 0);

const classLabour = (flows: ResourceQuantity[], essential: boolean): number =>
    flows.reduce((sum, entry) => {
        if (isEssentialGood(entry.resource.name) !== essential) {
            return sum;
        }
        return sum + entry.quantity * labourPerUnitOf(entry.resource);
    }, 0);

console.log(
    `# labour per unit by level: raw=${LABOUR_PER_UNIT.raw} refined=${LABOUR_PER_UNIT.refined} manufactured=${LABOUR_PER_UNIT.manufactured} services=${LABOUR_PER_UNIT.services} | essentialFactor=${ESSENTIAL_LABOUR_FACTOR} optionalFactor=${OPTIONAL_LABOUR_FACTOR}`,
);
console.log('key,headcountPerScale,headcountPerOutputUnit,essentialLabour,optionalLabour,essentialShare,capped');
for (const [key, entry] of Object.entries(ALL_PRODUCTION_FACILITY_ENTRIES)) {
    const flows = [...entry.template.needs, ...entry.template.produces];
    const essential = classLabour(flows, true);
    const optional = classLabour(flows, false);
    const raw = (essential + optional) * LABOUR_MULTIPLIER;
    const headcount = Math.max(MINIMUM_WORKERS_PER_SCALE, raw);
    const outputUnits = entry.template.produces.reduce((sum, out) => sum + out.quantity, 0);
    const total = essential + optional;
    console.log(
        [
            key,
            headcount.toFixed(2),
            outputUnits > 0 ? (headcount / outputUnits).toFixed(4) : '0',
            fmt(essential),
            fmt(optional),
            total > 0 ? (essential / total).toFixed(3) : '0',
            raw < MINIMUM_WORKERS_PER_SCALE ? 'yes' : 'no',
        ].join(','),
    );
}

console.log('\n# labour per unit of every resource flowing through the recipes');
const byResource = new Map<string, { level: string; perUnit: number; total: number; essential: boolean }>();
for (const [, entry] of Object.entries(ALL_PRODUCTION_FACILITY_ENTRIES)) {
    for (const flow of [...entry.template.needs, ...entry.template.produces]) {
        const perUnit = labourPerUnitOf(flow.resource);
        if (perUnit <= 0) {
            continue;
        }
        const acc = byResource.get(flow.resource.name) ?? {
            level: flow.resource.level,
            perUnit,
            total: 0,
            essential: isEssentialGood(flow.resource.name),
        };
        acc.total += flow.quantity * perUnit;
        byResource.set(flow.resource.name, acc);
    }
}
for (const [name, value] of [...byResource.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(
        `${name},${value.level},${value.essential ? 'essential' : 'optional'},perUnit=${fmt(value.perUnit)},totalLabour=${fmt(value.total)}`,
    );
}
