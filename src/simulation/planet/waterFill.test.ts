import { describe, expect, it } from 'vitest';
import type { EducationLevelType } from '../population/education';
import type { WorkerSlot } from './waterFill';
import { waterFill } from './waterFill';

const FLAT_PROD = { none: 1, primary: 1, secondary: 1, tertiary: 1 } as Record<EducationLevelType, number>;
const NO_SUPPLY: Record<EducationLevelType, number> = { none: 0, primary: 0, secondary: 0, tertiary: 0 };

const NO_DEMAND = new Map<WorkerSlot, number>();

function supply(overrides: Partial<Record<EducationLevelType, number>>): Record<EducationLevelType, number> {
    const result: Record<EducationLevelType, number> = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    for (const [edu, num] of Object.entries(overrides)) {
        result[edu as EducationLevelType] = num!;
    }
    return result;
}

function slot(jobEdu: EducationLevelType, capacity: number, facilityId = 'fac-0'): WorkerSlot {
    const jobEduIdx = ['none', 'primary', 'secondary', 'tertiary'].indexOf(jobEdu);
    return {
        facilityId,
        facilityType: 'production',
        jobEdu,
        jobEduIdx,
        capacity,
        assigned: 0,
        effectiveAssigned: 0,
        hrMultiplier: 1,
        assignedByEdu: {},
        overqualifiedCount: 0,
    };
}

describe('waterFill — exact-match tier', () => {
    it('fills a single slot fully when supply equals capacity', () => {
        const slots = [slot('none', 10)];
        waterFill(slots, supply({ none: 10 }), FLAT_PROD, FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(10);
    });

    it('partially fills when supply is insufficient', () => {
        const slots = [slot('none', 10)];
        waterFill(slots, supply({ none: 4 }), FLAT_PROD, FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(4);
    });

    it('leaves remaining supply zero after exact fill', () => {
        const slots = [slot('primary', 5)];
        const { remaining } = waterFill(slots, supply({ primary: 5 }), FLAT_PROD, FLAT_PROD, NO_DEMAND);
        expect(remaining.primary).toBe(0);
    });

    it('returns surplus when supply exceeds capacity', () => {
        const slots = [slot('none', 5)];
        const { remaining } = waterFill(slots, supply({ none: 8 }), FLAT_PROD, FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(5);
        expect(remaining.none).toBe(3);
    });
});

describe('waterFill — qualification rule', () => {
    it('higher-edu workers fill under-qualified slots (overqualified)', () => {
        const slots = [slot('none', 10)];
        waterFill(slots, supply({ secondary: 10 }), FLAT_PROD, FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(10);
        expect(slots[0].overqualifiedCount).toBe(10);
        expect(slots[0].assignedByEdu.secondary).toBe(10);
    });

    it('lower-edu workers cannot fill higher-requirement slots', () => {
        const slots = [slot('secondary', 10)];
        waterFill(slots, supply({ none: 10, primary: 10 }), FLAT_PROD, FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(0);
    });

    it('marks exact-match workers as not overqualified', () => {
        const slots = [slot('primary', 5)];
        waterFill(slots, supply({ primary: 5 }), FLAT_PROD, FLAT_PROD, NO_DEMAND);
        expect(slots[0].overqualifiedCount).toBe(0);
    });
});

describe('waterFill — equilibrium', () => {
    it('equalises fill ratio across two same-capacity slots', () => {
        const slots = [slot('none', 10), slot('none', 10, 'fac-1')];
        waterFill(slots, supply({ none: 10 }), FLAT_PROD, FLAT_PROD, NO_DEMAND);

        expect(slots[0].assigned).toBe(5);
        expect(slots[1].assigned).toBe(5);
    });

    it('equalises fill ratio across different-capacity slots', () => {
        const slots = [slot('none', 6), slot('none', 10, 'fac-1')];
        waterFill(slots, supply({ none: 8 }), FLAT_PROD, FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(3);
        expect(slots[1].assigned).toBe(5);
    });

    it('fills all slots to 100% when there is enough supply', () => {
        const slots = [slot('none', 4), slot('none', 6, 'fac-1')];
        waterFill(slots, supply({ none: 10 }), FLAT_PROD, FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(4);
        expect(slots[1].assigned).toBe(6);
    });

    it('raises the lower slot to the level of the higher before equalising further', () => {
        const a = slot('none', 10);
        const b = slot('none', 10, 'fac-1');
        b.assigned = 4;

        waterFill([a, b], supply({ none: 6 }), FLAT_PROD, FLAT_PROD, NO_DEMAND);
        expect(a.assigned).toBe(5);
        expect(b.assigned).toBe(5);
    });
});

describe('waterFill — multiple tiers', () => {
    it('lower tier fills its own slots first; higher tier fills the remainder', () => {
        const slots = [slot('none', 10)];
        waterFill(slots, supply({ none: 6, primary: 4 }), FLAT_PROD, FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(10);
        expect(slots[0].assignedByEdu.none).toBe(6);
        expect(slots[0].assignedByEdu.primary).toBe(4);
        expect(slots[0].overqualifiedCount).toBe(4);
    });

    it('higher-tier workers are spread across all reachable under-filled slots', () => {
        const none6 = slot('none', 6);
        const sec10 = slot('secondary', 10, 'fac-1');
        waterFill([none6, sec10], supply({ secondary: 10 }), FLAT_PROD, FLAT_PROD, NO_DEMAND);
        expect(none6.assigned).toBe(4);
        expect(sec10.assigned).toBe(6);
        expect(none6.overqualifiedCount).toBe(4);
        expect(sec10.overqualifiedCount).toBe(0);
    });

    it('higher-tier workers spread across all reachable slots including partially-filled ones', () => {
        const noneSlot = slot('none', 10);
        const primarySlot = slot('primary', 5, 'fac-1');
        waterFill([noneSlot, primarySlot], supply({ none: 6, primary: 4 }), FLAT_PROD, FLAT_PROD, NO_DEMAND);
        expect(noneSlot.assigned).toBe(6);
        expect(primarySlot.assigned).toBe(4);
    });
});

describe('waterFill — effectiveAssigned', () => {
    it('scales effectiveAssigned by ageProd', () => {
        const ageProd = { none: 0.8, primary: 1.0, secondary: 1.0, tertiary: 1.0 } as Record<
            EducationLevelType,
            number
        >;
        const slots = [slot('none', 10)];
        waterFill(slots, supply({ none: 10 }), ageProd, FLAT_PROD, NO_DEMAND);
        expect(slots[0].effectiveAssigned).toBeCloseTo(10 * 0.8);
    });

    it('assigns extra bodies when ageProd < 1 to compensate', () => {
        const ageProd = { none: 0.5, primary: 1, secondary: 1, tertiary: 1 } as Record<EducationLevelType, number>;
        const slots = [slot('none', 20)];
        waterFill(slots, supply({ none: 20 }), ageProd, FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(20);
        expect(slots[0].effectiveAssigned).toBeCloseTo(10);
    });
});

describe('waterFill — XP productivity', () => {
    it('scales effectiveAssigned by xpProd', () => {
        const xpProd = { none: 0.5, primary: 1, secondary: 1, tertiary: 1 } as Record<EducationLevelType, number>;
        const slots = [slot('none', 10)];
        waterFill(slots, supply({ none: 10 }), FLAT_PROD, xpProd, NO_DEMAND);
        expect(slots[0].assigned).toBe(10);
        expect(slots[0].effectiveAssigned).toBeCloseTo(10 * 0.5);
    });

    it('combines ageProd and xpProd multiplicatively', () => {
        const ageProd = { none: 0.8, primary: 1, secondary: 1, tertiary: 1 } as Record<EducationLevelType, number>;
        const xpProd = { none: 0.6, primary: 1, secondary: 1, tertiary: 1 } as Record<EducationLevelType, number>;
        const slots = [slot('none', 5)];
        waterFill(slots, supply({ none: 5 }), ageProd, xpProd, NO_DEMAND);
        expect(slots[0].assigned).toBe(5);
        expect(slots[0].effectiveAssigned).toBeCloseTo(2.4);
    });

    it('different edu levels have different XP multipliers affecting effectiveAssigned', () => {
        const xpProd = { none: 1.0, primary: 1, secondary: 0.5, tertiary: 1 } as Record<EducationLevelType, number>;
        const s = slot('none', 10);
        waterFill([s], supply({ none: 5, secondary: 5 }), FLAT_PROD, xpProd, NO_DEMAND);
        expect(s.assigned).toBe(10);
        expect(s.effectiveAssigned).toBeCloseTo(7.5);
    });
});

describe('waterFill — worker efficiency', () => {
    it('workerEfficiencyOverall is 1 when effectiveAssigned meets or exceeds demand', () => {
        const s = slot('none', 10);
        const demand = new Map<WorkerSlot, number>();
        demand.set(s, 10);
        const result = waterFill([s], supply({ none: 10 }), FLAT_PROD, FLAT_PROD, demand);
        const fac = result.byFacility.get('fac-0')!;
        expect(fac.workerEfficiency.none).toBe(1);
        expect(fac.workerEfficiencyOverall).toBe(1);
    });

    it('workerEfficiencyOverall is the minimum slot efficiency across a facility', () => {
        const s0 = slot('none', 10);
        const s1 = slot('primary', 5, 'fac-0');

        const demand = new Map<WorkerSlot, number>();
        demand.set(s0, 10);
        demand.set(s1, 5);
        const result = waterFill([s0, s1], supply({ none: 5 }), FLAT_PROD, FLAT_PROD, demand);
        const fac = result.byFacility.get('fac-0')!;
        expect(fac.workerEfficiency.none).toBeCloseTo(0.5);
        expect(fac.workerEfficiency.primary).toBe(0);
        expect(fac.workerEfficiencyOverall).toBe(0);
    });

    it('workerEfficiencyOverall is 1 when demand is zero (no demand map entry)', () => {
        const slots = [slot('none', 10)];
        const result = waterFill(slots, supply({ none: 5 }), FLAT_PROD, FLAT_PROD, NO_DEMAND);
        const fac = result.byFacility.get('fac-0')!;

        expect(fac.workerEfficiency.none).toBe(1);
        expect(fac.workerEfficiencyOverall).toBe(1);
    });
});

describe('waterFill — edge cases', () => {
    it('returns unmodified supply when no slots are provided', () => {
        const { remaining } = waterFill([], supply({ none: 5 }), FLAT_PROD, FLAT_PROD, NO_DEMAND);
        expect(remaining.none).toBe(5);
    });

    it('returns unmodified supply when all workers are of wrong tier', () => {
        const slots = [slot('secondary', 10)];
        const { remaining } = waterFill(slots, supply({ none: 10 }), FLAT_PROD, FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(0);
        expect(remaining.none).toBe(10);
    });

    it('handles zero supply gracefully', () => {
        const slots = [slot('none', 10)];
        waterFill(slots, NO_SUPPLY, FLAT_PROD, FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(0);
    });

    it('handles a slot with capacity 1', () => {
        const slots = [slot('none', 1)];
        waterFill(slots, supply({ none: 5 }), FLAT_PROD, FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(1);
    });

    it('handles byFacility result structure with edu info', () => {
        const slots = [slot('none', 10), slot('primary', 5, 'fac-1')];
        const result = waterFill(slots, supply({ none: 10, primary: 3 }), FLAT_PROD, FLAT_PROD, NO_DEMAND);
        const fac0 = result.byFacility.get('fac-0')!;
        const fac1 = result.byFacility.get('fac-1')!;

        expect(fac0.totalUsedByEdu.none).toBe(10);
        expect(fac1.totalUsedByEdu.primary).toBe(3);
        expect(fac0.exactUsedByEdu.none).toBe(10);
        expect(fac1.exactUsedByEdu.primary).toBe(3);

        expect(fac0.overqualifiedWorkers).toEqual({});
        expect(fac1.overqualifiedWorkers).toEqual({});
    });
});

describe('waterFill — findEquilibrium edge cases', () => {
    it('returns 1 when supply exceeds total remaining capacity', () => {
        const s = slot('none', 10);
        waterFill([s], supply({ none: 15 }), FLAT_PROD, FLAT_PROD, NO_DEMAND);
        expect(s.assigned).toBe(10);
    });

    it('handles a slot already at capacity (no reachable slots)', () => {
        const s = slot('none', 5);
        s.assigned = 5;
        const { remaining } = waterFill([s], supply({ none: 3 }), FLAT_PROD, FLAT_PROD, NO_DEMAND);
        expect(s.assigned).toBe(5);
        expect(remaining.none).toBe(3);
    });
});
