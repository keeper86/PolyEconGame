import {
    BUFFER_TRADER_SEED_DEPOSIT,
    BUFFER_TRADER_STORAGE_SCALE,
    BUFFER_TRADER_TARGET_MONTHS,
    TICKS_PER_MONTH,
} from '../constants';
import { grantLoan } from '../financial/loanTypes';
import { makeAgentPlanetAssets, makeStorage } from '../initialUniverse/helpers';
import { shellFormOfResource, type StorageForm } from '../planet/facility';
import type { Agent, GameState, Planet } from '../planet/planet';
import { TRADABLE_RESOURCES } from '../planet/resourceCatalog';
import type { StorageResidency } from '../planet/automaticProductionScale/shellCompartments';

let storageScaleOverride: number | null = null;
let bufferTraderEnabled = false;

export const setBufferTraderStorageScale = (value: number | null): void => {
    storageScaleOverride = value;
};

export const setBufferTraderEnabled = (value: boolean): void => {
    bufferTraderEnabled = value;
};

export const isBufferTraderEnabled = (): boolean => bufferTraderEnabled;

export function seedBufferTraderAgents(gameState: GameState): void {
    for (const planet of gameState.planets.values()) {
        const agentId = `buf_${planet.id}`;

        const agent: Agent = {
            id: agentId,
            name: `${planet.name} Buffer`,
            automated: true,
            automateWorkerAllocation: true,
            logo: 'ai_company',
            foundedTick: gameState.tick,
            starterLoanTaken: true,
            associatedPlanetId: planet.id,
            agentRole: 'buffer_trader',
            ships: [],
            assets: {},
        };

        const storage = makeStorage({
            planetId: planet.id,
            id: `${agentId}_store`,
            scale: storageScaleOverride ?? BUFFER_TRADER_STORAGE_SCALE,
        });
        const assets = makeAgentPlanetAssets([], storage, null);
        assets.licenses = { commercial: { acquiredTick: gameState.tick, frozen: false } };
        assets.market = { sell: {}, buy: {} };

        grantLoan(assets, planet.bank, BUFFER_TRADER_SEED_DEPOSIT, 'forexWorkingCapital', gameState.tick);
        agent.assets[planet.id] = assets;

        gameState.bufferTraders.set(agentId, agent);
        gameState.agents.set(agentId, agent);
    }
}

export const bufferTraderFootprint = (
    agent: Agent,
    planet: Planet,
): Partial<Record<StorageForm, StorageResidency[]>> | undefined => {
    if (!agent.assets[planet.id]) {
        return undefined;
    }
    const grouped: Partial<Record<StorageForm, StorageResidency[]>> = {};
    for (const resource of TRADABLE_RESOURCES) {
        const form = shellFormOfResource(resource);
        if (!form) {
            continue;
        }
        const volume = planet.avgMarketResult[resource.name]?.totalVolume ?? 0;
        const targetQuantity = BUFFER_TRADER_TARGET_MONTHS * TICKS_PER_MONTH * volume;
        if (targetQuantity <= 0) {
            continue;
        }
        grouped[form] = [
            ...(grouped[form] ?? []),
            {
                name: resource.name,
                resource,
                targetQuantity,
                volume: targetQuantity * resource.volumePerQuantity,
                mass: targetQuantity * resource.massPerQuantity,
            },
        ];
    }
    return grouped;
};
