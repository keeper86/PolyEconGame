import { describe, expect, it } from 'vitest';
import type { EducationLevelType } from '../population/education';
import { type Skill } from '../population/population';
import type { WorkerSlot } from './waterFill';
import { waterFill } from './waterFill';

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

const NO_DEMAND = new Map<WorkerSlot, number>();

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

describe('waterFill — equilibrium', () => {
    it('equalises fill ratio across two same-capacity slots', () => {
        const slots = [slot('none', 10), slot('none', 10, 'fac-1')];
        waterFill(slots, supply({ none: 10 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);

        expect(slots[0].assigned).toBe(5);
        expect(slots[1].assigned).toBe(5);
    });

    it('equalises fill ratio across different-capacity slots', () => {
        const slots = [slot('none', 6), slot('none', 10, 'fac-1')];
        waterFill(slots, supply({ none: 8 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(3);
        expect(slots[1].assigned).toBe(5);
    });

    it('fills all slots to 100% when there is enough supply', () => {
        const slots = [slot('none', 4), slot('none', 6, 'fac-1')];
        waterFill(slots, supply({ none: 10 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(4);
        expect(slots[1].assigned).toBe(6);
    });

    it('raises the lower slot to the level of the higher before equalising further', () => {
        const a = slot('none', 10);
        const b = slot('none', 10, 'fac-1');
        b.assigned = 4;

        waterFill([a, b], supply({ none: 6 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(a.assigned).toBe(5);
        expect(b.assigned).toBe(5);
    });
});

describe('waterFill — multiple tiers', () => {
    it('lower tier fills its own slots first; higher tier fills the remainder', () => {
        const slots = [slot('none', 10)];
        waterFill(slots, supply({ none: 6, primary: 4 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(10);
        expect(slots[0].assignedByEdu.none).toBe(6);
        expect(slots[0].assignedByEdu.primary).toBe(4);
        expect(slots[0].overqualifiedCount).toBe(4);
    });

    it('higher-tier workers are spread across all reachable under-filled slots', () => {
        const none6 = slot('none', 6);
        const sec10 = slot('secondary', 10, 'fac-1');
        waterFill([none6, sec10], supply({ secondary: 10 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(none6.assigned).toBe(4);
        expect(sec10.assigned).toBe(6);
        expect(none6.overqualifiedCount).toBe(4);
        expect(sec10.overqualifiedCount).toBe(0);
    });

    it('higher-tier workers spread across all reachable slots including partially-filled ones', () => {
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
        waterFill(slots, supply({ none: 10 }), ageProd, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(slots[0].effectiveAssigned).toBeCloseTo(10 * 0.8);
    });

    it('assigns extra bodies when ageProd < 1 to compensate', () => {
        const ageProd = { none: 0.5, primary: 1, secondary: 1, tertiary: 1 } as Record<EducationLevelType, number>;
        const slots = [slot('none', 20)];
        waterFill(slots, supply({ none: 20 }), ageProd, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(20);
        expect(slots[0].effectiveAssigned).toBeCloseTo(10);
    });
});

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

        expect(slots[0].effectiveAssigned).toBeCloseTo(15);
    });

    it('experts are allocated before professionals before novices (most productive first)', () => {
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

        expect(slots[0].assigned).toBe(10);

        expect(slots[0].effectiveAssigned).toBeCloseTo(15);
        expect(slots[0].assignedBySkill.expert).toBe(5);
        expect(slots[0].assignedBySkill.novice).toBe(5);
    });

    it('experts can fill a slot with fewer bodies due to higher efficiency', () => {
        const skillProd = { novice: 1.0, professional: 1.5, expert: 2.0 } as Record<Skill, number>;
        const slots = [slot('none', 10)];
        waterFill(slots, supplyMultiSkill({ none: { expert: 5 } }), FLAT_PROD, skillProd, FLAT_XP_PROD, NO_DEMAND);
        expect(slots[0].assigned).toBe(5);
        expect(slots[0].effectiveAssigned).toBeCloseTo(10);
    });
});

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

        expect(fac0.totalUsedBySkill.novice).toBe(10);
        expect(fac1.totalUsedBySkill.novice).toBe(3);
        expect(fac0.exactUsedBySkill.novice).toBe(10);
        expect(fac1.exactUsedBySkill.novice).toBe(3);

        expect(fac0.totalUsedByEdu.none).toBe(10);
        expect(fac1.totalUsedByEdu.primary).toBe(3);
        expect(fac0.exactUsedByEdu.none).toBe(10);
        expect(fac1.exactUsedByEdu.primary).toBe(3);

        expect(fac0.overqualifiedWorkers).toEqual({});
        expect(fac1.overqualifiedWorkers).toEqual({});
    });
});

describe('waterFill — XP productivity', () => {
    it('scales effectiveAssigned by xpProd via multiplication with ageProd and skillProd', () => {
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

        expect(slots[0].effectiveAssigned).toBeCloseTo(2.4);
    });

    it('different edu levels have different XP multipliers affecting effectiveAssigned', () => {
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
        expect(s0.assigned).toBe(8);
        expect(s1.assigned).toBe(7);

        expect(s0.effectiveAssigned).toBeCloseTo(6.5);

        expect(s1.effectiveAssigned).toBeCloseTo(6.0);
    });
});

describe('waterFill — worker efficiency', () => {
    it('workerEfficiencyOverall is 1 when effectiveAssigned meets or exceeds demand', () => {
        const s = slot('none', 10);
        const demand = new Map<WorkerSlot, number>();
        demand.set(s, 10);
        const result = waterFill([s], supply({ none: 10 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, demand);
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

        expect(fac.workerEfficiency.none).toBe(1);
        expect(fac.workerEfficiencyOverall).toBe(1);
    });

    it('workerEfficiencyOverall is clamped to max 1 even when effective exceeds demand', () => {
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

        expect(fac.workerEfficiency.none).toBe(1);
        expect(fac.workerEfficiencyOverall).toBe(1);
    });
});

describe('waterFill — mixed edu + skill interplay', () => {
    it('allocates skilled workers across multiple tiers and slots with correct priorities', () => {
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

describe('waterFill — findEquilibrium edge cases', () => {
    it('returns 1 when supply exceeds total remaining capacity', () => {
        const s = slot('none', 10);
        waterFill([s], supply({ none: 15 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(s.assigned).toBe(10);
    });

    it('handles a slot already at capacity (no reachable slots)', () => {
        const s = slot('none', 5);
        s.assigned = 5;
        const { remaining } = waterFill([s], supply({ none: 3 }), FLAT_PROD, FLAT_SKILL_PROD, FLAT_XP_PROD, NO_DEMAND);
        expect(s.assigned).toBe(5);
        expect(remaining.none.novice).toBe(3);
    });
});
