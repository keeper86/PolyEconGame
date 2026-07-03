import { RECYCLER_BASE_RECOVERY_EFFICIENCY, RECYCLER_PAYMENT_RATIO, RECYCLER_SEED_CAPITAL } from '../constants';
import { grantLoan } from '../financial/loanTypes';
import { makeAgentPlanetAssets, makeStorage } from '../initialUniverse/helpers';
import type { Agent, AgentPlanetAssets, GameState, Planet } from '../planet/planet';
import { putIntoStorageFacility } from '../planet/facility';
import { constructionServiceResourceType } from '../planet/services';

export function createRecyclerAgent(planet: Planet): void {
    if (planet.recycler) {
        console.warn(`[worker] Recycler already exists on planet ${planet.name}`);
        return;
    }
    const recyclerId = `recycler_${planet.id}`;

    const storage = makeStorage({
        planetId: planet.id,
        id: `${recyclerId}_store`,
        name: 'Recycler CS Storage',
        scale: 1,
        volumeCapacity: 1e6, // services have 0 volume/mass, but we need some capacity
        massCapacity: 1e6,
    });

    const assets = makeAgentPlanetAssets(planet.id, [], storage);
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

    // The Recycler gets a working capital loan to pay for buy-backs
    grantLoan(assets, planet.bank, RECYCLER_SEED_CAPITAL, 'starter', 0);

    const recycler: Agent = {
        id: recyclerId,
        name: `Recycler (${planet.name})`,
        automated: true,
        automateWorkerAllocation: false,
        foundedTick: 0,
        starterLoanTaken: true,
        associatedPlanetId: planet.id,
        ships: [],
        assets: { [planet.id]: assets },
    };

    planet.recycler = recycler;
}

/**
 * Process the contraction (scrapping) payment for a production facility.
 *
 * 1. Determines the market value of the recoverable Construction Services.
 * 2. Calculates the payment the recycler must make to the agent.
 * 3. Issues a buffer loan to the recycler if it has insufficient deposits.
 * 4. Transfers deposits from recycler → agent.
 * 5. Deposits the recovered CS into the recycler's storage.
 *
 * @returns true if the payment was processed successfully.
 */
export function processContractionPayment(
    planet: Planet,
    agentAssets: AgentPlanetAssets,
    replacementCost: number,
    gameState: GameState,
): boolean {
    const csPrice = planet.marketPrices[constructionServiceResourceType.name] ?? 1;

    const recoveredCS = replacementCost * RECYCLER_BASE_RECOVERY_EFFICIENCY;
    const marketValue = recoveredCS * csPrice;
    const payment = marketValue * RECYCLER_PAYMENT_RATIO;

    const recycler = planet.recycler;
    if (!recycler) {
        return false;
    }
    const recyclerAssets = recycler.assets[planet.id];
    if (!recyclerAssets) {
        return false;
    }

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

    return true;
}
