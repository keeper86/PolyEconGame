import { TICKS_PER_YEAR } from '../constants';
import { leaseClaim, reduceClaim } from './claims';
import type { GameState, Planet } from './planet';

export const NON_RENEWABLE_SAFETY_MARGIN_IN_TICKS = TICKS_PER_YEAR;
export const OVER_SUPPLIED_LIMIT = 1.5;

export function updateAgentClaims(gameState: GameState, planet: Planet): void {
    for (const agent of gameState.agents.values()) {
        if (!agent.automated) {
            continue;
        }
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }

        const requiredByResource = new Map<string, number>();

        for (const facility of assets.productionFacilities) {
            for (const need of facility.needs) {
                if (need.resource.form !== 'landBoundResource') {
                    continue;
                }
                const existing = requiredByResource.get(need.resource.name) ?? 0;
                requiredByResource.set(need.resource.name, existing + need.quantity * facility.maxScale);
            }
        }

        for (const [resourceName, required] of requiredByResource) {
            if (required <= 0) {
                continue;
            }

            const entry = planet.resources[resourceName];
            if (!entry) {
                continue;
            }

            const agentClaims = entry.claims.filter((c) => c.tenantAgentId === agent.id);
            const isRenewable = entry.pool.regenerationRate > 0;

            let shortfall: number;
            if (isRenewable) {
                const currentCapacity = agentClaims.reduce((sum, c) => sum + c.regenerationRate, 0);
                shortfall = required - currentCapacity;
            } else {
                const currentCapacityInTicks = agentClaims.reduce((sum, c) => sum + c.quantity, 0) / required;
                shortfall = (NON_RENEWABLE_SAFETY_MARGIN_IN_TICKS - currentCapacityInTicks) * required;
            }

            if (shortfall <= 0) {
                // Negative shortfall means oversupply. Reduce claim if oversupplied beyond limit.
                if (shortfall < -(OVER_SUPPLIED_LIMIT - 1) * required && agentClaims.length > 0) {
                    // Excess above 1x requirement
                    const excess = Math.floor(Math.abs(shortfall));
                    const currentClaimQuantity = agentClaims.reduce((sum, c) => sum + c.maximumCapacity, 0);
                    const toReduce = Math.min(excess, currentClaimQuantity);
                    if (toReduce > 0) {
                        const result = reduceClaim(gameState, agent.id, planet.id, resourceName, toReduce);
                        if (result.ok) {
                            console.log(
                                `[auto-claim] Agent ${agent.id} auto-reduced claim by ${toReduce} of ${resourceName}` +
                                    ` (required ${required}, oversupply ${Math.abs(shortfall)})`,
                            );
                        }
                    }
                }
                continue;
            }

            const availableInPool = isRenewable
                ? Math.max(0, entry.pool.maximumCapacity)
                : Math.max(0, entry.pool.quantity);

            const toAcquire = Math.min(Math.ceil(shortfall), availableInPool);
            if (toAcquire <= 0) {
                continue;
            }

            const result = leaseClaim(gameState, agent.id, planet.id, resourceName, toAcquire);
            if (result.ok) {
                console.debug(
                    `[auto-claim] Agent ${agent.id} auto-leased ${toAcquire} of ${resourceName}` +
                        ` (required ${required}, had ${shortfall})`,
                );
            } else {
                console.debug(
                    `[auto-claim] Agent ${agent.id} auto-lease failed for ${toAcquire} of ${resourceName}` +
                        ` (required ${required}, had ${shortfall}). Reason: ${result.reason}`,
                );
            }
        }
    }
}
