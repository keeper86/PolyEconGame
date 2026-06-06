import { describe, expect, it } from 'vitest';
import type { EducationLevelType } from '../population/education';
import { type Skill } from '../population/population';
import type { WorkerSlot } from './waterFill';
import { waterFill } from './waterFill';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FLAT_PROD = { none: 1, primary: 1, secondary: 1, tertiary: 1 } as Record<EducationLevelType, number>;
const FLAT_SKILL_PROD = { novice: 1, professional: 1, expert: 1 } as Record<Skill, number>;
const FLAT_XP_PROD: Record<EducationLevelType, Record<Skill, number>> = {
    none: { novice: 1, professional: 1, expert: 1 },
    primary: { novice: 1, professional: 1, expert: 1 },
    secondary: { novice: 1, professional: 1, expert: 1 },
    tertiary: { novice: 1, professional: 1, expert: 1 },
};
const NO_SUPPLY: Record<EducationLevelType, Record<Skill, number>> = {
    none: { novice: 0, professional: 0, expert: 0 },
    primary: { novice: 0, professional: 0, expert: 0 },
    secondary: { novice: 0, professional: 0, expert: 0 },
    tertiary: { novice: 0, professional: 0, expert: 0 },
};
/** Tests that don't exercise efficiency don't need a demand map. */
const NO_DEMAND = new Map<WorkerSlot, number>();

/** Helper: all supplied workers are "novice" by default (most common initial state). */
function supply(
    overrides: Partial<Record<EducationLevelType, number>>,
): Record<EducationLevelType, Record<Skill, number>> {
    const result: Record<EducationLevelType, Record<Skill, number>> = {
        none: { novice: 0, professional: 0, expert: 0 },
        primary: { novice: 0, professional: 0, expert: 0 },
        secondary: { novice: 0, professional: 0, expert: 0 },
        tertiary: { novice: 0, professional: 0, expert: 0 },
    };
    for (const [edu, num] of Object.entries(overrides)) {
        result[edu as EducationLevelType].novice = num;
    }
    return result;
}

/** Supply with specific skill breakdowns. */
function supplyMultiSkill(
    overrides: Partial<Record<EducationLevelType, Partial<Record<Skill, number>>>>,
): Record<EducationLevelType, Record<Skill, number>> {
    const result: Record<EducationLevelType, Record<Skill, number>> = {
        none: { novice: 0, professional: 0, expert: 0 },
        primary: { novice: 0, professional: 0, expert: 0 },
        secondary: { novice: 0, professional: 0, expert: 0 },
        tertiary: { novice: 0, professional: 0, expert: 0 },
    };
    for (const [edu, skills] of Object.entries(overrides)) {
        for (const [skill, num] of Object.entries(skills)) {
            result[edu as EducationLevelType][skill as Skill] = num;
        }
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
        assignedByEdu: {},
        assignedBySkill: {},
        overqualifiedCount: 0,
    };
}

// ---------------------------------------------------------------------------
// Core fill behaviour
// ---------------------------------------------------------------------------

describe('waterFill — exact-match tier', () => {
    it('fills a single slot fully when supply equals capacity', () => {
        const slots = [slot('none', 10)];
        waterFill(slots, supply({ none: 10 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(10);
    });

    it('partially fills when supply is insufficient', () => {
        const slots = [slot('none', 10)];
        waterFill(slots, supply({ none: 4 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(4);
    });

    it('leaves remaining supply zero after exact fill', () => {
        const slots = [slot('primary', 5)];
        const { remaining } = waterFill(
            slots,
            supply({ primary: 5 }),
            FLAT_PROD,
            FLAT_SKILL_PROD,
            FLAT_XP_PROD,
            NO_DEMAND,
        );
        expect(remaining.primary.novice).toBe(0);
    });

    it('returns surplus when supply exceeds capacity', () => {
        const slots = [slot('none', 5)];
        const { remaining } = waterFill(
            slots,
            supply({ none: 8 }),
            FLAT_PROD,
            FLAT_SKILL_PROD,
            FLAT_XP_PROD,
            NO_DEMAND,
        );
        expect(slots[0].assigned).toBe(5);
        expect(remaining.none.novice).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// Qualification rule: higher tier fills lower slots
// ---------------------------------------------------------------------------

describe('waterFill — qualification rule', () => {
    it('higher-edu workers fill under-qualified slots (overqualified)', () => {
        const slots = [slot('none', 10)];
        waterFill(slots, supply({ secondary: 10 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(10);
        expect(slots[0].overqualifiedCount).toBe(10);
        expect(slots[0].assignedByEdu.secondary).toBe(10);
    });

    it('lower-edu workers cannot fill higher-requirement slots', () => {
        const slots = [slot('secondary', 10)];
        waterFill(slots, supply({ none: 10, primary: 10 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(0);
    });

    it('marks exact-match workers as not overqualified', () => {
        const slots = [slot('primary', 5)];
        waterFill(slots, supply({ primary: 5 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(slots[0].overqualifiedCount).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Equilibrium across multiple slots
// ---------------------------------------------------------------------------

describe('waterFill — equilibrium', () => {
    it('equalises fill ratio across two same-capacity slots', () => {
        const slots = [slot('none', 10), slot('none', 10, 'fac-1')];
        waterFill(slots, supply({ none: 10 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        // 10 workers, 20 total capacity → equilibrium 0.5 → 5 each
        expect(slots[0].assigned).toBe(5);
        expect(slots[1].assigned).toBe(5);
    });

    it('equalises fill ratio across different-capacity slots', () => {
        // 6-cap + 10-cap, 8 workers → equilibrium 8/16 = 0.5
        const slots = [slot('none', 6), slot('none', 10, 'fac-1')];
        waterFill(slots, supply({ none: 8 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(3); // ceil(0.5 × 6) = 3
        expect(slots[1].assigned).toBe(5); // ceil(0.5 × 10) = 5
    });

    it('fills all slots to 100% when there is enough supply', () => {
        const slots = [slot('none', 4), slot('none', 6, 'fac-1')];
        waterFill(slots, supply({ none: 10 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(4);
        expect(slots[1].assigned).toBe(6);
    });

    it('raises the lower slot to the level of the higher before equalising further', () => {
        // slot A is at 0/10 (0%), slot B is pre-filled to 4/10 (40%), supply = 6 none
        const a = slot('none', 10);
        const b = slot('none', 10, 'fac-1');
        b.assigned = 4;
        // sorted: [a(0%), b(40%)] — first step raises a to 40% (needs 4), 2 left for both (→ 50% each)
        waterFill([a, b], supply({ none: 6 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
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
        waterFill(slots, supply({ none: 6, primary: 4 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
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
        const sec10 = slot('secondary', 10, 'fac-1');
        waterFill([none6, sec10], supply({ secondary: 10 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
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
        const primarySlot = slot('primary', 5, 'fac-1');
        waterFill(
            [noneSlot, primarySlot],
            supply({ none: 6, primary: 4 }),
            FLAT_PROD,
            FLAT_SKILL_PROD,
            FLAT_XP_PROD,
            NO_DEMAND,
        );
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
        waterFill(slots, supply({ none: 10 }), ageProd, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(slots[0].effectiveAssigned).toBeCloseTo(10 * 0.8);
    });

    it('assigns extra bodies when ageProd < 1 to compensate', () => {
        // capacity is pre-adjusted by callers (ceil(target / ageProd)), so here
        // we just verify effectiveAssigned reflects the multiplier faithfully.
        const ageProd = { none: 0.5, primary: 1, secondary: 1, tertiary: 1 } as Record<EducationLevelType, number>;
        const slots = [slot('none', 20)]; // e.g. 10 effective needed, 20 bodies at 0.5 prod
        waterFill(slots, supply({ none: 20 }), ageProd, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(20);
        expect(slots[0].effectiveAssigned).toBeCloseTo(10);
    });
});

// ---------------------------------------------------------------------------
// Skill productivity scaling
// ---------------------------------------------------------------------------

describe('waterFill — skill productivity', () => {
    it('scales effectiveAssigned by skillProd', () => {
        const skillProd = { novice: 1.0, professional: 1.5, expert: 2.0 } as Record<Skill, number>;
        const slots = [slot('none', 10)];
        waterFill(
            slots,
            supplyMultiSkill({ none: { professional: 10 } }),
            FLAT_PROD,
            skillProd,
            FLAT_XP_PROD,
            NO_DEMAND,
        );
        expect(slots[0].assigned).toBe(10);
        // 10 professional workers × 1.0 ageProd × 1.5 skillProd = 15
        expect(slots[0].effectiveAssigned).toBeCloseTo(15);
    });

    it('experts are allocated before professionals before novices (most productive first)', () => {
        // One slot (cap 10), supply of 10 workers: 5 expert, 5 novice
        // With flat age prod, expert efficiency = 2.0, novice = 1.0
        // All 10 bodies needed. The equilibrium should use experts first.
        const skillProd = { novice: 1.0, professional: 1.5, expert: 2.0 } as Record<Skill, number>;
        const slots = [slot('none', 10)];
        waterFill(
            slots,
            supplyMultiSkill({ none: { novice: 5, expert: 5 } }),
            FLAT_PROD,
            skillProd,
            FLAT_XP_PROD,
            NO_DEMAND,
        );
        // All 10 assigned (5 expert + 5 novice to fill capacity of 10)
        expect(slots[0].assigned).toBe(10);
        // effectiveAssigned = 5 × 1 × 2.0 + 5 × 1 × 1.0 = 10 + 5 = 15
        expect(slots[0].effectiveAssigned).toBeCloseTo(15);
        expect(slots[0].assignedBySkill.expert).toBe(5);
        expect(slots[0].assignedBySkill.novice).toBe(5);
    });

    it('experts can fill a slot with fewer bodies due to higher efficiency', () => {
        // capacity = 10, ageProd = 1.0, demand = 10 effective units
        // 5 expert workers (skillProd=2.0) → effective = 5 * 2.0 = 10, enough
        const skillProd = { novice: 1.0, professional: 1.5, expert: 2.0 } as Record<Skill, number>;
        const slots = [slot('none', 10)];
        waterFill(slots, supplyMultiSkill({ none: { expert: 5 } }), FLAT_PROD, skillProd, FLAT_XP_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(5);
        expect(slots[0].effectiveAssigned).toBeCloseTo(10);
    });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('waterFill — edge cases', () => {
    it('returns unmodified supply when no slots are provided', () => {
        const { remaining } = waterFill([], supply({ none: 5 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(remaining.none.novice).toBe(5);
    });

    it('returns unmodified supply when all workers are of wrong tier', () => {
        const slots = [slot('secondary', 10)];
        const { remaining } = waterFill(
            slots,
            supply({ none: 10 }),
            FLAT_PROD,
            FLAT_SKILL_PROD,
            FLAT_XP_PROD,
            NO_DEMAND,
        );
        expect(slots[0].assigned).toBe(0);
        expect(remaining.none.novice).toBe(10);
    });

    it('handles zero supply gracefully', () => {
        const slots = [slot('none', 10)];
        waterFill(slots, NO_SUPPLY, FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(0);
    });

    it('handles a slot with capacity 1', () => {
        const slots = [slot('none', 1)];
        waterFill(slots, supply({ none: 5 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(1);
    });

    it('handles byFacility result structure with skill and edu info', () => {
        const slots = [slot('none', 10), slot('primary', 5, 'fac-1')];
        const result = waterFill(
            slots,
            supply({ none: 10, primary: 3 }),
            FLAT_PROD,
            FLAT_SKILL_PROD,
            FLAT_XP_PROD,
            NO_DEMAND,
        );
        const fac0 = result.byFacility.get('fac-0')!;
        const fac1 = result.byFacility.get('fac-1')!;
        // Skill fields
        expect(fac0.totalUsedBySkill.novice).toBe(10);
        expect(fac1.totalUsedBySkill.novice).toBe(3);
        expect(fac0.exactUsedBySkill.novice).toBe(10);
        expect(fac1.exactUsedBySkill.novice).toBe(3);
        // Edu fields
        expect(fac0.totalUsedByEdu.none).toBe(10);
        expect(fac1.totalUsedByEdu.primary).toBe(3);
        expect(fac0.exactUsedByEdu.none).toBe(10);
        expect(fac1.exactUsedByEdu.primary).toBe(3);
        // Overqualified workers matrix — fac-1 has no overqualified workers since only primary assigned
        expect(fac0.overqualifiedWorkers).toEqual({});
        expect(fac1.overqualifiedWorkers).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// XP productivity scaling
// ---------------------------------------------------------------------------

describe('waterFill — XP productivity', () => {
    it('scales effectiveAssigned by xpProd via multiplication with ageProd and skillProd', () => {
        // xpProd=0.5 for none:novice, ageProd=1, skillProd=1 → effective = assigned * 0.5
        const xpProd: Record<EducationLevelType, Record<Skill, number>> = {
            none: { novice: 0.5, professional: 1, expert: 1 },
            primary: { novice: 1, professional: 1, expert: 1 },
            secondary: { novice: 1, professional: 1, expert: 1 },
            tertiary: { novice: 1, professional: 1, expert: 1 },
        };
        const slots = [slot('none', 10)];
        waterFill(slots, supply({ none: 10 }), FLAT_PROD, FLAT_SKILL_PROD, xpProd, NO_DEMAND);
        expect(slots[0].assigned).toBe(10);
        expect(slots[0].effectiveAssigned).toBeCloseTo(10 * 0.5);
    });

    it('combines ageProd, skillProd and xpProd multiplicatively', () => {
        const ageProd = { none: 0.8, primary: 1, secondary: 1, tertiary: 1 } as Record<EducationLevelType, number>;
        const skillProd = { novice: 1.0, professional: 1.5, expert: 2.0 } as Record<Skill, number>;
        const xpProd: Record<EducationLevelType, Record<Skill, number>> = {
            none: { novice: 0.6, professional: 0.6, expert: 0.6 },
            primary: { novice: 1, professional: 1, expert: 1 },
            secondary: { novice: 1, professional: 1, expert: 1 },
            tertiary: { novice: 1, professional: 1, expert: 1 },
        };
        const slots = [slot('none', 5)];
        waterFill(slots, supply({ none: 5 }), ageProd, skillProd, xpProd, NO_DEMAND);
        expect(slots[0].assigned).toBe(5);
        // effective = 5 * 0.8 (age) * 1.0 (skill — novice) * 0.6 (xp) = 5 * 0.48 = 2.4
        expect(slots[0].effectiveAssigned).toBeCloseTo(2.4);
    });

    it('different edu levels have different XP multipliers affecting effectiveAssigned', () => {
        // Two none-slots (cap 10 each), supply: 10 none:novice (xp=1.0) and 5 secondary:novice (xp=0.5)
        // none workers processed first (wi=0): 10 into 20 cap → eq=0.5 → 5 each, eff=5*1*1*1=5
        // secondary workers (wi=2): reachable=[both at 50%], supply=5, width=20
        //   eq = 0.5 + 5/20 = 0.75 → each takes ceil(0.25*10)=3 → 3+2 → 8 and 7
        //   effective per secondary worker = 1*1*0.5 = 0.5
        const xpProd: Record<EducationLevelType, Record<Skill, number>> = {
            none: { novice: 1.0, professional: 1, expert: 1 },
            primary: { novice: 1, professional: 1, expert: 1 },
            secondary: { novice: 0.5, professional: 1, expert: 1 },
            tertiary: { novice: 1, professional: 1, expert: 1 },
        };
        const s0 = slot('none', 10);
        const s1 = slot('none', 10, 'fac-1');
        waterFill(
            [s0, s1],
            supplyMultiSkill({ none: { novice: 10 }, secondary: { novice: 5 } }),
            FLAT_PROD,
            FLAT_SKILL_PROD,
            xpProd,
            NO_DEMAND,
        );
        expect(s0.assigned).toBe(8); // 5 none + 3 secondary
        expect(s1.assigned).toBe(7); // 5 none + 2 secondary
        // effective: 5*1*1*1 + 3*1*1*0.5 = 5 + 1.5 = 6.5
        expect(s0.effectiveAssigned).toBeCloseTo(6.5);
        // effective: 5*1*1*1 + 2*1*1*0.5 = 5 + 1.0 = 6.0
        expect(s1.effectiveAssigned).toBeCloseTo(6.0);
    });
});

// ---------------------------------------------------------------------------
// Worker efficiency (effectiveDemandBySlot)
// ---------------------------------------------------------------------------

describe('waterFill — worker efficiency', () => {
    it('workerEfficiencyOverall is 1 when effectiveAssigned meets or exceeds demand', () => {
        const s = slot('none', 10);
        const demand = new Map<WorkerSlot, number>();
        demand.set(s, 10); // demand = 10 effective
        const result = waterFill([s], supply({ none: 10 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, demand);
        const fac = result.byFacility.get('fac-0')!;
        expect(fac.workerEfficiency.none).toBe(1);
        expect(fac.workerEfficiencyOverall).toBe(1);
    });

    it('workerEfficiencyOverall is the minimum slot efficiency across a facility', () => {
        const s0 = slot('none', 10);
        const s1 = slot('primary', 5, 'fac-0'); // same facility
        // Supply: 5 none (age=1, skill=1, xp=1) → effective = 5
        // Demand: 10 on s0, 5 on s1
        // s0 efficiency = 5/10 = 0.5, s1 efficiency = 0/5 = 0
        // workerEfficiencyOverall = min(0.5, 0) = 0
        const demand = new Map<WorkerSlot, number>();
        demand.set(s0, 10);
        demand.set(s1, 5);
        const result = waterFill([s0, s1], supply({ none: 5 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, demand);
        const fac = result.byFacility.get('fac-0')!;
        expect(fac.workerEfficiency.none).toBeCloseTo(0.5);
        expect(fac.workerEfficiency.primary).toBe(0);
        expect(fac.workerEfficiencyOverall).toBe(0);
    });

    it('workerEfficiencyOverall is 1 when demand is zero (no demand map entry)', () => {
        const slots = [slot('none', 10)];
        const result = waterFill(slots, supply({ none: 5 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        const fac = result.byFacility.get('fac-0')!;
        // No demand → efficiency defaults to 1
        expect(fac.workerEfficiency.none).toBe(1);
        expect(fac.workerEfficiencyOverall).toBe(1);
    });

    it('workerEfficiencyOverall is clamped to max 1 even when effective exceeds demand', () => {
        // With skillProd=2.0 (expert) and demand=10, effective=20 → efficiency should be 1 (capped)
        const skillProd = { novice: 1.0, professional: 1.5, expert: 2.0 } as Record<Skill, number>;
        const s = slot('none', 10);
        const demand = new Map<WorkerSlot, number>();
        demand.set(s, 10);
        const result = waterFill(
            [s],
            supplyMultiSkill({ none: { expert: 10 } }),
            FLAT_PROD,
            skillProd,
            FLAT_XP_PROD,
            demand,
        );
        const fac = result.byFacility.get('fac-0')!;
        // 10 expert × 2.0 = 20 effective, demand=10 → efficiency capped at 1
        expect(fac.workerEfficiency.none).toBe(1);
        expect(fac.workerEfficiencyOverall).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Mixed edu-skill interplay
// ---------------------------------------------------------------------------

describe('waterFill — mixed edu + skill interplay', () => {
    it('allocates skilled workers across multiple tiers and slots with correct priorities', () => {
        // Two slots: none (cap 10) and secondary (cap 5)
        // Supply: 5 secondary:expert (most productive, wi=2, si=2)
        //         5 none:professional (wi=0, si=1)
        //         5 none:novice (wi=0, si=0 — last)
        // Processing order:
        //   none tier (wi=0): professional first (s=expert→professional→novice reverse)
        //     reachable = [none-slot] only (secondary-slot jobEduIdx=2 > wi=0)
        //     5 none:professional → fill none-slot to 5/10 (50%)
        //   none tier: novice next
        //     5 none:novice → reachable=[none-slot at 50%], eq=1.0 → fill to 10/10
        //   secondary tier (wi=2): expert
        //     reachable=[none-slot(full, 10 not < 10), secondary-slot]
        //     Only secondary-slot, 5 expert → fill to 5/5
        const sNone = slot('none', 10);
        const sSec = slot('secondary', 5, 'fac-1');
        const sup = supplyMultiSkill({
            none: { professional: 5, novice: 5 },
            secondary: { expert: 5 },
        });
        waterFill([sNone, sSec], sup, FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(sNone.assigned).toBe(10);
        expect(sNone.assignedByEdu.none).toBe(10);
        expect(sNone.assignedBySkill.professional).toBe(5);
        expect(sNone.assignedBySkill.novice).toBe(5);
        expect(sSec.assigned).toBe(5);
        expect(sSec.assignedByEdu.secondary).toBe(5);
        expect(sSec.assignedBySkill.expert).toBe(5);
        expect(sSec.overqualifiedCount).toBe(0);
    });

    it('overqualified workers from different edu+skill combos fill lower slots', () => {
        // One none-slot (cap 10), supply: 3 secondary:expert, 3 primary:professional
        // Processing order:
        //   secondary (wi=2): expert (si=2) → reachable=[none-slot], 3 assigned
        //   primary (wi=1): professional (si=1) → reachable=[none-slot at 30%], 3 → 60%
        const s = slot('none', 10);
        const sup = supplyMultiSkill({
            primary: { professional: 3 },
            secondary: { expert: 3 },
        });
        waterFill([s], sup, FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(s.assigned).toBe(6);
        expect(s.assignedByEdu.secondary).toBe(3);
        expect(s.assignedBySkill.expert).toBe(3);
        expect(s.assignedByEdu.primary).toBe(3);
        expect(s.assignedBySkill.professional).toBe(3);
        expect(s.overqualifiedCount).toBe(6);
    });
});

// ---------------------------------------------------------------------------
// findEquilibrium edge cases
// ---------------------------------------------------------------------------

describe('waterFill — findEquilibrium edge cases', () => {
    it('returns 1 when supply exceeds total remaining capacity', () => {
        // Single slot at 0/10, supply = 15 (more than capacity)
        const s = slot('none', 10);
        waterFill([s], supply({ none: 15 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(s.assigned).toBe(10);
    });

    it('handles a slot already at capacity (no reachable slots)', () => {
        const s = slot('none', 5);
        s.assigned = 5; // already full
        const { remaining } = waterFill([s], supply({ none: 3 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(s.assigned).toBe(5); // unchanged
        expect(remaining.none.novice).toBe(3); // all supply returned
    });
});
