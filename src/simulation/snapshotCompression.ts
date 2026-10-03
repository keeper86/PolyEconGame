import { gzipSync, gunzipSync } from 'node:zlib';
import { encode, decode } from '@msgpack/msgpack';

import type { Planet, Agent, GameState, BankruptcyRecord } from './planet/planet';
import type { ShipCapitalMarket } from './ships/ships';

export interface WireGameState {
    tick: number;
    planets: Planet[];
    agents: Agent[];
    shipCapitalMarket?: ShipCapitalMarket;
    forexMarketMakers?: Agent[];
    shipbuilderAgents?: Agent[];
    arbitrageTraders?: Agent[];
    bufferTraders?: Agent[];
    bankruptcies: BankruptcyRecord[];
    nextEventId: number;
}

export function gameStateToWire(gs: GameState): WireGameState {
    return {
        tick: gs.tick,
        planets: [...gs.planets.values()],
        agents: [...gs.agents.values()],
        shipCapitalMarket: gs.shipCapitalMarket,
        forexMarketMakers: [...gs.forexMarketMakers.values()],
        shipbuilderAgents: [...gs.shipbuilderAgents.values()],
        arbitrageTraders: [...gs.arbitrageTraders.values()],
        bufferTraders: [...gs.bufferTraders.values()],
        bankruptcies: gs.bankruptcies,
        nextEventId: gs.nextEventId,
    };
}

function wireToGameState(wire: WireGameState): GameState {
    const planets = new Map<string, Planet>();
    for (const p of wire.planets) {
        planets.set(p.id, p);
    }
    const agents = new Map<string, Agent>();
    for (const a of wire.agents) {
        for (const assets of Object.values(a.assets)) {
            if (!assets.shipListings) {
                assets.shipListings = [];
            }
        }
        agents.set(a.id, a);
    }
    const forexMarketMakers = new Map<string, Agent>();
    for (const mm of wire.forexMarketMakers ?? []) {
        forexMarketMakers.set(mm.id, mm);
    }
    const shipbuilderAgents = new Map<string, Agent>();
    for (const sb of wire.shipbuilderAgents ?? []) {
        const canonical = agents.get(sb.id);
        if (canonical) {
            shipbuilderAgents.set(sb.id, canonical);
        }
    }
    const arbitrageTraders = new Map<string, Agent>();
    for (const at of wire.arbitrageTraders ?? []) {
        const canonical = agents.get(at.id);
        if (canonical) {
            arbitrageTraders.set(at.id, canonical);
        }
    }
    const bufferTraders = new Map<string, Agent>();
    for (const bt of wire.bufferTraders ?? []) {
        const canonical = agents.get(bt.id);
        if (canonical) {
            bufferTraders.set(bt.id, canonical);
        }
    }

    // Re-link planet.recycler references
    for (const planet of planets.values()) {
        if (planet.recycler) {
            const canonical = agents.get(planet.recycler.id);
            if (canonical) {
                planet.recycler = canonical;
            }
        }
    }

    return {
        tick: wire.tick,
        planets,
        agents,
        shipCapitalMarket: wire.shipCapitalMarket ?? { tradeHistory: [], emaPrice: {} },
        forexMarketMakers,
        shipbuilderAgents,
        arbitrageTraders,
        bufferTraders,
        tickerEvents: [],
        bankruptcies: wire.bankruptcies,
        nextEventId: wire.nextEventId,
    };
}

export function serializeGameState(gs: GameState): Buffer {
    const wire = gameStateToWire(gs);
    const packed = encode(wire);
    return gzipSync(Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength));
}

export function deserializeSnapshot(data: Buffer): GameState {
    const decompressed = gunzipSync(data);
    const wire = decode(decompressed) as WireGameState;
    return wireToGameState(wire);
}
