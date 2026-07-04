import { RECYCLER_BASE_RECOVERY_EFFICIENCY, RECYCLER_PAYMENT_RATIO } from '../constants';
import { grantLoan } from '../financial/loanTypes';
import { makeAgentPlanetAssets, makeStorage } from '../initialUniverse/helpers';
import type { ProductionFacility } from '../planet/facility';
import { putIntoStorageFacility, queryStorageFacility } from '../planet/facility';
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
    assets.market = { sell: {}, buy: {} };
    assets.deposits = 0;

    // Set up CS sell offer so automatic pricing sells it on the market
    assets.market.sell[constructionServiceResourceType.name] = {
        resource: constructionServiceResourceType,
        automated: true,
    };

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

    // Determine buffer half-point from local CS market supply (EMA-smoothed)
    const marketResult = planet.avgMarketResult[constructionServiceResourceType.name];
    const avgTotalSupply = marketResult?.totalSupply ?? 0;

    const recyclerCSStock = queryStorageFacility(recyclerAssets.storageFacility, constructionServiceResourceType.name);
    const stockRatio = avgTotalSupply > 0 ? recyclerCSStock / avgTotalSupply : 0; // fallback when no market data yet

    return RECYCLER_PAYMENT_RATIO / (1 + stockRatio);
}

export function processFacilityContraction(
    planet: Planet,
    facility: ProductionFacility,
    agent: Agent,
    targetMax: number,
    replacementCost: number,
    gameState: GameState,
): boolean {
    const agentAssets = agent.assets[planet.id];
    if (!agentAssets) {
        return false;
    }

    const csPrice = planet.marketPrices[constructionServiceResourceType.name] ?? 1;

    const recoveredCS = replacementCost * RECYCLER_BASE_RECOVERY_EFFICIENCY;
    const marketValue = recoveredCS * csPrice;

    const recycler = planet.recycler;
    if (!recycler) {
        return false;
    }
    const recyclerAssets = recycler.assets[planet.id];
    if (!recyclerAssets) {
        return false;
    }

    // Dynamic payment ratio decreases as recycler's CS buffer grows
    const dynamicRatio = getRecyclerPaymentRatio(planet);
    const payment = marketValue * dynamicRatio;

    // If recycler has insufficient deposits, grant an immediate loan to cover the gap
    if (recyclerAssets.deposits < payment) {
        const deficit = payment - recyclerAssets.deposits;
        grantLoan(recyclerAssets, planet.bank, deficit, 'bufferCoverage', gameState.tick);
    }

    // Transfer payment from recycler to agent
    recyclerAssets.deposits -= payment;
    agentAssets.deposits += payment;

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
