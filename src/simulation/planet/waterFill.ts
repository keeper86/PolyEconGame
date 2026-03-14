import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';

/**
 * A single worker slot (one education level within one facility).
 * Capacity is in headcount ("bodies") already adjusted for age productivity
 * and resource availability — so filling to `capacity` means 100% efficiency.
 */
export type WorkerSlot = {
    /** Opaque tag so callers can group results back to their source. */
    facilityIdx: number;
    jobEdu: EducationLevelType;
    jobEduIdx: number;
    /** Bodies needed for 100% efficiency (resource- and age-adjusted). */
    capacity: number;
    /** Bodies assigned so far. Mutated by waterFill. */
    assigned: number;
    /** assigned × ageProd. Mutated by waterFill. */
    effectiveAssigned: number;
    /** How many bodies were assigned from each worker tier. */
    assignedByEdu: Partial<Record<EducationLevelType, number>>;
    /** Bodies assigned from a tier above jobEduIdx (overqualified). */
    overqualifiedCount: number;
};

/** Per-facility aggregates derived directly from the filled WorkerSlots. */
export type WaterFillFacilityResult = {
    /** Worker fill rate per job education level (fraction of effective demand met). */
    workerEfficiency: { [edu in EducationLevelType]?: number };
    /** Minimum of all per-slot worker efficiencies (bottleneck). */
    workerEfficiencyOverall: number;
    /** Total bodies drawn from each worker-edu tier across all slots. */
    totalUsedByEdu: Record<EducationLevelType, number>;
    /** Bodies filling exactly-matching job slots per job-edu tier. */
    exactUsedByEdu: Record<EducationLevelType, number>;
    /** Overqualified workers per job-edu tier, broken down by worker-edu. */
    overqualifiedWorkers: {
        [jobEdu in EducationLevelType]?: {
            [workerEdu in EducationLevelType]?: number;
        };
    };
};

/** Return value of {@link waterFill}. */
export type WaterFillResult = {
    /** Remaining (unused) supply per education tier. */
    remaining: Record<EducationLevelType, number>;
    /** Per-facility aggregates, keyed by `facilityIdx`. */
    byFacility: Map<number, WaterFillFacilityResult>;
};

/**
 * Distributes workers across slots to maximise the minimum fill ratio
 * (communicating-vessels / water-filling).
 *
 * For each worker tier (lowest-first) all reachable under-filled slots are
 * raised to a common equilibrium level before moving to the next tier.
 * "Reachable" means jobEduIdx ≤ workerEduIdx.
 *
 * Mutates `slots` in place.
 * Returns the remaining unused supply per tier **and** per-facility aggregates.
 */
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

    // Collect the unique facility indices present in the slot list
    const facilityIndices = new Set(slots.map((s) => s.facilityIdx));
    const byFacility = new Map<number, WaterFillFacilityResult>();

    for (const fi of facilityIndices) {
        const facilitySlots = slots.filter((s) => s.facilityIdx === fi);

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
