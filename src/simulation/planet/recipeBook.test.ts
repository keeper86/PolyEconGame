import { describe, expect, it } from 'vitest';

import { ALL_PRODUCTION_FACILITY_ENTRIES } from './productionFacilities';
import type { ResourceQuantity } from './claims';
import {
    ESSENTIAL_GOODS,
    ESSENTIAL_LABOUR_FACTOR,
    headcountPerScaleFor,
    isEssentialGood,
    LABOUR_PER_UNIT,
    labourPerUnitFor,
    labourPerUnitOf,
} from '../workforce/workerRequirements';
import { clothingResourceType, produceResourceType } from './resources';
import { groceryServiceResourceType, retailServiceResourceType } from './services';

type FacilityEntry = (typeof ALL_PRODUCTION_FACILITY_ENTRIES)[keyof typeof ALL_PRODUCTION_FACILITY_ENTRIES];

const producerOf = new Map<string, FacilityEntry>();
for (const entry of Object.values(ALL_PRODUCTION_FACILITY_ENTRIES)) {
    for (const out of entry.template.produces) {
        if (!producerOf.has(out.resource.name)) {
            producerOf.set(out.resource.name, entry);
        }
    }
}

const directLabourPerUnit = (entry: FacilityEntry, resourceName: string): number => {
    const output = entry.template.produces.find((out) => out.resource.name === resourceName);
    if (!output || output.quantity <= 0) {
        return 0;
    }
    return headcountPerScaleFor(entry.template) / output.quantity;
};

const chainLabourPerUnit = (resourceName: string, seen: ReadonlySet<string> = new Set()): number => {
    if (seen.has(resourceName)) {
        return 0;
    }
    const entry = producerOf.get(resourceName);
    if (!entry) {
        return 0;
    }
    const output = entry.template.produces.find((out) => out.resource.name === resourceName);
    if (!output || output.quantity <= 0) {
        return 0;
    }
    const next = new Set(seen).add(resourceName);
    const upstream = entry.template.needs.reduce(
        (sum, need: ResourceQuantity) => sum + need.quantity * chainLabourPerUnit(need.resource.name, next),
        0,
    );
    return (headcountPerScaleFor(entry.template) + upstream) / output.quantity;
};

const coverageFor = (employment: number, subsistenceLabour: number): number => employment / subsistenceLabour;

describe('workerRequirements labour content', () => {
    it('charges the level rate times the class factor, and nothing for sources or internal flows', () => {
        expect(labourPerUnitOf(produceResourceType)).toBeCloseTo(LABOUR_PER_UNIT.raw * ESSENTIAL_LABOUR_FACTOR, 10);
        expect(labourPerUnitOf(groceryServiceResourceType)).toBeCloseTo(
            LABOUR_PER_UNIT.services * ESSENTIAL_LABOUR_FACTOR,
            10,
        );
        expect(labourPerUnitFor('services', false, 0.5, 1.5)).toBeCloseTo(LABOUR_PER_UNIT.services * 1.5, 10);
        expect(labourPerUnitFor('services', true, 0.5, 1.5)).toBeCloseTo(LABOUR_PER_UNIT.services * 0.5, 10);
    });

    it('makes the essential factor cheapen the subsistence goods and leave the rest alone', () => {
        const cheap = labourPerUnitFor('raw', isEssentialGood(produceResourceType.name), 0.5, 1);
        const normal = labourPerUnitFor('manufactured', isEssentialGood(clothingResourceType.name), 0.5, 1);

        expect(isEssentialGood(produceResourceType.name)).toBe(true);
        expect(isEssentialGood(clothingResourceType.name)).toBe(false);
        expect(cheap).toBeLessThan(normal);
    });
});

describe('the two recipe books', () => {
    it('classifies the subsistence basket and the food chain as essential', () => {
        for (const good of [
            'Water',
            'Produce',
            'Processed Food',
            'Beverage',
            'Grocery',
            'Chemical',
            'Packaging Material',
        ]) {
            expect(ESSENTIAL_GOODS.has(good)).toBe(true);
        }
    });

    it('has a producer for every essential good that the population consumes', () => {
        for (const good of ['Processed Food', 'Beverage', 'Grocery', 'Water', 'Pesticide']) {
            expect(producerOf.has(good)).toBe(true);
        }
    });

    it('gives every final good a finite, positive chain labour content no smaller than its direct labour', () => {
        const finals = ['Administration', 'Maintenance', 'Education', 'Grocery', 'Logistics', 'Healthcare', 'Retail'];
        for (const good of finals) {
            const entry = producerOf.get(good);
            expect(entry, `missing producer for ${good}`).toBeDefined();
            const chain = chainLabourPerUnit(good);
            const direct = directLabourPerUnit(entry!, good);
            expect(chain).toBeGreaterThan(0);
            expect(Number.isFinite(chain)).toBe(true);
            expect(chain).toBeGreaterThanOrEqual(direct);
        }
    });

    it('keeps the subsistence retail chain cheaper per unit than the optional one', () => {
        expect(chainLabourPerUnit('Grocery')).toBeLessThan(chainLabourPerUnit('Retail'));
    });

    it('keeps the subsistence chain cheaper per unit than the optional service it displaces', () => {
        const subsistence = chainLabourPerUnit('Grocery');
        const optional = ['Retail', 'Construction'].map((good) => chainLabourPerUnit(good));

        for (const value of optional) {
            expect(subsistence).toBeLessThan(value);
        }
    });
});

describe('the essential classification follows the subsistence chain', () => {
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

    const optionalLabourShare = (root: string): number => {
        let essential = 0;
        let optional = 0;
        const walk = (name: string, depth: ReadonlySet<string>): void => {
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
            const next = new Set(depth).add(name);
            for (const need of entry.template.needs) {
                const contribution = (need.quantity * chainLabourPerUnit(need.resource.name)) / output.quantity;
                if (isEssentialGood(need.resource.name)) {
                    essential += contribution;
                } else {
                    optional += contribution;
                }
                walk(need.resource.name, next);
            }
        };
        walk(root, new Set());
        const total = essential + optional;
        return total > 0 ? optional / total : 0;
    };

    const roots = ['Grocery', 'Processed Food', 'Beverage', 'Healthcare', 'Pharmaceutical'];

    it('keeps the food chains almost entirely essential-classified', () => {
        for (const root of ['Grocery', 'Processed Food', 'Beverage']) {
            expect(optionalLabourShare(root), `${root} chain is exposed to the optional factor`).toBeLessThan(0.01);
        }
    });

    it('leaves the discretionary goods outside the subsistence closure', () => {
        const closure = upstreamClosure(roots);

        for (const good of ['Clothing', 'Electronics', 'IT Devices', 'Vehicle']) {
            expect(closure.has(good), `${good} should stay optional`).toBe(false);
        }
    });

    it('classifies the intermediate inputs of a subsistence chain as essential', () => {
        expect(ESSENTIAL_GOODS.has('Chemical')).toBe(true);
        expect(ESSENTIAL_GOODS.has('Packaging Material')).toBe(true);
    });
});
describe('the toy gate applied to the recipe books', () => {
    it('opens the discretionary sector only once the employment share exceeds the subsistence labour content', () => {
        const subsistence = chainLabourPerUnit('Grocery');

        expect(coverageFor(subsistence * 0.5, subsistence)).toBeLessThan(1);
        expect(coverageFor(subsistence * 1.5, subsistence)).toBeGreaterThan(1);
    });

    it('moves the gate in the right direction when the essential labour factor is lowered', () => {
        const subsistence = chainLabourPerUnit('Grocery');
        const cheaper = subsistence * 0.5;

        expect(coverageFor(1, cheaper)).toBeGreaterThan(coverageFor(1, subsistence));
    });

    it('splits the recipe book into two non-trivial labour classes', () => {
        let essentialLabour = 0;
        let optionalLabour = 0;
        for (const entry of Object.values(ALL_PRODUCTION_FACILITY_ENTRIES)) {
            for (const flow of [...entry.template.needs, ...entry.template.produces]) {
                const labour = flow.quantity * labourPerUnitOf(flow.resource);
                if (isEssentialGood(flow.resource.name)) {
                    essentialLabour += labour;
                } else {
                    optionalLabour += labour;
                }
            }
        }

        expect(essentialLabour).toBeGreaterThan(0);
        expect(optionalLabour).toBeGreaterThan(0);
    });

    it('keeps the optional labour coefficient independent of the essential one', () => {
        expect(labourPerUnitFor('services', false, 0.1, 1)).toBeCloseTo(LABOUR_PER_UNIT.services, 10);
        expect(labourPerUnitOf(retailServiceResourceType)).toBeGreaterThan(0);
    });
});
