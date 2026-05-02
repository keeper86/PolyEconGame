import { FOREX_MM_COUNT, FOREX_MM_SEED_LOAN, FOREX_MM_WORKING_CAPITAL } from '../constants';
import { makeAgentPlanetAssets, makeStorage } from '../initialUniverse/helpers';
import { grantLoan } from '../financial/loanTypes';
import type { Agent, GameState } from '../planet/planet';

export function seedForexMarketMakers(gameState: GameState): void {
    const planets = Array.from(gameState.planets.values());

    for (const homePlanet of planets) {
        for (let i = 0; i < FOREX_MM_COUNT; i++) {
            const mmId = `mm_${homePlanet.id}_${i}`;

            const mm: Agent = {
                id: mmId,
                name: `Forex MM ${i + 1} (${homePlanet.name})`,
                automated: true,
                automateWorkerAllocation: false,
                foundedTick: 0,
                starterLoanTaken: true,
                associatedPlanetId: homePlanet.id,
                ships: [],
                assets: {},
            };

            // --- Home planet: working-capital loan ---
            const homeStorage = makeStorage({
                planetId: homePlanet.id,
                id: `${mmId}_store_${homePlanet.id}`,
                name: 'MM Storage',
            });
            const homeAssets = makeAgentPlanetAssets(homePlanet.id, [], homeStorage);
            homeAssets.licenses = { commercial: { acquiredTick: 0, frozen: false } };
            homeAssets.market = { sell: {}, buy: {} };
            grantLoan(homeAssets, homePlanet.bank, FOREX_MM_WORKING_CAPITAL, 'forexWorkingCapital', 0);
            mm.assets[homePlanet.id] = homeAssets;

            // --- Foreign planets: seeding loans ---
            for (const foreignPlanet of planets) {
                if (foreignPlanet.id === homePlanet.id) {
                    continue;
                }
                const foreignStorage = makeStorage({
                    planetId: foreignPlanet.id,
                    id: `${mmId}_store_${foreignPlanet.id}`,
                    name: 'MM Storage',
                });
                const foreignAssets = makeAgentPlanetAssets(foreignPlanet.id, [], foreignStorage);
                foreignAssets.licenses = { commercial: { acquiredTick: 0, frozen: false } };
                foreignAssets.market = { sell: {}, buy: {} };
                grantLoan(foreignAssets, foreignPlanet.bank, FOREX_MM_SEED_LOAN, 'forexWorkingCapital', 0);
                mm.assets[foreignPlanet.id] = foreignAssets;
            }

            gameState.forexMarketMakers.set(mm.id, mm);
        }
    }
}
