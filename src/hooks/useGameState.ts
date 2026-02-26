'use client';

import { useEffect, useState } from 'react';
import type { Population, Planet, TransportShip, Agent } from '../simulation/planet';
import type { AgentTimeSeries, AgentResourceSnapshot } from '@/app/agents/AgentOverview';

export type GameState = {
    tick: number;
    planets: Planet[];
    transportShips: TransportShip[];
    agents: Agent[];
};

export type UseGameStateResult = {
    state: GameState | null;
    popSeries: Record<string, { tick: number; value: number }[]>;
    agentSeries: Record<string, AgentTimeSeries>;
};

/**
 * Shared hook that subscribes to the `/api/tick` SSE stream and maintains
 * the full game state including population and agent resource time-series.
 *
 * Each component that calls this hook opens its own EventSource connection.
 * If you need to share a single connection across multiple components on the
 * same page, lift the call to a common parent.
 */
export function useGameState(): UseGameStateResult {
    const [state, setState] = useState<GameState | null>(null);
    const [popSeries, setPopSeries] = useState<Record<string, { tick: number; value: number }[]>>({});
    const [agentSeries, setAgentSeries] = useState<Record<string, AgentTimeSeries>>({});

    useEffect(() => {
        const es = new EventSource('/api/tick');
        es.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                if (msg.type === 'workerRestarted') {
                    setPopSeries({});
                    setAgentSeries({});
                    return;
                }

                if (msg.type === 'state') {
                    const newState = msg.state as GameState;
                    setState(newState);

                    const sumPopulation = (pop?: Population): number => {
                        if (!pop || !Array.isArray(pop.demography)) {
                            return 0;
                        }
                        let total = 0;
                        for (const cohort of pop.demography) {
                            for (const eduObj of Object.values(cohort)) {
                                for (const occVal of Object.values(eduObj)) {
                                    total += Number(occVal) || 0;
                                }
                            }
                        }
                        return total;
                    };

                    const tick = newState.tick;

                    setPopSeries((prev) => {
                        const copy: Record<string, { tick: number; value: number }[]> = { ...prev };
                        for (const planet of newState.planets) {
                            const total = sumPopulation(planet.population);
                            const arr = copy[planet.id] ? [...copy[planet.id]] : [];
                            arr.unshift({ tick, value: total });
                            copy[planet.id] = arr.slice(0, 2000);
                        }
                        return copy;
                    });

                    setAgentSeries((prev) => {
                        const copy = { ...prev };
                        const MAX_SNAPSHOTS = 100;
                        for (const agent of newState.agents ?? []) {
                            const existing = copy[agent.id] ?? {
                                storage: [],
                                production: [],
                                consumption: [],
                            };

                            const storageResources: Record<string, number> = {};
                            const productionResources: Record<string, number> = {};
                            const consumptionResources: Record<string, number> = {};

                            for (const planetAssets of Object.values(agent.assets)) {
                                const stor = planetAssets.storageFacility;
                                if (stor?.currentInStorage) {
                                    for (const [rName, entry] of Object.entries(stor.currentInStorage)) {
                                        storageResources[rName] =
                                            (storageResources[rName] || 0) + (entry?.quantity || 0);
                                    }
                                }
                                for (const fac of planetAssets.productionFacilities ?? []) {
                                    const eff = (fac.lastTickEfficiencyInPercent ?? 0) / 100;
                                    for (const p of fac.produces ?? []) {
                                        const qty = (p.quantity ?? 0) * fac.scale * eff;
                                        productionResources[p.resource.name] =
                                            (productionResources[p.resource.name] || 0) + qty;
                                    }
                                    for (const n of fac.needs ?? []) {
                                        const qty = (n.quantity ?? 0) * fac.scale * eff;
                                        consumptionResources[n.resource.name] =
                                            (consumptionResources[n.resource.name] || 0) + qty;
                                    }
                                }
                            }

                            const storageSnap: AgentResourceSnapshot = { tick, resources: storageResources };
                            const prodSnap: AgentResourceSnapshot = { tick, resources: productionResources };
                            const consSnap: AgentResourceSnapshot = { tick, resources: consumptionResources };

                            copy[agent.id] = {
                                storage: [storageSnap, ...existing.storage].slice(0, MAX_SNAPSHOTS),
                                production: [prodSnap, ...existing.production].slice(0, MAX_SNAPSHOTS),
                                consumption: [consSnap, ...existing.consumption].slice(0, MAX_SNAPSHOTS),
                            };
                        }
                        return copy;
                    });
                }
            } catch (_e) {
                // ignore parse errors
            }
        };
        es.onerror = () => {
            es.close();
        };
        return () => es.close();
    }, []);

    return { state, popSeries, agentSeries };
}
