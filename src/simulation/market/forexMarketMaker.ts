import { FOREX_MM_COUNT, FOREX_MM_SEED_LOAN, FOREX_MM_WORKING_CAPITAL } from '../constants';
import { makeAgentPlanetAssets, makeStorage } from '../initialUniverse/helpers';
import type { Agent, GameState } from '../planet/planet';

/**
 * Create FOREX_MM_COUNT market-maker agents per planet and seed them with
 * loan-funded deposits on every planet.  The agents are stored in
 * `gameState.forexMarketMakers` (not `gameState.agents`) so they bypass
 * the normal financial/production tick.
 *
 * For each home planet H and MM index i:
 *   - MM receives a working-capital loan from H (FOREX_MM_WORKING_CAPITAL H-credits).
 *   - For every foreign planet F, MM receives a seeding loan from F
 *     (FOREX_MM_SEED_LOAN F-credits) so it starts with F-currency inventory.
 *
 * Both sides of each loan are recorded symmetrically on the central-bank
 * balance sheet (bank.loans += amount, bank.deposits += amount) to preserve
 * the monetary-conservation invariant.
 */
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
            homeAssets.deposits += FOREX_MM_WORKING_CAPITAL;
            homeAssets.loans += FOREX_MM_WORKING_CAPITAL;
            homePlanet.bank.loans += FOREX_MM_WORKING_CAPITAL;
            homePlanet.bank.deposits += FOREX_MM_WORKING_CAPITAL;
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
                foreignAssets.deposits += FOREX_MM_SEED_LOAN;
                foreignAssets.loans += FOREX_MM_SEED_LOAN;
                foreignPlanet.bank.loans += FOREX_MM_SEED_LOAN;
                foreignPlanet.bank.deposits += FOREX_MM_SEED_LOAN;
                mm.assets[foreignPlanet.id] = foreignAssets;
            }

            gameState.forexMarketMakers.set(mm.id, mm);
        }
    }
}
