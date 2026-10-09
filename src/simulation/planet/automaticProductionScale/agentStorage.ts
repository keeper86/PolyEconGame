import { bufferTraderFootprint } from '../../agents/bufferTrader';
import { processFacilityContraction } from '../../agents/recycler';
import { storageFormKeys, type StorageFacility } from '../facility';
import type { Agent, AgentPlanetAssets, GameState, Planet } from '../planet';
import { initiateCapacityExpansion } from './expansionActions';
import {
    authorShellCompartments,
    footprintForFreeBuys,
    footprintPerForm,
    scaleToHoldContents,
    type ResidencyLayer,
} from './shellCompartments';

const SHELL_BUFFER_FRACTION = 1.5;
const SHELL_OVERSHOOT_FRACTION = 2;

// Grow or shrink a single shell toward the footprint scale it must hold. Shells are owned by the storage
// shell itself and are not gated by the shared construction budget, so this neither reads nor returns one.
export function reconcileShellScale(
    planet: Planet,
    agent: Agent,
    gameState: GameState,
    assets: AgentPlanetAssets,
    shell: StorageFacility,
    requiredScale: number,
): void {
    if (requiredScale <= 0 || shell.construction !== null) {
        return;
    }

    const heldScale = scaleToHoldContents(assets.storage);
    const heldForm = storageFormKeys().find((form) => assets.storage.shells[form] === shell);
    const flooredRequired = heldForm ? Math.max(requiredScale, heldScale[heldForm]) : requiredScale;

    const bufferScale = Math.max(1, Math.ceil(flooredRequired * SHELL_BUFFER_FRACTION));

    if (shell.maxScale < flooredRequired) {
        initiateCapacityExpansion(shell, assets, planet, true, bufferScale);
        return;
    }

    if (shell.maxScale > flooredRequired * SHELL_OVERSHOOT_FRACTION && shell.maxScale > bufferScale) {
        processFacilityContraction(planet, shell, agent, bufferScale, gameState, 0.5);
    }
}

// Facility needs and production fill a shell first; the free-buy floors they do not already cover are the
// second tier. A buffer trader has no facility footprint, so its whole market target is the first tier.
const shellResidencyLayers = (agent: Agent, assets: AgentPlanetAssets, planet: Planet): ResidencyLayer[] =>
    agent.agentRole === 'buffer_trader'
        ? [bufferTraderFootprint(agent, planet) ?? {}]
        : [footprintPerForm(assets), footprintForFreeBuys(assets)];

export function updateAgentShellCompartments(gameState: GameState, planet: Planet): void {
    gameState.agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets) {
            return;
        }

        const sizing = authorShellCompartments(assets, shellResidencyLayers(agent, assets, planet));
        if (!agent.automated) {
            return;
        }

        for (const form of storageFormKeys()) {
            const allocation = sizing[form];
            if (allocation) {
                reconcileShellScale(
                    planet,
                    agent,
                    gameState,
                    assets,
                    assets.storage.shells[form],
                    allocation.requiredScale,
                );
            }
        }
    });
}
