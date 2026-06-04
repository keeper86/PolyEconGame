import type { Agent, Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import { MIN_WAGE, WAGE_ADJUSTMENT_RATE } from '../constants';
import { ACCEPTABLE_IDLE_FRACTION } from './hireWorkforce';

export function automaticWorkerAllocation(agents: Map<string, Agent>, planet: Planet): void {
    for (const agent of agents.values()) {
        if (!agent.automated && !agent.automateWorkerAllocation) {
            continue;
        }
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }

        const allFacilities = [
            ...assets.productionFacilities,
            ...assets.managementFacilities,
            assets.storageFacility,
            ...assets.shipConstructionFacilities,
        ];

        // 1. Compute total raw requirement per education level
        const totalRequirement: Record<EducationLevelType, number> = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
        for (const facility of allFacilities) {
            for (const [edu, req] of Object.entries(facility.workerRequirement)) {
                if (req && req > 0) {
                    totalRequirement[edu as EducationLevelType] += req * facility.scale;
                }
            }
        }

        // 2. Aggregate usage from all facilities' lastTickResults
        const totalUsed: Record<EducationLevelType, number> = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
        const exactUsed: Record<EducationLevelType, number> = { none: 0, primary: 0, secondary: 0, tertiary: 0 };

        for (const facility of allFacilities) {
            const tick = facility.lastTickResults;
            if (!tick) {
                continue;
            }
            for (const edu of educationLevelKeys) {
                totalUsed[edu] += tick.totalUsedByEdu[edu] ?? 0;
                exactUsed[edu] += tick.exactUsedByEdu[edu] ?? 0;
            }
        }

        // 3. Compute new targets
        const newTarget: Record<EducationLevelType, number> = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
        for (const edu of educationLevelKeys) {
            // Deficit = how many exact‑match workers are missing to fill all slots of this level
            const deficit = Math.max(0, totalRequirement[edu] - exactUsed[edu]);
            // Target = current total usage (including overqualified) + deficit, plus idle buffer
            let target = totalUsed[edu] + deficit;
            target = Math.ceil(target * (1 + ACCEPTABLE_IDLE_FRACTION));
            newTarget[edu] = target;
        }

        // 4. Store the target
        assets.allocatedWorkers = newTarget;
    }
}

export function automaticAdjustmentWages(agents: Map<string, Agent>, planet: Planet): void {
    for (const agent of agents.values()) {
        if (!agent.automated && !agent.automateWorkerAllocation) {
            continue;
        }
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }

        const profitDelta = assets.deposits - assets.monthAcc.depositsAtMonthStart;
        const netBalance = assets.deposits - assets.activeLoans.reduce((sum, loan) => sum + loan.remainingPrincipal, 0);

        if (profitDelta < 0) {
            // Losing money — cut wages, but never below minimum wage
            for (const edu of educationLevelKeys) {
                assets.wagePerEdu[edu as EducationLevelType] = Math.max(
                    MIN_WAGE,
                    assets.wagePerEdu[edu as EducationLevelType] * (1 - WAGE_ADJUSTMENT_RATE),
                );
            }
        } else if (profitDelta > 0 && netBalance > 0) {
            // Profitable — raise wages to attract better workers
            for (const edu of educationLevelKeys) {
                assets.wagePerEdu[edu as EducationLevelType] *= 1 + WAGE_ADJUSTMENT_RATE;
            }
        }
    }
}
