import { TICKS_PER_MONTH } from '../constants';
import { grantLoan } from '../financial/loanTypes';
import { collapseUntenantedClaims } from './claims';
import type { Agent, Planet } from './planet';

const PAUSED_DAYS_TERMINATION_THRESHOLD = 31;

export function claimBillingTick(agents: Map<string, Agent>, planet: Planet, tick: number): void {
    for (const resourceName of Object.keys(planet.resources)) {
        const entries = planet.resources[resourceName]!;
        let needsCollapse = false;

        for (const entry of entries) {
            if (entry.tenantAgentId === null || entry.regenerationRate <= 0) {
                continue;
            }

            if (entry.noticePeriodEndsAtTick !== null && tick >= entry.noticePeriodEndsAtTick) {
                entry.tenantAgentId = null;
                entry.costPerTick = 0;
                entry.claimStatus = 'active';
                entry.noticePeriodEndsAtTick = null;
                entry.pausedTicksThisYear = 0;
                needsCollapse = true;
                continue;
            }

            if (
                entry.claimStatus === 'paused' &&
                entry.pausedTicksThisYear >= PAUSED_DAYS_TERMINATION_THRESHOLD &&
                entry.noticePeriodEndsAtTick === null
            ) {
                entry.noticePeriodEndsAtTick = tick + TICKS_PER_MONTH;
            }

            const isTerminating = entry.noticePeriodEndsAtTick !== null;
            const agent = agents.get(entry.tenantAgentId);
            const assets = agent?.assets[planet.id];
            if (!assets) {
                console.warn(
                    `Agent ${agent?.name}/${agent?.id} has no asset record for planet ${planet.name}; looking for tenant ${entry.tenantAgentId}`,
                );
                continue;
            }

            const cost = (entry.costPerTick / entry.maximumCapacity) * (entry.maximumCapacity - entry.quantity);

            if (assets.deposits < cost && agent.automated) {
                const shortfall = cost * TICKS_PER_MONTH - assets.deposits;
                grantLoan(assets, planet.bank, shortfall, 'claimCoverage', tick);
            }

            if (assets.deposits >= cost) {
                if (entry.claimStatus === 'paused') {
                    entry.claimStatus = 'active';
                }
                assets.deposits -= cost;
                assets.monthAcc.claimPayments += cost;
                const govAssets = agents.get(planet.governmentId)?.assets[planet.id];
                if (govAssets) {
                    govAssets.deposits += cost;
                }
            } else if (!isTerminating) {
                entry.claimStatus = 'paused';
                entry.pausedTicksThisYear += 1;
                if (entry.pausedTicksThisYear >= PAUSED_DAYS_TERMINATION_THRESHOLD) {
                    entry.noticePeriodEndsAtTick = tick + TICKS_PER_MONTH;
                }
            }
        }

        if (needsCollapse) {
            collapseUntenantedClaims(planet, resourceName);
        }

        let totalCost = 0;
        let totalUnits = 0;
        for (const entry of entries) {
            if (entry.tenantAgentId === null) {
                continue;
            }
            if (entry.regenerationRate > 0) {
                totalCost += entry.costPerTick;
                totalUnits += entry.quantity;
            } else {
                totalCost += entry.tenantCostInCoins;
                totalUnits += entry.maximumCapacity;
            }
        }
        if (totalUnits > 0) {
            planet.landBoundCostPerUnit[resourceName] = totalCost / totalUnits;
        }
    }
}
