import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import { SKILL, type Skill } from '../population/population';
import type { FacilityCategory } from './facility';

export type WorkerSlot = {
    /** Facility id so callers can group results back to their source. */
    facilityId: string;
    /** Discriminates which facility array this slot belongs to. */
    facilityType: FacilityCategory;
    jobEdu: EducationLevelType;
    jobEduIdx: number;
    capacity: number;
    assigned: number;
    effectiveAssigned: number;
    assignedByEdu: Partial<Record<EducationLevelType, number>>;
    assignedBySkill: Partial<Record<Skill, number>>;
    overqualifiedCount: number;
};

export type WaterFillFacilityResult = {
    workerEfficiency: { [edu in EducationLevelType]?: number };
    workerEfficiencyOverall: number;
    totalUsedByEdu: Record<EducationLevelType, number>;
    exactUsedByEdu: Record<EducationLevelType, number>;
    totalUsedBySkill: Record<Skill, number>;
    exactUsedBySkill: Record<Skill, number>;
    overqualifiedWorkers: {
        [jobEdu in EducationLevelType]?: {
            [workerEdu in EducationLevelType]?: number;
        };
    };
};

export type WaterFillResult = {
    remaining: Record<EducationLevelType, Record<Skill, number>>;
    byFacility: Map<string, WaterFillFacilityResult>;
};

export function waterFill(
    slots: WorkerSlot[],
    supplyByEduSkill: Record<EducationLevelType, Record<Skill, number>>,
    ageProdByEdu: Record<EducationLevelType, number>,
    skillProdBySkill: Record<Skill, number>,
    xpProdByEduSkill: Record<EducationLevelType, Record<Skill, number>>,
    /** Effective demand per facility slot: `workerRequirement[jobEdu] * scale`.
     *  Required to derive `workerEfficiency` inside waterFill. */
    effectiveDemandBySlot: Map<WorkerSlot, number>,
): WaterFillResult {
    // Deep-copy the supply so we can mutate it
    const remaining = {} as Record<EducationLevelType, Record<Skill, number>>;
    for (const edu of educationLevelKeys) {
        remaining[edu] = { ...supplyByEduSkill[edu] };
    }

    for (let wi = 0; wi < educationLevelKeys.length; wi++) {
        const workerEdu = educationLevelKeys[wi];

        // Process skills from most productive to least productive:
        // expert → professional → novice (reverse of the SKILL array)
        for (let si = SKILL.length - 1; si >= 0; si--) {
            const workerSkill = SKILL[si];
            const supply = remaining[workerEdu][workerSkill];
            if (supply <= 0) {
                continue;
            }

            const reachable = slots.filter((s) => s.jobEduIdx <= wi && s.assigned < s.capacity);
            if (reachable.length === 0) {
                continue;
            }

            reachable.sort((a, b) => a.assigned / a.capacity - b.assigned / b.capacity);

            const equilibrium = findEquilibrium(reachable, supply);
            let remainingSupply = supply;

            for (const slot of reachable) {
                const currentRatio = slot.assigned / slot.capacity;
                if (currentRatio >= equilibrium) {
                    continue;
                }

                const ageProd = ageProdByEdu[workerEdu];
                const skillProd = skillProdBySkill[workerSkill];
                const xpProd = xpProdByEduSkill[workerEdu][workerSkill];
                const take = Math.min(Math.ceil((equilibrium - currentRatio) * slot.capacity), remainingSupply);
                if (take <= 0) {
                    continue;
                }

                slot.assigned += take;
                slot.effectiveAssigned += take * ageProd * skillProd * xpProd;
                slot.assignedByEdu[workerEdu] = (slot.assignedByEdu[workerEdu] ?? 0) + take;
                slot.assignedBySkill[workerSkill] = (slot.assignedBySkill[workerSkill] ?? 0) + take;
                if (wi > slot.jobEduIdx) {
                    slot.overqualifiedCount += take;
                }
                remainingSupply -= take;
            }

            remaining[workerEdu][workerSkill] = remainingSupply;
        }
    }

    // Collect the unique facility ids present in the slot list
    const facilityIds = new Set(slots.map((s) => s.facilityId));
    const byFacility = new Map<string, WaterFillFacilityResult>();

    for (const fi of facilityIds) {
        const facilitySlots = slots.filter((s) => s.facilityId === fi);

        const workerEfficiency: { [edu in EducationLevelType]?: number } = {};
        let workerEfficiencyOverall = 1;
        for (const slot of facilitySlots) {
            const demand = effectiveDemandBySlot.get(slot) ?? 0;
            const slotEfficiency = demand > 0 ? Math.min(1, slot.effectiveAssigned / demand) : 1;
            workerEfficiency[slot.jobEdu] = slotEfficiency;
            workerEfficiencyOverall = Math.min(workerEfficiencyOverall, slotEfficiency);
        }

        const emptyEduRecord = (): Record<EducationLevelType, number> => ({
            none: 0,
            primary: 0,
            secondary: 0,
            tertiary: 0,
        });
        const emptySkillRecord = (): Record<Skill, number> => ({
            novice: 0,
            professional: 0,
            expert: 0,
        });
        const totalUsedByEdu = emptyEduRecord();
        const exactUsedByEdu = emptyEduRecord();
        const totalUsedBySkill = emptySkillRecord();
        const exactUsedBySkill = emptySkillRecord();
        for (const slot of facilitySlots) {
            for (const [workerEdu, count] of Object.entries(slot.assignedByEdu)) {
                const we = workerEdu as EducationLevelType;
                totalUsedByEdu[we] += count;
                if (we === slot.jobEdu) {
                    exactUsedByEdu[slot.jobEdu] += count;
                }
            }
            for (const [workerSkill, count] of Object.entries(slot.assignedBySkill)) {
                const ws = workerSkill as Skill;
                totalUsedBySkill[ws] += count;
                exactUsedBySkill[ws] += count;
            }
        }

        type OQBreakdown = { [workerEdu in EducationLevelType]?: number };
        type OQMatrix = { [jobEdu in EducationLevelType]?: OQBreakdown };
        const overqualifiedWorkers: OQMatrix = {};
        for (const slot of facilitySlots) {
            if (slot.overqualifiedCount <= 0) {
                continue;
            }
            const breakdown: OQBreakdown = {};
            for (const [workerEdu, count] of Object.entries(slot.assignedByEdu)) {
                const workerIdx = educationLevelKeys.indexOf(workerEdu as EducationLevelType);
                if (workerIdx > slot.jobEduIdx && count && count > 0) {
                    breakdown[workerEdu as EducationLevelType] = count;
                }
            }
            if (Object.keys(breakdown).length > 0) {
                overqualifiedWorkers[slot.jobEdu] = breakdown;
            }
        }

        byFacility.set(fi, {
            workerEfficiency,
            workerEfficiencyOverall,
            totalUsedByEdu,
            exactUsedByEdu,
            totalUsedBySkill,
            exactUsedBySkill,
            overqualifiedWorkers,
        });
    }

    return { remaining, byFacility };
}

/**
 * Finds the equilibrium fill ratio reachable with `supply` workers across
 * the given slots (pre-sorted by ascending fill ratio).
 */
function findEquilibrium(sortedSlots: WorkerSlot[], supply: number): number {
    let supplyLeft = supply;
    let totalWidth = 0;

    for (let i = 0; i < sortedSlots.length; i++) {
        const slot = sortedSlots[i];
        totalWidth += slot.capacity;

        const currentRatio = slot.assigned / slot.capacity;
        const nextRatio = i + 1 < sortedSlots.length ? sortedSlots[i + 1].assigned / sortedSlots[i + 1].capacity : 1;

        const stepTop = Math.max(currentRatio, nextRatio);
        const stepHeight = Math.max(0, stepTop - currentRatio);
        if (stepHeight <= 0) {
            continue;
        }

        const needed = stepHeight * totalWidth;
        if (supplyLeft <= needed) {
            return currentRatio + supplyLeft / totalWidth;
        }
        supplyLeft -= needed;
    }

    return 1;
}
