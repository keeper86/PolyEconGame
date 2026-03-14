import { describe, it, expect } from 'vitest';
import { waterFill } from './waterFill';
import type { WorkerSlot } from './waterFill';
import type { EducationLevelType } from '../population/education';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FLAT_PROD = { none: 1, primary: 1, secondary: 1, tertiary: 1 } as Record<EducationLevelType, number>;
const NO_SUPPLY = { none: 0, primary: 0, secondary: 0, tertiary: 0 } as Record<EducationLevelType, number>;
/** Tests that don't exercise efficiency don't need a demand map. */
const NO_DEMAND = new Map<WorkerSlot, number>();

function supply(overrides: Partial<Record<EducationLevelType, number>>): Record<EducationLevelType, number> {
    return { ...NO_SUPPLY, ...overrides };
}

function slot(jobEdu: EducationLevelType, capacity: number): WorkerSlot {
    const jobEduIdx = ['none', 'primary', 'secondary', 'tertiary'].indexOf(jobEdu);
    return {
        facilityIdx: 0,
        jobEdu,
        jobEduIdx,
        capacity,
        assigned: 0,
        effectiveAssigned: 0,
        assignedByEdu: {},
        overqualifiedCount: 0,
    };
}

// ---------------------------------------------------------------------------
// Core fill behaviour
// ---------------------------------------------------------------------------

describe('waterFill — exact-match tier', () => {
    it('fills a single slot fully when supply equals capacity', () => {
        const slots = [slot('none', 10)];
        waterFill(slots, supply({ none: 10 }), FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(10);
    });

    it('partially fills when supply is insufficient', () => {
        const slots = [slot('none', 10)];
        waterFill(slots, supply({ none: 4 }), FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(4);
    });

    it('leaves remaining supply zero after exact fill', () => {
        const slots = [slot('primary', 5)];
        const { remaining } = waterFill(slots, supply({ primary: 5 }), FLAT_PROD, NO_DEMAND);
        expect(remaining.primary).toBe(0);
    });

    it('returns surplus when supply exceeds capacity', () => {
        const slots = [slot('none', 5)];
        const { remaining } = waterFill(slots, supply({ none: 8 }), FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(5);
        expect(remaining.none).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// Qualification rule: higher tier fills lower slots
// ---------------------------------------------------------------------------

describe('waterFill — qualification rule', () => {
    it('higher-edu workers fill under-qualified slots (overqualified)', () => {
        const slots = [slot('none', 10)];
        waterFill(slots, supply({ secondary: 10 }), FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(10);
        expect(slots[0].overqualifiedCount).toBe(10);
        expect(slots[0].assignedByEdu.secondary).toBe(10);
    });

    it('lower-edu workers cannot fill higher-requirement slots', () => {
        const slots = [slot('secondary', 10)];
        waterFill(slots, supply({ none: 10, primary: 10 }), FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(0);
    });

    it('marks exact-match workers as not overqualified', () => {
        const slots = [slot('primary', 5)];
        waterFill(slots, supply({ primary: 5 }), FLAT_PROD, NO_DEMAND);
        expect(slots[0].overqualifiedCount).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Equilibrium across multiple slots
// ---------------------------------------------------------------------------

describe('waterFill — equilibrium', () => {
    it('equalises fill ratio across two same-capacity slots', () => {
        const slots = [slot('none', 10), slot('none', 10)];
        slots[1].facilityIdx = 1;
        waterFill(slots, supply({ none: 10 }), FLAT_PROD, NO_DEMAND);
        // 10 workers, 20 total capacity → equilibrium 0.5 → 5 each
        expect(slots[0].assigned).toBe(5);
        expect(slots[1].assigned).toBe(5);
    });

    it('equalises fill ratio across different-capacity slots', () => {
        // 6-cap + 10-cap, 8 workers → equilibrium 8/16 = 0.5
        const slots = [slot('none', 6), slot('none', 10)];
        slots[1].facilityIdx = 1;
        waterFill(slots, supply({ none: 8 }), FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(3); // ceil(0.5 × 6) = 3
        expect(slots[1].assigned).toBe(5); // ceil(0.5 × 10) = 5
    });

    it('fills all slots to 100% when there is enough supply', () => {
        const slots = [slot('none', 4), slot('none', 6)];
        slots[1].facilityIdx = 1;
        waterFill(slots, supply({ none: 10 }), FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(4);
        expect(slots[1].assigned).toBe(6);
    });

    it('raises the lower slot to the level of the higher before equalising further', () => {
        // slot A is at 0/10 (0%), slot B is pre-filled to 4/10 (40%), supply = 6 none
        const a = slot('none', 10);
        const b = slot('none', 10);
        b.facilityIdx = 1;
        b.assigned = 4;
        // sorted: [a(0%), b(40%)] — first step raises a to 40% (needs 4), 2 left for both (→ 50% each)
        waterFill([a, b], supply({ none: 6 }), FLAT_PROD, NO_DEMAND);
        expect(a.assigned).toBe(5); // 0 + ceil(0.5×10) = 5
        expect(b.assigned).toBe(5); // already 4, takes 1 more → ceil(0.5×10) = 5
    });
});

// ---------------------------------------------------------------------------
// Multi-tier interaction
// ---------------------------------------------------------------------------

describe('waterFill — multiple tiers', () => {
    it('lower tier fills its own slots first; higher tier fills the remainder', () => {
        // none-slot (cap 10): none-workers fill 6, then primary fills 4
        const slots = [slot('none', 10)];
        waterFill(slots, supply({ none: 6, primary: 4 }), FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(10);
        expect(slots[0].assignedByEdu.none).toBe(6);
        expect(slots[0].assignedByEdu.primary).toBe(4);
        expect(slots[0].overqualifiedCount).toBe(4);
    });

    it('higher-tier workers are spread across all reachable under-filled slots', () => {
        // Two facilities: none-slot (cap 6) and secondary-slot (cap 10).
        // 10 secondary workers: both slots reachable (secondary ≥ none, secondary = secondary).
        // equilibrium = 10/16 ≈ 0.625 → slot1 gets ceil(0.625×6)=4, slot2 gets min(ceil(0.625×10)=7, 6 left)=6
        const none6 = slot('none', 6);
        const sec10 = slot('secondary', 10);
        sec10.facilityIdx = 1;
        waterFill([none6, sec10], supply({ secondary: 10 }), FLAT_PROD, NO_DEMAND);
        expect(none6.assigned).toBe(4);
        expect(sec10.assigned).toBe(6);
        expect(none6.overqualifiedCount).toBe(4); // secondary in none-slot
        expect(sec10.overqualifiedCount).toBe(0); // exact match
    });

    it('higher-tier workers spread across all reachable slots including partially-filled ones', () => {
        // none-slot (cap 10) receives 6 none-workers (fill=60%).
        // primary-slot (cap 5) starts empty (fill=0%).
        // 4 primary workers enter: reachable = [primary-slot(0%), none-slot(60%)].
        // Step 1: raise primary-slot from 0% to 60% — needs 5×0.6=3, consuming 3.
        // Step 2: 1 worker left for both (width=15) → equilibrium = 0.6 + 1/15 ≈ 0.667.
        // primary-slot: ceil(0.667×5)=4 total, takes 4 (3+1). none-slot: supply exhausted.
        const noneSlot = slot('none', 10);
        const primarySlot = slot('primary', 5);
        primarySlot.facilityIdx = 1;
        waterFill([noneSlot, primarySlot], supply({ none: 6, primary: 4 }), FLAT_PROD, NO_DEMAND);
        expect(noneSlot.assigned).toBe(6); // none-pass only; primary exhausted on primarySlot
        expect(primarySlot.assigned).toBe(4); // all 4 primary workers went here
    });
});

// ---------------------------------------------------------------------------
// Age productivity scaling
// ---------------------------------------------------------------------------

describe('waterFill — effectiveAssigned', () => {
    it('scales effectiveAssigned by ageProd', () => {
        const ageProd = { none: 0.8, primary: 1.0, secondary: 1.0, tertiary: 1.0 } as Record<
            EducationLevelType,
            number
        >;
        const slots = [slot('none', 10)];
        waterFill(slots, supply({ none: 10 }), ageProd, NO_DEMAND);
        expect(slots[0].effectiveAssigned).toBeCloseTo(10 * 0.8);
    });

    it('assigns extra bodies when ageProd < 1 to compensate', () => {
        // capacity is pre-adjusted by callers (ceil(target / ageProd)), so here
        // we just verify effectiveAssigned reflects the multiplier faithfully.
        const ageProd = { none: 0.5, primary: 1, secondary: 1, tertiary: 1 } as Record<EducationLevelType, number>;
        const slots = [slot('none', 20)]; // e.g. 10 effective needed, 20 bodies at 0.5 prod
        waterFill(slots, supply({ none: 20 }), ageProd, NO_DEMAND);
        expect(slots[0].assigned).toBe(20);
        expect(slots[0].effectiveAssigned).toBeCloseTo(10);
    });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('waterFill — edge cases', () => {
    it('returns unmodified supply when no slots are provided', () => {
        const { remaining } = waterFill([], supply({ none: 5 }), FLAT_PROD, NO_DEMAND);
        expect(remaining.none).toBe(5);
    });

    it('returns unmodified supply when all workers are of wrong tier', () => {
        const slots = [slot('secondary', 10)];
        const { remaining } = waterFill(slots, supply({ none: 10 }), FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(0);
        expect(remaining.none).toBe(10);
    });

    it('handles zero supply gracefully', () => {
        const slots = [slot('none', 10)];
        waterFill(slots, NO_SUPPLY, FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(0);
    });

    it('handles a slot with capacity 1', () => {
        const slots = [slot('none', 1)];
        waterFill(slots, supply({ none: 5 }), FLAT_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(1);
    });
});
