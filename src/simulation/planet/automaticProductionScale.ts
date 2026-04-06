import { OUTPUT_BUFFER_MAX_TICKS } from '../constants';
import type { Agent, Planet } from './planet';
import { queryStorageFacility } from './facility';

/**
 * Automatically adjusts the `scale` of each production facility for automated
 * agents based on their output buffer levels and service market data.
 *
 * Rules (per facility, automated agents only):
 *
 * - SNAP UP: If any storable output has inventory === 0, OR any service output
 *   had unfilledDemand > 0 last tick (or has no market data yet), snap scale
 *   immediately to maxScale.
 *
 * - SCALE DOWN: If ALL storable outputs have inventory >= OUTPUT_BUFFER_MAX_TICKS
 *   × output/tick AND all service outputs had unsoldSupply > 0 last tick,
 *   reduce scale by 1 (floors at 0). Gradual, one step per tick.
 *
 * - Otherwise scale is unchanged.
 *
 * For vacuous cases: an all-storable facility ignores service conditions
 * (allServicesOverSupplied is vacuously true), and an all-service facility
 * ignores storable inventory (allStorablesOverBuffered is vacuously true).
 *
 * Scale constraints enforced: 0 ≤ scale ≤ maxScale, scale is an integer.
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
            const serviceOutputs = facility.produces.filter(({ resource }) => resource.form === 'services');

            // Shortage: any storable output is completely depleted — snap to full production
            const storableShortage = storableOutputs.some(({ resource }) => {
                const inventory = queryStorageFacility(assets.storageFacility, resource.name);
                return inventory === 0;
            });

            // Service shortage: any service had unfilled demand last tick, or has no market
            // history yet (first tick after startup — treat as shortage for safety)
            const serviceShortage = serviceOutputs.some(({ resource }) => {
                const result = planet.lastMarketResult[resource.name];
                return !result || result.unfilledDemand > 0;
            });

            if (storableShortage || serviceShortage) {
                facility.scale = facility.maxScale;
                continue;
            }

            // When scale is 0 the facility is idle; use 1 as the reference for
            // threshold calculations so the comparisons remain meaningful.
            const effectiveScale = Math.max(1, facility.scale);

            // Scale DOWN: every storable output buffer is full AND every service is over-supplied
            const allStorablesOverBuffered = storableOutputs.every(({ resource, quantity }) => {
                const inventory = queryStorageFacility(assets.storageFacility, resource.name);
                return inventory >= quantity * effectiveScale * OUTPUT_BUFFER_MAX_TICKS;
            });

            const allServicesOverSupplied = serviceOutputs.every(({ resource }) => {
                const result = planet.lastMarketResult[resource.name];
                return result !== undefined && result.unsoldSupply > 0;
            });

            if (allStorablesOverBuffered && allServicesOverSupplied) {
                facility.scale = Math.max(0, facility.scale - 1);
            }
        }
    });
}
