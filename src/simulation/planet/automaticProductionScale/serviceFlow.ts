import type { ProductionFacility, PidState } from '../facility';
import type { AgentPlanetAssets, Planet } from '../planet';
import { getServiceFlowDecayTarget } from './runtimeConfig';

export const SERVICE_FLOW_EMA_ALPHA = 0.05;
export const SERVICE_FLOW_UNFILLED_SATURATION = 0.25;
export const SERVICE_FLOW_DECAY_TARGET = 0.3;

export function isFlowControlledServiceFacility(facility: ProductionFacility): boolean {
    return facility.produces.some((output) => output.resource.form === 'services');
}

export function serviceFlowError(decayShare: number, unfilledEMA: number, decayTarget: number): number {
    const target = Math.max(0.01, Math.min(0.99, decayTarget));
    // Production needed to replace decayed stock is not new demand. Steady state is
    // produced == consumed + decayed, i.e. unfilled demand exactly covers the decay share.
    // Expansion is therefore driven by the NET demand: unfilled demand beyond replacement.
    const unfilledNorm = Math.min(1, unfilledEMA / SERVICE_FLOW_UNFILLED_SATURATION);
    const netDemand = unfilledNorm - decayShare;
    if (decayShare > target) {
        const over = Math.min(1, (decayShare - target) / (1 - target));
        return Math.max(-1, Math.min(0, netDemand - over));
    }
    return Math.max(-1, Math.min(1, netDemand));
}

export type ServiceFlowSignal = {
    resourceName: string;
    producedEMA: number;
    decayedEMA: number;
    decayShare: number;
    unfilledEMA: number;
    error: number;
};

export function updateServiceFlowSignal(
    facility: ProductionFacility,
    assets: AgentPlanetAssets,
    planet: Planet,
    state: PidState,
): ServiceFlowSignal | null {
    if (!isFlowControlledServiceFacility(facility)) {
        return null;
    }
    const output = facility.produces.find((entry) => entry.resource.form === 'services');
    if (!output) {
        return null;
    }
    const resourceName = output.resource.name;
    const produced = facility.lastTickResults?.lastProduced?.[resourceName] ?? 0;
    const decayed = assets.lastDepreciatedPerTick?.[resourceName] ?? 0;
    const marketResult = planet.lastMarketResult?.[resourceName];
    const unfilledFrac =
        marketResult && marketResult.totalDemand > 0 ? marketResult.unfilledDemand / marketResult.totalDemand : 0;

    const alpha = SERVICE_FLOW_EMA_ALPHA;
    const producedEMA = alpha * produced + (1 - alpha) * (state.flowProducedEMA ?? produced);
    const decayedEMA = alpha * decayed + (1 - alpha) * (state.flowDecayedEMA ?? decayed);
    const unfilledEMA = alpha * unfilledFrac + (1 - alpha) * (state.flowUnfilledEMA ?? unfilledFrac);
    state.flowProducedEMA = producedEMA;
    state.flowDecayedEMA = decayedEMA;
    state.flowUnfilledEMA = unfilledEMA;

    const decayShare = producedEMA > 1e-9 ? Math.max(0, Math.min(1, decayedEMA / producedEMA)) : 0;
    const decayTarget = getServiceFlowDecayTarget() ?? SERVICE_FLOW_DECAY_TARGET;

    return {
        resourceName,
        producedEMA,
        decayedEMA,
        decayShare,
        unfilledEMA,
        error: serviceFlowError(decayShare, unfilledEMA, decayTarget),
    };
}
