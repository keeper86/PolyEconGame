import assert from 'assert';
import { RECYCLER_BASE_RECOVERY_EFFICIENCY, RECYCLER_PAYMENT_RATIO } from '../constants';
import { grantLoan } from '../financial/loanTypes';
import { makeAgentPlanetAssets, makeStorage } from '../initialUniverse/helpers';
import type { ProductionFacility } from '../planet/facility';
import {
    calculateCostsForConstruction,
    getFacilityType,
    putIntoStorageFacility,
    queryStorageFacility,
} from '../planet/facility';
import type { Agent, GameState, Planet } from '../planet/planet';
import { pushTickerEvent } from '../planet/planet';
import { constructionServiceResourceType } from '../planet/services';

export function createRecyclerAgent(planetId: string, planetName: string): Agent {
    const recyclerId = `recycler_${planetId}`;

    const storage = makeStorage({
        planetId: planetId,
        id: `${recyclerId}_store`,
        name: 'Recycler CS Storage',
        scale: 1,
        volumeCapacity: 1e6, // services have 0 volume/mass, but we need some capacity
        massCapacity: 1e6,
    });

    const assets = makeAgentPlanetAssets(planetId, [], storage);
    assets.licenses = {
        commercial: { acquiredTick: 0, frozen: false },
    };
    assets.market = {
        sell: {
            [constructionServiceResourceType.name]: { automated: true, resource: constructionServiceResourceType },
        },
        buy: {},
    };
    assets.deposits = 0;

    const recycler: Agent = {
        id: recyclerId,
        name: `Recycler (${planetName})`,
        automated: true,
        automateWorkerAllocation: false,
        foundedTick: 0,
        starterLoanTaken: true,
        associatedPlanetId: planetId,
        ships: [],
        assets: { [planetId]: assets },
    };

    return recycler;
}

export function getRecyclerPaymentRatio(planet: Planet): number {
    const recycler = planet.recycler;
    if (!recycler) {
        return 0;
    }
    const recyclerAssets = recycler.assets[planet.id];
    if (!recyclerAssets) {
        return 0;
    }

    const marketResult = planet.avgMarketResult[constructionServiceResourceType.name];

    if (!marketResult || marketResult.totalDemand === 0) {
        return 0;
    }

    const unsoldSupply = Math.max(1, marketResult?.unsoldSupply ?? 0);
    const recyclerCSStock = queryStorageFacility(recyclerAssets.storageFacility, constructionServiceResourceType.name);

    const unfilledDemand = Math.max(1, marketResult?.unfilledDemand ?? 0);
    const demandRatio = unsoldSupply / unfilledDemand - 1;
    const stockRatio = recyclerCSStock / unsoldSupply;
    const recycleRatio = Math.min(1, 1 / (1 + stockRatio + demandRatio / 10));

    return recycleRatio;
}

export function processFacilityContraction(
    planet: Planet,
    facility: ProductionFacility,
    agent: Agent,
    targetMax: number,
    gameState: GameState,
): boolean {
    const agentAssets = agent.assets[planet.id];
    if (!agentAssets) {
        return false;
    }

    const csPrice = planet.marketPrices[constructionServiceResourceType.name] ?? 0;

    const type = getFacilityType(facility);
    const recoveredCS =
        calculateCostsForConstruction(type, targetMax, facility.maxScale) * RECYCLER_BASE_RECOVERY_EFFICIENCY;

    assert(recoveredCS > 0 && isFinite(recoveredCS), 'Recovered CS should be positive and finite');
    const marketValue = recoveredCS * csPrice;

    const recycler = planet.recycler;
    if (!recycler) {
        return false;
    }
    const recyclerAssets = recycler.assets[planet.id];
    if (!recyclerAssets) {
        return false;
    }

    const dynamicRatio = RECYCLER_PAYMENT_RATIO * getRecyclerPaymentRatio(planet);
    const payment = marketValue * dynamicRatio;

    // If recycler has insufficient deposits, grant an immediate loan to cover the gap
    if (recyclerAssets.deposits < payment) {
        const deficit = payment - recyclerAssets.deposits;
        grantLoan(recyclerAssets, planet.bank, deficit, 'bufferCoverage', gameState.tick);
    }

    // Transfer payment from recycler to agent
    recyclerAssets.deposits -= payment;
    agentAssets.deposits += payment;

    // If recycler has a lot of money, give it to the government
    if (recyclerAssets.deposits > 10_000_000) {
        const governmentAgent = gameState.agents.get(planet.governmentId);
        assert(governmentAgent, `Government agent with id ${planet.governmentId} not found for planet ${planet.name}`);
        governmentAgent.assets[planet.id]!.deposits += recyclerAssets.deposits;
        recyclerAssets.deposits = 0;
    }

    // Add recovered CS to recycler's storage (services have 0 volume/mass, so no overflow possible)
    putIntoStorageFacility(recyclerAssets.storageFacility, constructionServiceResourceType, recoveredCS);

    // Shrink the facility
    const currentMax = facility.maxScale;
    const scaleFraction = facility.maxScale > 0 ? facility.scale / facility.maxScale : 1;
    facility.maxScale = targetMax;
    facility.scale = targetMax * scaleFraction;

    pushTickerEvent(gameState, {
        category: 'facilityScrapped',
        planetId: planet.id,
        agentId: agent.id,
        agentName: agent.name,
        message: `${agent.name} scrapped ${facility.name} on ${planet.name} (maxScale: ${currentMax} → ${targetMax})`,
        tick: gameState.tick,
    });

    return true;
}
