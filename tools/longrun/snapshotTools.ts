import fs from 'node:fs';

import type { GameState } from '../../src/simulation/planet/planet';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';

export function loadHexSnapshot(hexPath: string): GameState {
    const raw = fs.readFileSync(hexPath, 'utf8');
    const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
    return deserializeSnapshot(Buffer.from(hex, 'hex'));
}

export function keepOnlyPlanet(gameState: GameState, keepId: string): void {
    const removed = new Set([...gameState.planets.keys()].filter((id) => id !== keepId));
    if (removed.size === 0) {
        return;
    }

    for (const id of removed) {
        gameState.planets.delete(id);
    }

    const agentMaps = [
        gameState.agents,
        gameState.forexMarketMakers,
        gameState.shipbuilderAgents,
        gameState.arbitrageTraders,
    ] as const;
    for (const map of agentMaps) {
        for (const [id, agent] of [...map]) {
            if (removed.has(agent.associatedPlanetId)) {
                map.delete(id);
            }
        }
    }

    for (const agent of gameState.agents.values()) {
        for (const id of removed) {
            delete agent.assets[id];
        }
    }
    for (const agent of gameState.forexMarketMakers.values()) {
        for (const id of removed) {
            delete agent.assets[id];
        }
    }
}
