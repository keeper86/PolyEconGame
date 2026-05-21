import type { Agent, Planet } from './planet';

/** Maximum production scale change per month, as a fraction of maxScale (±1%). */
export const PROD_SCALE_STEP_MAX = 0.01;
/** Fraction of totalSupply that is unsold before automated agents scale down. */
export const PROD_SCALE_DOWN_THRESHOLD = 0.8;
/** Fraction of totalDemand that is unfilled before automated agents scale up. */
export const PROD_SCALE_UP_THRESHOLD = 0.5;
/** Minimum overallEfficiency required to allow scale-up (avoids scaling up a bottlenecked facility). */
export const PROD_SCALE_UP_MIN_EFFICIENCY = 0.7;
export const PROD_SCALE_UP_MIN_MARGIN = -0.5;
export const PROD_SCALE_UP_MAX_MARGIN = 0.5;

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
            // Skip facilities still under construction.
            if (facility.construction !== null) {
                continue;
            }

            let signalCount = 0;
            let supplyExcessSum = 0;
            let demandExcessSum = 0;
            let marginSum = 0;

            for (const output of facility.produces) {
                const avg = planet.avgMarketResult[output.resource.name];
                if (!avg) {
                    continue;
                }

                const totalSupply = avg.totalSupply;
                const totalDemand = avg.totalDemand;

                const supplyExcess = totalSupply > 0 ? avg.unsoldSupply / totalSupply : 0;
                const demandExcess = totalDemand > 0 ? avg.unfilledDemand / totalDemand : 0;

                const productionCost = avg.productionCost ?? 0;
                const margin = productionCost > 0 ? (avg.clearingPrice - productionCost) / productionCost : 0;

                supplyExcessSum += supplyExcess;
                demandExcessSum += demandExcess;
                marginSum += margin;
                signalCount++;
            }

            // No market history for any output — skip.
            if (signalCount === 0) {
                continue;
            }

            const maxStep = PROD_SCALE_STEP_MAX * facility.maxScale;
            const updateScale = (direction: 'up' | 'down'): void => {
                const delta = direction === 'up' ? maxStep : -maxStep;
                if (direction === 'up' && facility.scale === facility.maxScale) {
                    facility.maxScale += delta * 0.1;
                    if (process.env.SIM_DEBUG) {
                        console.log(
                            `Increasing maxScale of ${facility.name} on ${planet.name} to ${facility.maxScale.toFixed(2)}`,
                        );
                    }
                    return;
                }
                facility.scale = Math.max(0, Math.min(facility.maxScale, facility.scale + delta));
            };

            const avgSupplyExcess = supplyExcessSum / signalCount;
            const avgDemandExcess = demandExcessSum / signalCount;
            const avgMargin = marginSum / signalCount;

            let score = 0;
            if (avgSupplyExcess > PROD_SCALE_DOWN_THRESHOLD) {
                score -= 1;
            }
            if (avgDemandExcess > PROD_SCALE_UP_THRESHOLD) {
                score += 1;
            }
            if (avgMargin < PROD_SCALE_UP_MIN_MARGIN) {
                score -= 1;
            }
            if (avgMargin > PROD_SCALE_UP_MAX_MARGIN) {
                score += 1;
            }
            if ((facility.lastTickResults?.overallEfficiency ?? 0) < PROD_SCALE_UP_MIN_EFFICIENCY && score > 0) {
                score -= 1;
            }

            if (score >= 2) {
                if (planet.id === 'earth' && process.env.SIM_DEBUG) {
                    console.info(score, avgMargin, avgDemandExcess, avgSupplyExcess, facility.name);
                }

                updateScale('up');
                continue;
            }

            if (score <= -2) {
                if (planet.id === 'earth' && process.env.SIM_DEBUG) {
                    console.info(score, avgMargin, avgDemandExcess, avgSupplyExcess, facility.name);
                }

                updateScale('down');
                continue;
            }
        }
    });
}
