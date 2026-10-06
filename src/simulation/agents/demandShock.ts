import { grantLoan } from '../financial/loanTypes';
import { distributeWealthChangeTracked } from '../financial/wealthOps';
import { forEachPopulationCohort } from '../population/population';
import type { GameState, Planet } from '../planet/planet';

let shockStartTick: number | null = null;
let shockEndTick = 0;
let shockPerCapitaPerTick = 0;

export const setDemandShock = (startTick: number, ticks: number, perCapitaPerTick: number): void => {
    shockStartTick = startTick;
    shockEndTick = startTick + ticks;
    shockPerCapitaPerTick = perCapitaPerTick;
};

export function demandShockTick(gameState: GameState, planet: Planet): number {
    if (shockStartTick === null || shockPerCapitaPerTick <= 0) {
        return 0;
    }
    const tick = gameState.tick;
    if (tick < shockStartTick || tick >= shockEndTick) {
        return 0;
    }
    const govAssets = gameState.agents.get(planet.governmentId)?.assets[planet.id];
    if (!govAssets) {
        return 0;
    }

    const demography = planet.population.demography;
    let population = 0;
    for (let age = 0; age < demography.length; age++) {
        forEachPopulationCohort(demography[age], (cat) => {
            population += cat.total;
        });
    }

    const needed = shockPerCapitaPerTick * population;
    if (needed <= 0) {
        return 0;
    }

    if (govAssets.deposits < needed) {
        grantLoan(govAssets, planet.bank, needed - govAssets.deposits, 'governmentSupport', tick);
    }

    let total = 0;
    for (let age = 0; age < demography.length; age++) {
        forEachPopulationCohort(demography[age], (cat, occ, edu) => {
            if (cat.total <= 0) {
                return;
            }
            total += distributeWealthChangeTracked(demography, age, occ, edu, shockPerCapitaPerTick);
        });
    }

    govAssets.deposits -= total;
    planet.bank.householdDeposits += total;
    planet.governmentSupportVolume += total;
    return total;
}
