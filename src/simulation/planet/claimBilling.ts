import type { Agent, Planet } from './planet';
import { collapseUntenantedClaims } from './claims';

export function claimBillingTick(agents: Map<string, Agent>, planet: Planet, tick: number): void {
    for (const resourceName of Object.keys(planet.resources)) {
        const entries = planet.resources[resourceName]!;
        let needsCollapse = false;

        for (const entry of entries) {
            if (entry.tenantAgentId === null || entry.regenerationRate <= 0) {
                continue;
            }

            if (
                entry.claimStatus === 'terminating' &&
                entry.noticePeriodEndsAtTick !== null &&
                tick >= entry.noticePeriodEndsAtTick
            ) {
                entry.tenantAgentId = null;
                entry.costPerTick = 0;
                entry.claimStatus = 'active';
                entry.noticePeriodEndsAtTick = null;
                needsCollapse = true;
                continue;
            }

            const agent = agents.get(entry.tenantAgentId);
            const assets = agent?.assets[planet.id];
            if (!assets) {
                continue;
            }

            if (assets.deposits >= entry.costPerTick) {
                if (entry.claimStatus === 'paused') {
                    entry.claimStatus = 'active';
                }
                assets.deposits -= entry.costPerTick;
                const govAssets = agents.get(planet.governmentId)?.assets[planet.id];
                if (govAssets) {
                    govAssets.deposits += entry.costPerTick;
                }
            } else {
                entry.claimStatus = 'paused';
            }
        }

        if (needsCollapse) {
            collapseUntenantedClaims(planet, resourceName);
        }
    }
}
