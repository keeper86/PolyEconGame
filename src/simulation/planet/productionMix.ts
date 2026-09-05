import type { GameState, Planet } from './planet';
import type { ProductionFacility } from './facility';
import { queryStorageFacility } from './facility';

const MIX_ALPHA = 0.02;
const MIX_MIN_SHARE = 0.1;
const MIX_TARGET_TICKS = 30;

function initProductionMix(facility: ProductionFacility): void {
    const total = facility.produces.reduce((sum, output) => sum + output.quantity, 0);
    const mix: Record<string, number> = {};
    for (const output of facility.produces) {
        mix[output.resource.name] = total > 0 ? output.quantity / total : 1;
    }
    facility.productionMix = mix;
}

function enforceMinimumShares(mix: Record<string, number>): void {
    const names = Object.keys(mix);
    for (let iteration = 0; iteration < 5; iteration++) {
        let total = 0;
        for (const name of names) {
            total += mix[name];
        }
        for (const name of names) {
            mix[name] /= Math.max(1e-9, total);
        }

        let surplus = 0;
        for (const name of names) {
            if (mix[name] < MIX_MIN_SHARE) {
                surplus += MIX_MIN_SHARE - mix[name];
                mix[name] = MIX_MIN_SHARE;
            }
        }

        if (surplus > 0) {
            let aboveTotal = 0;
            for (const name of names) {
                if (mix[name] > MIX_MIN_SHARE) {
                    aboveTotal += mix[name];
                }
            }
            if (aboveTotal > 0) {
                const scale = Math.max(0, 1 - surplus / aboveTotal);
                for (const name of names) {
                    if (mix[name] > MIX_MIN_SHARE) {
                        mix[name] *= scale;
                    }
                }
            }
        }
    }
}

export function updateProductionMix(gameState: GameState, planet: Planet): void {
    for (const agent of gameState.agents.values()) {
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }
        for (const facility of assets.productionFacilities) {
            if (!facility.outputFlexible || facility.produces.length === 0) {
                continue;
            }
            if (!facility.productionMix) {
                initProductionMix(facility);
                continue;
            }
            const mix = facility.productionMix;

            const keepTicks =
                facility.wasteSurplusTicks !== undefined && facility.wasteSurplusTicks > 0
                    ? facility.wasteSurplusTicks
                    : MIX_TARGET_TICKS;
            const raw: Record<string, number> = {};
            let rawTotal = 0;
            for (const output of facility.produces) {
                const keep = keepTicks * facility.maxScale * output.quantity;
                const free = queryStorageFacility(assets.storageFacility, output.resource.name);
                const deficit = keep > 0 ? Math.max(0, Math.min(1, (keep - free) / keep)) : 0;
                raw[output.resource.name] = Math.max(1e-6, deficit) * output.quantity;
                rawTotal += raw[output.resource.name];
            }

            for (const output of facility.produces) {
                const rawShare = rawTotal > 0 ? raw[output.resource.name] / rawTotal : 0;
                mix[output.resource.name] += MIX_ALPHA * (rawShare - mix[output.resource.name]);
            }
            enforceMinimumShares(mix);
        }
    }
}
