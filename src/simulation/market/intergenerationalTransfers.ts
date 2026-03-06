/**
 * market/intergenerationalTransfers.ts
 *
 * Implements structured intergenerational transfers (Subsystem 5).
 *
 * ## Priority model
 *
 * Supporters (working-age, able-bodied) share wealth with dependents
 * (children 0–CHILD_MAX_AGE, elderly ≥ ELDERLY_MIN_AGE, disabled) in a
 * strict priority order that reflects physiological reality:
 *
 *   **Phase 1 — Supporter survival food:**
 *     Supporters reserve wealth to cover SUPPORTER_SURVIVAL_FRACTION of
 *     their own food target.  This is the minimum they need to stay alive
 *     and productive.  No transfers occur from wealth below this line.
 *
 *   **Phase 2 — Dependent daily consumption:**
 *     Fill dependents' food stock up to 1 tick of consumption (not buffer).
 *     This prevents acute starvation of dependents while the supporter is
 *     already nutritionally stressed.
 *
 *   **Phase 3 — Supporter buffer:**
 *     Supporters fill their own food buffer up to the precautionary reserve.
 *     This ensures the parent can sustain work → production → food cycle.
 *
 *   **Phase 4 — Dependent buffer:**
 *     Fill dependents' food stock up to the full food target (buffer).
 *
 * Within each phase, the supporter category priority is:
 *   children → elderly → disabled.
 *
 * ## Tracking
 *
 * Per-age net transfer balances (positive = receiver, negative = giver)
 * are written to `planet.foodMarket.lastTransferBalances` so the frontend
 * can visualise them without re-running the simulation on the client.
 *
 * ## Constraints
 *
 * - All transfers are wealth transfers (currency units).
 * - No negative deposits — supporter can only give what exceeds their floor.
 * - Transfer amount is always min(need, available surplus).
 * - Education levels are matched independently.
 * - Total wealth is conserved (zero-sum transfers).
 */

import type { EducationLevelType, GameState, Occupation, Planet, WealthDemography } from '../planet';
import { educationLevelKeys, OCCUPATIONS } from '../planet';
import {
    CHILD_MAX_AGE,
    ELDERLY_MIN_AGE,
    FOOD_BUFFER_TARGET_TICKS,
    FOOD_PER_PERSON_PER_TICK,
    GENERATION_GAP,
    PRECAUTIONARY_RESERVE_TICKS,
    SUPPORTER_SURVIVAL_FRACTION,
} from '../constants';
import { getWealthDemography } from '../population/populationHelpers';
import { getFoodBufferDemography, ensureFoodMarket } from './foodMarketHelpers';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Supporter occupations — only working/available people can give. */
const SUPPORTER_OCCS: Occupation[] = ['company', 'government', 'unoccupied'];

/** A (dependentAge, supporterAge, depOcc-filter) pair to process. */
interface TransferPair {
    dependentAge: number;
    supporterAge: number;
    /** If set, only transfer to this specific occupation (for disabled). */
    depOccFilter?: Occupation;
}

// ---------------------------------------------------------------------------
// Main tick
// ---------------------------------------------------------------------------

/**
 * Execute intergenerational transfers for all planets.
 *
 * Called AFTER food market clearing and BEFORE wealth diffusion.
 */
export function intergenerationalTransfersTick(gameState: GameState): void {
    gameState.planets.forEach((planet) => {
        intergenerationalTransfersForPlanet(planet);
    });
}

function intergenerationalTransfersForPlanet(planet: Planet): void {
    const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
    planet.foodMarket = foodMarket;

    const demography = planet.population.demography;
    const wealthDemography = getWealthDemography(planet.population);
    const foodBuffers = getFoodBufferDemography(foodMarket, planet.population);
    const foodPrice = foodMarket.foodPrice;

    const foodTargetPerPerson = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;
    const survivalFloor = SUPPORTER_SURVIVAL_FRACTION * foodTargetPerPerson * foodPrice;
    const precautionaryReserve = PRECAUTIONARY_RESERVE_TICKS * FOOD_PER_PERSON_PER_TICK * foodPrice;

    // Per-age balance tracker (positive = received, negative = given)
    const balances = new Array<number>(demography.length).fill(0);

    // ---------------------------------------------------------------
    // Build transfer pair lists
    // ---------------------------------------------------------------

    const childPairs: TransferPair[] = [];
    for (let childAge = 0; childAge <= CHILD_MAX_AGE && childAge < demography.length; childAge++) {
        const supporterAge = childAge + GENERATION_GAP;
        if (supporterAge < demography.length) {
            childPairs.push({ dependentAge: childAge, supporterAge });
        }
    }

    const elderlyPairs: TransferPair[] = [];
    for (let elderlyAge = ELDERLY_MIN_AGE; elderlyAge < demography.length; elderlyAge++) {
        const supporterAge = elderlyAge - GENERATION_GAP;
        if (supporterAge >= 0 && supporterAge < demography.length) {
            elderlyPairs.push({ dependentAge: elderlyAge, supporterAge });
        }
    }

    const disabledPairs: TransferPair[] = [];
    for (let age = CHILD_MAX_AGE + 1; age < ELDERLY_MIN_AGE && age < demography.length; age++) {
        let hasDisabled = false;
        for (const edu of educationLevelKeys) {
            if ((demography[age][edu].unableToWork ?? 0) > 0) {
                hasDisabled = true;
                break;
            }
        }
        if (!hasDisabled) {
            continue;
        }
        const sup1 = age - GENERATION_GAP;
        if (sup1 >= 0 && sup1 < demography.length) {
            disabledPairs.push({ dependentAge: age, supporterAge: sup1, depOccFilter: 'unableToWork' });
        }
        const sup2 = age + GENERATION_GAP;
        if (sup2 < demography.length) {
            disabledPairs.push({ dependentAge: age, supporterAge: sup2, depOccFilter: 'unableToWork' });
        }
    }

    // All pairs in priority order: children → elderly → disabled
    const allPairs = [...childPairs, ...elderlyPairs, ...disabledPairs];

    // ---------------------------------------------------------------
    // Phase 1: Supporter survival is implicit — survivalFloor is the
    //          floor below which a supporter won't transfer.
    //          (No action needed — the floor is applied in the helper.)
    // ---------------------------------------------------------------

    // ---------------------------------------------------------------
    // Phase 2: Fill dependent daily consumption (1 tick of food)
    // ---------------------------------------------------------------
    const oneTick = FOOD_PER_PERSON_PER_TICK;
    for (const pair of allPairs) {
        const depOccs: Occupation[] = pair.depOccFilter ? [pair.depOccFilter] : [...OCCUPATIONS];
        for (const edu of educationLevelKeys) {
            for (const depOcc of depOccs) {
                const transferred = transferWealth(
                    demography,
                    wealthDemography,
                    foodBuffers,
                    pair.dependentAge,
                    pair.supporterAge,
                    edu,
                    depOcc,
                    oneTick, // dependent target = 1 tick consumption
                    survivalFloor,
                    foodPrice,
                );
                balances[pair.dependentAge] += transferred;
                balances[pair.supporterAge] -= transferred;
            }
        }
    }

    // ---------------------------------------------------------------
    // Phase 3: Supporter buffer — no transfers in this phase.
    //          The supporter simply keeps their wealth for their own
    //          food purchasing.  The precautionaryReserve acts as the
    //          new floor for Phase 4.
    // ---------------------------------------------------------------

    // ---------------------------------------------------------------
    // Phase 4: Fill dependent buffer (full food target)
    // ---------------------------------------------------------------
    for (const pair of allPairs) {
        const depOccs: Occupation[] = pair.depOccFilter ? [pair.depOccFilter] : [...OCCUPATIONS];
        for (const edu of educationLevelKeys) {
            for (const depOcc of depOccs) {
                const transferred = transferWealth(
                    demography,
                    wealthDemography,
                    foodBuffers,
                    pair.dependentAge,
                    pair.supporterAge,
                    edu,
                    depOcc,
                    foodTargetPerPerson, // dependent target = full buffer
                    precautionaryReserve,
                    foodPrice,
                );
                balances[pair.dependentAge] += transferred;
                balances[pair.supporterAge] -= transferred;
            }
        }
    }

    // Write balances into the food market for frontend consumption
    foodMarket.lastTransferBalances = balances;
}

// ---------------------------------------------------------------------------
// Transfer helper
// ---------------------------------------------------------------------------

/**
 * Transfer wealth from supporter to a single dependent edu×occ cell.
 *
 * @param dependentFoodTarget   How many tons/person of food the dependent
 *                              should have after the transfer (e.g. 1 tick
 *                              in Phase 2, full buffer in Phase 4).
 * @param supporterFloor        Minimum wealth/person the supporter retains
 *                              (survivalFloor in Phase 2, precautionaryReserve
 *                              in Phase 4).
 * @param foodPrice             Current food price.
 * @returns Total currency transferred.
 */
function transferWealth(
    demography: { [L in EducationLevelType]: { [O in Occupation]: number } }[],
    wealthDemography: WealthDemography,
    foodBuffers: { [L in EducationLevelType]: { [O in Occupation]: { foodStock: number } } }[],
    dependentAge: number,
    supporterAge: number,
    edu: EducationLevelType,
    depOcc: Occupation,
    dependentFoodTarget: number,
    supporterFloor: number,
    foodPrice: number,
): number {
    const depPop = demography[dependentAge][edu][depOcc];
    if (depPop <= 0) {
        return 0;
    }

    const fb = foodBuffers[dependentAge][edu][depOcc];
    const gap = Math.max(0, dependentFoodTarget - fb.foodStock);
    if (gap <= 0) {
        return 0;
    }

    let subsistenceNeed = gap * foodPrice * depPop;
    let totalTransferred = 0;

    for (const supOcc of SUPPORTER_OCCS) {
        if (subsistenceNeed <= 0) {
            break;
        }
        const supPop = demography[supporterAge][edu][supOcc];
        if (supPop <= 0) {
            continue;
        }
        const supWealth = wealthDemography[supporterAge][edu][supOcc];
        const surplus = Math.max(0, supWealth.mean - supporterFloor);
        if (surplus <= 0) {
            continue;
        }

        const totalSurplus = surplus * supPop;
        const transfer = Math.min(subsistenceNeed, totalSurplus);
        const transferPerSupporter = transfer / supPop;
        const transferPerDependent = transfer / depPop;

        // Debit supporter
        wealthDemography[supporterAge][edu][supOcc] = {
            mean: supWealth.mean - transferPerSupporter,
            variance: supWealth.variance,
        };

        // Credit dependent
        const depWealth = wealthDemography[dependentAge][edu][depOcc];
        wealthDemography[dependentAge][edu][depOcc] = {
            mean: depWealth.mean + transferPerDependent,
            variance: depWealth.variance,
        };

        subsistenceNeed -= transfer;
        totalTransferred += transfer;
    }

    return totalTransferred;
}
