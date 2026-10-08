import type { ResourceQuantity } from '../../src/simulation/planet/claims';
import { ALL_PRODUCTION_FACILITY_ENTRIES } from '../../src/simulation/planet/productionFacilities';
import { headcountPerScaleFor, isEssentialGood, labourPerUnitOf } from '../../src/simulation/workforce/workerRequirements';

type Entry = (typeof ALL_PRODUCTION_FACILITY_ENTRIES)[string];

const producerOf = new Map<string, Entry>();
for (const entry of Object.values(ALL_PRODUCTION_FACILITY_ENTRIES)) {
    for (const out of entry.template.produces) {
        if (!producerOf.has(out.resource.name)) {
            producerOf.set(out.resource.name, entry);
        }
    }
}

const chainLabourPerUnit = (resourceName: string, seen: Set<string> = new Set()): number => {
    if (seen.has(resourceName)) {
        return 0;
    }
    const producer = producerOf.get(resourceName);
    if (!producer) {
        return 0;
    }
    const output = producer.template.produces.find((p) => p.resource.name === resourceName);
    if (!output || output.quantity <= 0) {
        return 0;
    }
    const next = new Set(seen).add(resourceName);
    const upstream = producer.template.needs.reduce(
        (sum, need: ResourceQuantity) => sum + need.quantity * chainLabourPerUnit(need.resource.name, next),
        0,
    );
    return (headcountPerScaleFor(producer.template) + upstream) / output.quantity;
};

const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(4));

console.log('finalGood,class,directPerUnit,chainPerUnit,chainShare');
const finals = [...producerOf.entries()]
    .map(([name, entry]) => ({ name, entry }))
    .filter(({ name }) => !chainConsumedOnly(name))
    .sort((a, b) => chainLabourPerUnit(a.name) - chainLabourPerUnit(b.name));

function chainConsumedOnly(name: string): boolean {
    let usedAsInput = 0;
    for (const entry of Object.values(ALL_PRODUCTION_FACILITY_ENTRIES)) {
        for (const need of entry.template.needs) {
            if (need.resource.name === name) {
                usedAsInput += 1;
            }
        }
    }
    return usedAsInput > 0;
}

for (const { name, entry } of finals) {
    const output = entry.template.produces.find((p) => p.resource.name === name);
    if (!output || output.quantity <= 0) {
        continue;
    }
    const direct = headcountPerScaleFor(entry.template) / output.quantity;
    const chain = chainLabourPerUnit(name);
    console.log(
        `${name},${isEssentialGood(name) ? 'essential' : 'optional'},${fmt(direct)},${fmt(chain)},${(direct / chain).toFixed(3)}`,
    );
}

console.log('\n# labour per unit by resource class in the recipe flows');
let essentialFlow = 0;
let optionalFlow = 0;
for (const entry of Object.values(ALL_PRODUCTION_FACILITY_ENTRIES)) {
    for (const flow of [...entry.template.needs, ...entry.template.produces]) {
        const labour = flow.quantity * labourPerUnitOf(flow.resource);
        if (isEssentialGood(flow.resource.name)) {
            essentialFlow += labour;
        } else {
            optionalFlow += labour;
        }
    }
}
console.log(`essential flow labour total = ${fmt(essentialFlow)}`);
console.log(`optional  flow labour total = ${fmt(optionalFlow)}`);

const upstreamClosure = (roots: string[]): Set<string> => {
    const closed = new Set<string>();
    const stack = [...roots];
    while (stack.length > 0) {
        const name = stack.pop()!;
        if (closed.has(name)) {
            continue;
        }
        const entry = producerOf.get(name);
        if (!entry) {
            continue;
        }
        closed.add(name);
        for (const need of entry.template.needs) {
            if (!closed.has(need.resource.name)) {
                stack.push(need.resource.name);
            }
        }
    }
    return closed;
};

const subsistenceRoots = ['Grocery', 'Healthcare', 'Pharmaceutical', 'Beverage', 'Processed Food'];
const closure = upstreamClosure(subsistenceRoots);
console.log(`\n# upstream closure of the subsistence basket roots (${subsistenceRoots.join(', ')})`);
console.log([...closure].sort().join(', '));

const offChain = [...closure].filter((name) => !isEssentialGood(name));
console.log(`\ngoods in the subsistence closure currently classified OPTIONAL: ${offChain.length}`);
console.log(offChain.sort().join(', '));

for (const root of subsistenceRoots) {
    const chain = chainLabourPerUnit(root);
    let essentialPart = 0;
    let optionalPart = 0;
    const walk = (name: string, depth: Set<string>): void => {
        if (depth.has(name)) {
            return;
        }
        const entry = producerOf.get(name);
        if (!entry) {
            return;
        }
        const output = entry.template.produces.find((p) => p.resource.name === name);
        if (!output || output.quantity <= 0) {
            return;
        }
        const multiplier = 1 / output.quantity;
        for (const need of entry.template.needs) {
            const contribution = need.quantity * multiplier * chainLabourPerUnit(need.resource.name);
            if (isEssentialGood(need.resource.name)) {
                essentialPart += contribution;
            } else {
                optionalPart += contribution;
            }
            walk(need.resource.name, new Set(depth).add(name));
        }
    };
    walk(root, new Set());
    const total = essentialPart + optionalPart;
    console.log(
        `chain ${root}: total=${fmt(chain)} of which own+essential=${fmt(essentialPart)} optionalInputs=${fmt(optionalPart)} optionalShare=${total > 0 ? (optionalPart / total).toFixed(3) : '0'}`,
    );
}

