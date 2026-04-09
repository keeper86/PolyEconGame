import type { Agent, Planet } from './planet';
import { collapseUntenantedClaims } from './claims';
import { TICKS_PER_MONTH } from '../constants';

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
                entry.pausedSinceTick = null;
                needsCollapse = true;
                continue;
            }

            // Auto-terminate if paused for >= 1 month
            if (
                entry.claimStatus === 'paused' &&
                entry.pausedSinceTick !== null &&
                tick - entry.pausedSinceTick >= TICKS_PER_MONTH
            ) {
                entry.noticePeriodEndsAtTick = tick + TICKS_PER_MONTH; // Set notice period to 1 month from now
            }

            const isTerminating = entry.noticePeriodEndsAtTick !== null;
            const agent = agents.get(entry.tenantAgentId);
            const assets = agent?.assets[planet.id];
            if (!assets) {
                continue;
            }

            if (assets.deposits >= entry.costPerTick) {
                if (entry.claimStatus === 'paused') {
                    entry.claimStatus = 'active';
                    entry.pausedSinceTick = null;
                }
                assets.deposits -= entry.costPerTick;
                const govAssets = agents.get(planet.governmentId)?.assets[planet.id];
                if (govAssets) {
                    govAssets.deposits += entry.costPerTick;
                }
            } else if (!isTerminating) {
                if (entry.claimStatus === 'active') {
                    entry.pausedSinceTick = tick;
                }
                entry.claimStatus = 'paused';
            }
        }

        if (needsCollapse) {
            collapseUntenantedClaims(planet, resourceName);
        }
    }
}
