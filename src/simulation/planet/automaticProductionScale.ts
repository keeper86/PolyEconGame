import { FIRM_INVENTORY_TARGET_TICKS, OUTPUT_BUFFER_MAX_TICKS } from '../constants';
import type { Agent, Planet } from './planet';
import { queryStorageFacility } from './storage';

/**
 * Automatically adjusts the `scale` of each production facility for automated
 * agents based on their output buffer levels.
 *
 * Rules (per facility, automated agents only):
 *
 * - If ALL storable outputs have inventory >= OUTPUT_BUFFER_MAX_TICKS × output/tick,
 *   reduce scale by 1 (floors at 0). The agent is over-producing and holding a
 *   large buffer — it should idle one unit of capacity.
 *
 * - If scale < maxScale AND ALL storable outputs have inventory <
 *   FIRM_INVENTORY_TARGET_TICKS × output/tick, increase scale by 1. Inventory
 *   is below the desired buffer, so ramp up production.
 *
 * - Facilities that only produce services are always set to maxScale. Services
 *   are 1-tick-lived (inventory is zeroed before each production tick) and never
 *   accumulate a buffer, so buffer-based logic does not apply.
 *
 * Scale constraints enforced: 0 ≤ scale ≤ maxScale, scale is an integer.
 * Called every tick so scale ramps up/down by at most 1 per tick.
 */
export function updateAgentProductionScale(agents: Map<string, Agent>, planet: Planet): void {
    agents.forEach((agent) => {
        if (!agent.automated) {
            return;
        }

        const assets = agent.assets[planet.id];
        if (!assets) {
            return;
        }

        for (const facility of assets.productionFacilities) {
            const storableOutputs = facility.produces.filter(({ resource }) => resource.form !== 'services');

            // Pure service facilities: always run at maximum capacity
            if (storableOutputs.length === 0) {
                facility.scale = facility.maxScale;
                continue;
            }

            // When scale is 0 the facility is idle; use 1 as the reference for
            // threshold calculations so the comparisons remain meaningful.
            const effectiveScale = Math.max(1, facility.scale);

            // Scale DOWN: every storable output buffer is full
            const allOverBuffered = storableOutputs.every(({ resource, quantity }) => {
                const inventory = queryStorageFacility(assets.storageFacility, resource.name);
                return inventory >= quantity * effectiveScale * OUTPUT_BUFFER_MAX_TICKS;
            });

            if (allOverBuffered) {
                facility.scale = Math.max(0, facility.scale - 1);
                continue;
            }

            // Scale UP: every storable output is below the desired inventory target
            if (facility.scale < facility.maxScale) {
                const allUnderStocked = storableOutputs.every(({ resource, quantity }) => {
                    const inventory = queryStorageFacility(assets.storageFacility, resource.name);
                    return inventory < quantity * effectiveScale * FIRM_INVENTORY_TARGET_TICKS;
                });

                if (allUnderStocked) {
                    facility.scale = Math.min(facility.maxScale, facility.scale + 1);
                }
            }
        }
    });
}
