import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import type { FacilityCategory } from './facility';

export type WorkerSlot = {
    facilityId: string;

    facilityType: FacilityCategory;
    jobEdu: EducationLevelType;
    jobEduIdx: number;
    demand: number;
    assigned: number;
    effectiveAssigned: number;
    assignedByEdu: Partial<Record<EducationLevelType, number>>;
    overqualifiedCount: number;
    hrMultiplier: number;
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
    used: number;
    byFacility: Map<string, WaterFillFacilityResult>;
};

export function waterFill(
    slots: WorkerSlot[],
    supplyByEdu: Record<EducationLevelType, number>,
    ageProdByEdu: Record<EducationLevelType, number>,
    xpProdByEdu: Record<EducationLevelType, number>,

    efficiencyDemandBySlot: Map<WorkerSlot, number>,
): WaterFillResult {
    const remaining = {} as Record<EducationLevelType, number>;
    let used = 0;
    for (const edu of educationLevelKeys) {
        remaining[edu] = supplyByEdu[edu];
    }

    const ratioOf = (slot: WorkerSlot): number =>
        slot.demand > 0 ? Math.min(slot.effectiveAssigned / slot.demand, 1) : 1;

    for (let wi = 0; wi < educationLevelKeys.length; wi++) {
        const workerEdu = educationLevelKeys[wi];

        const supply = remaining[workerEdu];
        if (supply <= 0) {
            continue;
        }

        const prodPerBody = ageProdByEdu[workerEdu] * xpProdByEdu[workerEdu];
        if (prodPerBody <= 0) {
            continue;
        }

        const reachable = slots.filter((s) => s.jobEduIdx <= wi && s.effectiveAssigned < s.demand);
        if (reachable.length === 0) {
            continue;
        }

        const widthOf = (slot: WorkerSlot): number => slot.demand / (prodPerBody * slot.hrMultiplier);

        reachable.sort((a, b) => ratioOf(a) - ratioOf(b));

        const equilibrium = findEquilibrium(reachable, supply, ratioOf, widthOf);
        let remainingSupply = supply;

        for (const slot of reachable) {
            const currentRatio = ratioOf(slot);
            if (currentRatio >= equilibrium) {
                continue;
            }

            const take = Math.min(Math.ceil((equilibrium - currentRatio) * widthOf(slot)), remainingSupply);
            if (take <= 0) {
                continue;
            }

            slot.assigned += take;
            slot.effectiveAssigned += take * prodPerBody * slot.hrMultiplier;
            slot.assignedByEdu[workerEdu] = (slot.assignedByEdu[workerEdu] ?? 0) + take;
            if (wi > slot.jobEduIdx) {
                slot.overqualifiedCount += take;
            }
            remainingSupply -= take;
            used += take;
        }

        remaining[workerEdu] = remainingSupply;
    }

    const facilityIds = new Set(slots.map((s) => s.facilityId));
    const byFacility = new Map<string, WaterFillFacilityResult>();

    for (const fi of facilityIds) {
        const facilitySlots = slots.filter((s) => s.facilityId === fi);

        const workerEfficiency: { [edu in EducationLevelType]?: number } = {};
        let workerEfficiencyOverall = 1;
        for (const slot of facilitySlots) {
            const demand = efficiencyDemandBySlot.get(slot) ?? 0;
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

    return { remaining, used, byFacility };
}

function findEquilibrium(
    sortedSlots: WorkerSlot[],
    supply: number,
    ratioOf: (slot: WorkerSlot) => number,
    widthOf: (slot: WorkerSlot) => number,
): number {
    let supplyLeft = supply;
    let totalWidth = 0;

    for (let i = 0; i < sortedSlots.length; i++) {
        const slot = sortedSlots[i];
        totalWidth += widthOf(slot);

        const currentRatio = ratioOf(slot);
        const nextRatio = i + 1 < sortedSlots.length ? ratioOf(sortedSlots[i + 1]) : 1;

        const stepTop = Math.max(currentRatio, nextRatio);
        const stepHeight = Math.max(0, stepTop - currentRatio);
        if (stepHeight <= 0) {
            continue;
        }

        const needed = stepHeight * totalWidth;
        if (supplyLeft <= needed) {
            return totalWidth > 0 ? currentRatio + supplyLeft / totalWidth : currentRatio;
        }
        supplyLeft -= needed;
    }

    return 1;
}
