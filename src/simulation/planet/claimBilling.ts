import type { Agent, Planet } from './planet';
import { collapseUntenantedClaims } from './claims';
import { TICKS_PER_MONTH } from '../constants';

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

            // Auto-terminate if paused for >= 31 accumulated days in a year
            if (
                entry.claimStatus === 'paused' &&
                entry.pausedTicksThisYear >= PAUSED_DAYS_TERMINATION_THRESHOLD &&
                entry.noticePeriodEndsAtTick === null
            ) {
                entry.noticePeriodEndsAtTick = tick + TICKS_PER_MONTH; // Set notice period to 1 month from now
            }

            const isTerminating = entry.noticePeriodEndsAtTick !== null;
            const agent = agents.get(entry.tenantAgentId);
            const assets = agent?.assets[planet.id];
            if (!assets) {
                continue;
            }

            if (assets.deposits < entry.costPerTick && agent.automated) {
                const shortfall = entry.costPerTick - assets.deposits;
                // Record aggregate bank loan and per-agent loan principal
                planet.bank.loans += shortfall;
                planet.bank.deposits += shortfall;
                assets.deposits += shortfall;
                assets.loans += shortfall;
            }

            if (assets.deposits >= entry.costPerTick) {
                if (entry.claimStatus === 'paused') {
                    entry.claimStatus = 'active';
                }
                assets.deposits -= entry.costPerTick;
                assets.monthAcc.claimPayments += entry.costPerTick;
                const govAssets = agents.get(planet.governmentId)?.assets[planet.id];
                if (govAssets) {
                    govAssets.deposits += entry.costPerTick;
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
    }
}
