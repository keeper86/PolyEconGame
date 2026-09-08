import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '../../src/simulation/constants';
import { advanceTick, seedRng } from '../../src/simulation/engine';
import { buildPopulationDemand } from '../../src/simulation/market/populationDemand';
import { constructionServiceResourceType } from '../../src/simulation/planet/services';
import { isFacilityOperating } from '../../src/simulation/planet/facility';
import { facilityRestorationCapacityPerTick } from '../../src/simulation/planet/facilityMaintenance';
import { buildBenchmarkWorld } from './world';
import type { Agent, Planet } from '../../src/simulation/planet/planet';

function agentConstructionConsumption(agent: Agent, planetId: string): { projects: number; consumption: number; restoration: number } {
    const assets = agent.assets[planetId];
    if (!assets) {
        return { projects: 0, consumption: 0, restoration: 0 };
    }
    let projects = 0;
    let consumption = 0;
    let restoration = 0;
    const all = [
        ...assets.productionFacilities,
        ...(assets.humanResourcesDepartment ? [assets.humanResourcesDepartment] : []),
        ...(assets.storage?.department ? [assets.storage.department] : []),
    ];
    for (const f of all) {
        if (f.construction !== null) {
            projects += 1;
            consumption += f.construction.maximumConstructionServiceConsumption;
        }
        if (isFacilityOperating(f) && f.maxMaintenance < 1) {
            restoration += facilityRestorationCapacityPerTick(f);
        }
    }
    return { projects, consumption, restoration };
}

function populationConstructionBid(planet: Planet): number {
    const bids = buildPopulationDemand(planet).get(constructionServiceResourceType.name) ?? [];
    return bids.reduce((sum, b) => sum + Math.max(0, b.quantity), 0);
}

function main(): void {
    const years = Number(process.argv[2] ?? 8);
    const scenario = Number(process.argv[3] ?? 1001);
    seedRng(scenario);
    const { gameState, planet } = buildBenchmarkWorld({});

    const totalTicks = years * TICKS_PER_YEAR;
    console.log('tick year marketDemand popBid activeProjects activeConsumPT restorationPT estMarketDemand');
    for (let t = 1; t <= totalTicks; t++) {
        gameState.tick = t;
        advanceTick(gameState);
        if (t % TICKS_PER_MONTH !== 0) {
            continue;
        }
        let projects = 0;
        let consumption = 0;
        let restoration = 0;
        for (const agent of gameState.agents.values()) {
            const r = agentConstructionConsumption(agent, planet.id);
            projects += r.projects;
            consumption += r.consumption;
            restoration += r.restoration;
        }
        const popBid = populationConstructionBid(planet);
        const marketDemand = planet.lastMarketResult[constructionServiceResourceType.name]?.totalDemand ?? 0;
        const estMarketDemand = 3 * (consumption + restoration) + popBid;
        console.log(
            `${t} ${(t / TICKS_PER_YEAR).toFixed(2)} ${marketDemand.toFixed(0)} ${popBid.toFixed(0)} ${projects} ${consumption.toFixed(0)} ${restoration.toFixed(0)} ${estMarketDemand.toFixed(0)}`,
        );
    }
}

main();
