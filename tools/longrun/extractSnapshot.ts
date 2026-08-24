import fs from 'node:fs';
import path from 'node:path';

import { TICKS_PER_YEAR } from '../../src/simulation/constants';
import { computeNormalizedBuffer } from '../../src/simulation/market/serviceBufferNormalizer';
import type { ProductionFacility } from '../../src/simulation/planet/facility';
import type { GameState, Planet } from '../../src/simulation/planet/planet';
import {
    beverageResourceType,
    chemicalResourceType,
    glassResourceType,
    packagingResourceType,
    pesticideResourceType,
    processedFoodResourceType,
    produceResourceType,
    waterResourceType,
} from '../../src/simulation/planet/resources';
import { groceryServiceResourceType } from '../../src/simulation/planet/services';
import { educationLevelKeys } from '../../src/simulation/population/education';
import { OCCUPATIONS } from '../../src/simulation/population/population';
import { serializeGameState } from '../../src/simulation/snapshotCompression';
import { computePopulationTotal } from '../../src/simulation/snapshotRepository';
import { loadHexSnapshot } from './snapshotTools';

const IN_PATH = path.join(__dirname, 'snapshot_zipped.gz');
const OUT_PATH = path.join(__dirname, 'snapshot_y117.snapshot');

const CHAIN_RESOURCES = [
    groceryServiceResourceType,
    processedFoodResourceType,
    beverageResourceType,
    produceResourceType,
    waterResourceType,
    chemicalResourceType,
    packagingResourceType,
    glassResourceType,
    pesticideResourceType,
];

const CHAIN_TIERS = [
    groceryServiceResourceType,
    processedFoodResourceType,
    beverageResourceType,
    produceResourceType,
    waterResourceType,
];

function groceryFillRate(planet: Planet): number {
    const result = planet.lastMarketResult[groceryServiceResourceType.name];
    if (!result || result.totalDemand <= 0) {
        return 0;
    }
    return Math.max(0, 1 - result.unfilledDemand / result.totalDemand);
}

function groceryPrice(planet: Planet): number {
    const result = planet.lastMarketResult[groceryServiceResourceType.name];
    if (result && result.totalVolume > 0 && result.clearingPrice > 0) {
        return result.clearingPrice;
    }
    return planet.marketPrices[groceryServiceResourceType.name] ?? 0;
}

function weightedGroceryStarvation(planet: Planet): number {
    let weighted = 0;
    let total = 0;
    for (const cohort of planet.population.demography) {
        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                const cat = cohort[occ][edu];
                weighted += cat.total * cat.services.grocery.starvationLevel;
                total += cat.total;
            }
        }
    }
    return total > 0 ? weighted / total : 0;
}

function marketRow(planet: Planet, resourceName: string): { demand: number; supply: number; fill: number; price: number } {
    const result = planet.lastMarketResult[resourceName];
    const demand = result?.totalDemand ?? 0;
    const supply = result?.totalSupply ?? 0;
    const fill = demand > 0 ? Math.max(0, 1 - (result?.unfilledDemand ?? 0) / demand) : 0;
    const price =
        result && result.totalVolume > 0 && result.clearingPrice > 0
            ? result.clearingPrice
            : (planet.marketPrices[resourceName] ?? 0);
    return { demand, supply, fill, price };
}

function facilitiesProducing(
    gameState: GameState,
    planetId: string,
    resourceName: string,
): Array<{ agent: string; facility: ProductionFacility }> {
    const rows: Array<{ agent: string; facility: ProductionFacility }> = [];
    for (const agent of gameState.agents.values()) {
        const assets = agent.assets[planetId];
        if (!assets) {
            continue;
        }
        for (const facility of assets.productionFacilities ?? []) {
            if (facility.produces.some((p) => p.resource.name === resourceName)) {
                rows.push({ agent: agent.name, facility });
            }
        }
    }
    return rows;
}

function facilityWorkers(facility: ProductionFacility): number {
    return Object.values(facility.lastTickResults?.totalUsedByEdu ?? {}).reduce((a, b) => a + b, 0);
}

function printFacilityTier(gameState: GameState, planetId: string, resourceName: string): void {
    const rows = facilitiesProducing(gameState, planetId, resourceName).sort((a, b) => b.facility.scale - a.facility.scale);
    if (rows.length === 0) {
        return;
    }
    const totalScale = rows.reduce((s, r) => s + r.facility.scale, 0);
    const totalMaxScale = rows.reduce((s, r) => s + r.facility.maxScale, 0);
    const avgCondition = rows.reduce((s, r) => s + r.facility.maintenanceStatus, 0) / rows.length;
    const avgEfficiency = rows.reduce((s, r) => s + (r.facility.lastTickResults?.overallEfficiency ?? 0), 0) / rows.length;
    const totalProduced = rows.reduce((s, r) => s + (r.facility.lastTickResults?.lastProduced?.[resourceName] ?? 0), 0);

    console.log(`\n${resourceName} — ${rows.length} facilities`);
    console.log(
        `  total: scale=${totalScale.toFixed(0)} maxScale=${totalMaxScale.toFixed(0)} avgCondition=${avgCondition.toFixed(3)} ` +
            `avgEfficiency=${avgEfficiency.toFixed(3)} produced=${totalProduced.toFixed(0)}`,
    );
    console.log(['  agent', 'scale', 'maxScale', 'condition', 'efficiency', 'workers', 'produced'].join('\t'));
    for (const { agent, facility } of rows) {
        console.log(
            [
                '  ' + agent,
                facility.scale,
                facility.maxScale,
                facility.maintenanceStatus.toFixed(3),
                (facility.lastTickResults?.overallEfficiency ?? 0).toFixed(3),
                facilityWorkers(facility),
                (facility.lastTickResults?.lastProduced?.[resourceName] ?? 0).toFixed(0),
            ].join('\t'),
        );
    }
}

function printSupplyChain(gameState: GameState): void {
    for (const planet of gameState.planets.values()) {
        if (computePopulationTotal(planet) <= 0) {
            continue;
        }
        console.log(`\n=== Grocery supply chain — ${planet.id} ===`);
        console.log(['resource', 'demand', 'supply', 'fill', 'price'].join('\t'));
        for (const resource of CHAIN_RESOURCES) {
            const row = marketRow(planet, resource.name);
            console.log(
                [resource.name, row.demand.toFixed(0), row.supply.toFixed(0), row.fill.toFixed(4), row.price.toFixed(4)].join('\t'),
            );
        }
        for (const resource of CHAIN_TIERS) {
            printFacilityTier(gameState, planet.id, resource.name);
        }
    }
}

function main(): void {
    const gameState = loadHexSnapshot(IN_PATH);
    const year = gameState.tick / TICKS_PER_YEAR;

    console.log(`tick=${gameState.tick}  year=${year.toFixed(3)}`);
    console.log(
        `planets=${gameState.planets.size}  agents=${gameState.agents.size}  forexMM=${gameState.forexMarketMakers.size}  ` +
            `shipbuilders=${gameState.shipbuilderAgents.size}  arbitrage=${gameState.arbitrageTraders.size}`,
    );
    console.log(`planet ids: ${[...gameState.planets.keys()].join(', ')}`);
    console.log('');

    const header = ['planet', 'population', 'groceryBuffer', 'groceryFillRate', 'starvation', 'price', 'demand', 'supply', 'volume'];
    console.log(header.join('\t'));

    for (const planet of gameState.planets.values()) {
        const population = computePopulationTotal(planet);
        if (population <= 0) {
            continue;
        }
        const result = planet.lastMarketResult[groceryServiceResourceType.name];
        const cells = [
            planet.id,
            population.toFixed(0),
            computeNormalizedBuffer(planet, 'grocery').toFixed(4),
            groceryFillRate(planet).toFixed(4),
            weightedGroceryStarvation(planet).toFixed(5),
            groceryPrice(planet).toFixed(4),
            (result?.totalDemand ?? 0).toFixed(0),
            (result?.totalSupply ?? 0).toFixed(0),
            (result?.totalVolume ?? 0).toFixed(0),
        ];
        console.log(cells.join('\t'));
    }

    printSupplyChain(gameState);

    const serialized = serializeGameState(gameState);
    fs.writeFileSync(OUT_PATH, serialized);
    console.log('');
    console.log(`wrote reusable snapshot ${OUT_PATH} (${(serialized.length / 1024).toFixed(1)} KB gzip)`);
}

main();
