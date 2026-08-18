import { describe, expect, it } from 'vitest';
import { FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK } from '../constants';
import { ALL_PRODUCTION_FACILITY_ENTRIES, type FacilityType } from '../planet/productionFacilities';
import { maintenanceServiceResourceType } from '../planet/services';
import { FACILITY_SCALE_PER_BILLION } from './targets';

const TOOL_PLANET = 'test';
const TOOL_ID = 'test';
const MAINTENANCE = maintenanceServiceResourceType.name;

function seedScales(population: number): Map<string, number> {
    const popB = population / 1_000_000_000;
    const scales = new Map<string, number>();
    for (const [key, perBillion] of Object.entries(FACILITY_SCALE_PER_BILLION)) {
        scales.set(key, perBillion * popB);
    }
    return scales;
}

type Balance = {
    supply: number;
    demand: number;
    slack: number;
};

function resourceBalance(population: number): Map<string, Balance> {
    const scales = seedScales(population);
    const supply = new Map<string, number>();
    const demand = new Map<string, number>();

    for (const [key, scale] of scales) {
        const facility = ALL_PRODUCTION_FACILITY_ENTRIES[key as FacilityType].factory(TOOL_PLANET, TOOL_ID);
        for (const out of facility.produces) {
            supply.set(out.resource.name, (supply.get(out.resource.name) ?? 0) + out.quantity * scale);
        }
        for (const need of facility.needs) {
            if (need.resource.form === 'landBoundResource') {
                continue;
            }
            demand.set(need.resource.name, (demand.get(need.resource.name) ?? 0) + need.quantity * scale);
        }
        demand.set(
            MAINTENANCE,
            (demand.get(MAINTENANCE) ?? 0) + FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK * scale,
        );
    }

    const balance = new Map<string, Balance>();
    for (const name of new Set([...supply.keys(), ...demand.keys()])) {
        const s = supply.get(name) ?? 0;
        const d = demand.get(name) ?? 0;
        balance.set(name, { supply: s, demand: d, slack: d > 0 ? s / d - 1 : 0 });
    }
    return balance;
}

describe('benchmark seed resource balance', () => {
    const balance = resourceBalance(10_000_000);

    it('maintenance is structurally balanced at seed (not the root shortfall)', () => {
        const m = balance.get(MAINTENANCE)!;
        expect(m.slack).toBeGreaterThan(0);
    });

    it('silicon wafer is seeded JIT-exact (near-zero slack)', () => {
        const sw = balance.get('Silicon Wafer')!;
        expect(Math.abs(sw.slack)).toBeLessThan(0.01);
    });

    it('sand is JIT-exact, not under-supplied', () => {
        const sand = balance.get('Sand')!;
        expect(Math.abs(sand.slack)).toBeLessThan(0.01);
    });

    it('the whole economy is seeded JIT-exact (zero slack) — structurally fragile', () => {
        const jitExact = [...balance.values()].filter((b) => Math.abs(b.slack) < 0.01).length;
        expect(jitExact).toBeGreaterThanOrEqual(35);
    });
});
