import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';

export type WorkerSlot = {
    /** Facility id so callers can group results back to their source. */
    facilityId: string;
    /** Discriminates which facility array this slot belongs to. */
    facilityType: 'production' | 'storage' | 'management';
    jobEdu: EducationLevelType;
    jobEduIdx: number;
    capacity: number;
    assigned: number;
    effectiveAssigned: number;
    assignedByEdu: Partial<Record<EducationLevelType, number>>;
    overqualifiedCount: number;
};

export type WaterFillFacilityResult = {
    workerEfficiency: { [edu in EducationLevelType]?: number };
    workerEfficiencyOverall: number;
    totalUsedByEdu: Record<EducationLevelType, number>;
    exactUsedByEdu: Record<EducationLevelType, number>;
    overqualifiedWorkers: {
        [jobEdu in EducationLevelType]?: {
            [workerEdu in EducationLevelType]?: number;
        };
    };
};

export type WaterFillResult = {
    remaining: Record<EducationLevelType, number>;
    byFacility: Map<string, WaterFillFacilityResult>;
};

export function waterFill(
    slots: WorkerSlot[],
    supplyByEdu: Record<EducationLevelType, number>,
    ageProdByEdu: Record<EducationLevelType, number>,
    /** Effective demand per facility slot: `workerRequirement[jobEdu] * scale`.
     *  Required to derive `workerEfficiency` inside waterFill. */
    effectiveDemandBySlot: Map<WorkerSlot, number>,
): WaterFillResult {
    const remaining = { ...supplyByEdu };

    for (let wi = 0; wi < educationLevelKeys.length; wi++) {
        const workerEdu = educationLevelKeys[wi];
        let supply = remaining[workerEdu];
        if (supply <= 0) {
            continue;
        }

        const reachable = slots.filter((s) => s.jobEduIdx <= wi && s.assigned < s.capacity);
        if (reachable.length === 0) {
            continue;
        }

        reachable.sort((a, b) => a.assigned / a.capacity - b.assigned / b.capacity);

        const equilibrium = findEquilibrium(reachable, supply);

        for (const slot of reachable) {
            const currentRatio = slot.assigned / slot.capacity;
            if (currentRatio >= equilibrium) {
                continue;
            }

            const ageProd = ageProdByEdu[workerEdu];
            const take = Math.min(Math.ceil((equilibrium - currentRatio) * slot.capacity), supply);
            if (take <= 0) {
                continue;
            }

            slot.assigned += take;
            slot.effectiveAssigned += take * ageProd;
            slot.assignedByEdu[workerEdu] = (slot.assignedByEdu[workerEdu] ?? 0) + take;
            if (wi > slot.jobEduIdx) {
                slot.overqualifiedCount += take;
            }
            supply -= take;
        }

        remaining[workerEdu] = supply;
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
        const totalUsedByEdu = emptyEduRecord();
        const exactUsedByEdu = emptyEduRecord();
        for (const slot of facilitySlots) {
            for (const [workerEdu, count] of Object.entries(slot.assignedByEdu)) {
                const we = workerEdu as EducationLevelType;
                totalUsedByEdu[we] += count;
                if (we === slot.jobEdu) {
                    exactUsedByEdu[slot.jobEdu] += count;
                }
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
