import type { Planet, Agent } from './planet/planet';
import { OCCUPATIONS, SKILL } from './population/population';
import { educationLevelKeys } from './population/education';
import { totalOutstandingLoans } from './financial/loanTypes';

const PERF_DEBUG = typeof process !== 'undefined' && process.env?.PERF_DEBUG === '1';

function perfStart(_label: string): number {
    if (!PERF_DEBUG) {
        return 0;
    }
    const now = performance.now();
    if (now === 0) {
        return Date.now();
    }
    return now;
}

function perfEnd(label: string, start: number): void {
    if (!PERF_DEBUG) {
        return;
    }
    const elapsed = (start > 0 ? performance.now() - start : Date.now() - start).toFixed(2);
    console.log(`[perf] ${label}: ${elapsed}ms`);
}

export const computePopulationTotal = (planet: Planet): number => {
    if (planet._populationTotal !== undefined) {
        return planet._populationTotal;
    }
    const start = perfStart('computePopulationTotal');
    let total = 0;
    for (const cohort of planet.population.demography) {
        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    total += cohort[occ][edu][skill].total;
                }
            }
        }
    }
    perfEnd('computePopulationTotal', start);
    return total;
};

export const computeGlobalStarvation = (planet: Planet): number => {
    if (planet._globalStarvation !== undefined) {
        return planet._globalStarvation;
    }
    const start = perfStart('computeGlobalStarvation');
    let totalStarvation = 0;
    let totalPop = 0;
    for (const cohort of planet.population.demography) {
        if (!cohort) {
            continue;
        }
        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    const cat = cohort[occ][edu][skill];
                    if (cat.total > 0) {
                        totalStarvation += cat.services.grocery.starvationLevel * cat.total;
                        totalPop += cat.total;
                    }
                }
            }
        }
    }
    perfEnd('computeGlobalStarvation', start);
    return totalPop > 0 ? totalStarvation / totalPop : 0;
};

export const computeAgentStorage = (agent: Agent): Record<string, number> => {
    const start = perfStart('computeAgentStorage');
    const storage: Record<string, number> = {};
    for (const planetAssets of Object.values(agent.assets)) {
        const stor = planetAssets.storageFacility;
        if (stor?.currentInStorage) {
            for (const [rName, entry] of Object.entries(stor.currentInStorage)) {
                storage[rName] = (storage[rName] || 0) + (entry?.quantity || 0);
            }
        }
    }
    perfEnd('computeAgentStorage', start);
    return storage;
};

export const computeAgentProduction = (agent: Agent): Record<string, number> => {
    const start = perfStart('computeAgentProduction');
    const production: Record<string, number> = {};
    for (const planetAssets of Object.values(agent.assets)) {
        for (const fac of planetAssets.productionFacilities ?? []) {
            for (const [resourceName, qty] of Object.entries(fac.lastTickResults?.lastProduced ?? {})) {
                production[resourceName] = (production[resourceName] || 0) + qty;
            }
        }
    }
    perfEnd('computeAgentProduction', start);
    return production;
};

export const computeAgentConsumption = (agent: Agent): Record<string, number> => {
    const start = perfStart('computeAgentConsumption');
    const consumption: Record<string, number> = {};
    for (const planetAssets of Object.values(agent.assets)) {
        for (const fac of planetAssets.productionFacilities ?? []) {
            const eff = fac.lastTickResults?.overallEfficiency ?? 0;
            for (const n of fac.needs ?? []) {
                const qty = (n.quantity ?? 0) * fac.scale * eff;
                consumption[n.resource.name] = (consumption[n.resource.name] || 0) + qty;
            }
        }
    }
    perfEnd('computeAgentConsumption', start);
    return consumption;
};

export type AgentListSummary = {
    agentId: string;
    name: string;
    associatedPlanetId: string;
    balance: number;
    facilityCount: number;
    avgEfficiency: number | null;
    totalWorkers: number;
    unusedWorkerFraction: number;
    topResources: Array<{ name: string; quantity: number }>;
    shipCount: number;
};

export const summariseAgentBlob = (agentId: string, blob: unknown): AgentListSummary => {
    const start = perfStart('summariseAgentBlob');
    const a = blob as Agent;

    let facilityCount = 0;
    let efficiencySum = 0;
    let efficiencyN = 0;
    const storageTotals: Record<string, number> = {};
    let totalWorkers = 0;
    const unusedWorkerFraction = 0;

    for (const assets of Object.values(a.assets ?? {})) {
        const facs = assets?.productionFacilities ?? [];
        facilityCount += facs.length;
        for (const f of facs) {
            if (f?.lastTickResults) {
                efficiencySum += f.lastTickResults.overallEfficiency;
                efficiencyN += 1;
            }
        }

        const stor = assets?.storageFacility;
        if (stor?.currentInStorage) {
            for (const [rName, entry] of Object.entries(stor.currentInStorage)) {
                storageTotals[rName] = (storageTotals[rName] || 0) + (entry?.quantity || 0);
            }
        }

        if (assets?.allocatedWorkers) {
            for (const v of Object.values(assets.allocatedWorkers)) {
                totalWorkers += (v as number) ?? 0;
            }
        }
    }

    const topResources = Object.entries(storageTotals)
        .filter(([, qty]) => qty > 0)
        .sort(([, x], [, y]) => y - x)
        .slice(0, 3)
        .map(([name, quantity]) => ({
            name: name || '',
            quantity: quantity || 0,
        }));

    const result = {
        agentId: agentId || '',
        name: a?.name ?? agentId ?? '',
        associatedPlanetId: a?.associatedPlanetId ?? '',
        balance: a?.assets
            ? Object.values(a.assets).reduce(
                  (sum, pa) => sum + (pa?.deposits ?? 0) - totalOutstandingLoans(pa?.activeLoans ?? []),
                  0,
              )
            : 0,
        facilityCount,
        avgEfficiency: efficiencyN > 0 ? efficiencySum / efficiencyN : null,
        totalWorkers,
        unusedWorkerFraction,
        topResources,
        shipCount: a?.ships?.length ?? 0,
    };
    perfEnd('summariseAgentBlob', start);
    return result;
};

export type AgentPlanetSummary = {
    planetId: string;
    deposits: number;
    facilityCount: number;
    avgEfficiency: number | null;
    totalWorkers: number;
    unusedWorkerFraction: number;
    topResources: Array<{ name: string; quantity: number }>;
    licenses: {
        commercial?: { acquiredTick: number; frozen: boolean };
        workforce?: { acquiredTick: number; frozen: boolean };
    };
};

export type AgentOverviewData = {
    agentId: string;
    name: string;
    associatedPlanetId: string;
    wealth: number;

    deposits: number;
    shipCount: number;
    planets: AgentPlanetSummary[];
};

export const summarisePlanetAssets = (planetId: string, assets: Agent['assets'][string]): AgentPlanetSummary => {
    const start = perfStart('summarisePlanetAssets');
    let facilityCount = 0;
    let efficiencySum = 0;
    let efficiencyN = 0;
    const storageTotals: Record<string, number> = {};
    let totalWorkers = 0;
    let totalUnused = 0;

    const facs = assets.productionFacilities ?? [];
    facilityCount = facs.length;
    for (const f of facs) {
        if (f.lastTickResults) {
            efficiencySum += f.lastTickResults.overallEfficiency;
            efficiencyN += 1;
        }
    }

    const stor = assets.storageFacility;
    if (stor?.currentInStorage) {
        for (const [rName, entry] of Object.entries(stor.currentInStorage)) {
            storageTotals[rName] = (storageTotals[rName] || 0) + (entry?.quantity || 0);
        }
    }

    if (assets.allocatedWorkers) {
        for (const v of Object.values(assets.allocatedWorkers)) {
            totalWorkers += (v as number) ?? 0;
        }
    }

    if (assets.unusedWorkers) {
        for (const v of Object.values(assets.unusedWorkers)) {
            totalUnused += (v as number) ?? 0;
        }
    }

    const totalAllWorkers = totalWorkers + totalUnused;
    const unusedWorkerFraction = totalAllWorkers > 0 ? totalUnused / totalAllWorkers : 0;

    const topResources = Object.entries(storageTotals)
        .filter(([, qty]) => qty > 0)
        .sort(([, x], [, y]) => y - x)
        .slice(0, 3)
        .map(([name, quantity]) => ({ name, quantity }));

    const result = {
        planetId,
        facilityCount,
        deposits: assets.deposits,
        avgEfficiency: efficiencyN > 0 ? efficiencySum / efficiencyN : null,
        totalWorkers,
        unusedWorkerFraction,
        topResources,
        licenses: assets.licenses ?? {},
    };
    perfEnd('summarisePlanetAssets', start);
    return result;
};
