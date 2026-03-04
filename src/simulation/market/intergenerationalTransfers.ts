/**
 * market/intergenerationalTransfers.ts
 *
 * Implements structured intergenerational transfers (Subsystem 5).
 *
 * ## Overview
 *
 * Any person with positive support capacity (working-age adults AND wealthy
 * elderly) shares wealth with dependents (children, low-wealth elderly,
 * disabled) using a multi-modal Gaussian weight kernel over age distance
 * and education-agnostic aggregation.
 *
 * ## Design Principles
 *
 * 1. **No education matching** — transfers aggregate across education
 *    levels.  Dependents receive support regardless of their education.
 *
 * 2. **Intra-cohort support** — working individuals first support
 *    same-age unoccupied and disabled adults (spousal / peer pooling)
 *    before vertical intergenerational transfers.
 *
 * 3. **Multi-modal Gaussian kernel** — support weight has peaks at
 *    n × GENERATION_GAP (n = 1..GENERATION_KERNEL_N), so grandparents
 *    and great-grandparents contribute with realistic decay.
 *
 * 4. **Continuous support capacity** — replaces the binary supporter /
 *    dependent classification.  `supportCapacity(age)` returns a value
 *    in [0, 1] that ramps up from age 16→22, plateaus 22→60, gently
 *    declines 60→75, and drops steeply 75→maxAge.  This determines
 *    what fraction of effective surplus is available for transfer AND
 *    sets the survival floor (elderly get a lower floor, enabling
 *    emergent age-selective die-off under starvation).
 *
 * 5. **Frozen surplus snapshot** — supporter surplus is computed once
 *    and frozen before any transfers.  No iterative recomputation
 *    prevents circular flows within a phase.
 *
 * 6. **Inequality-sensitive capacity** — uses wealth variance to
 *    compute a transfer friction coefficient, reducing effective
 *    transfer capacity when within-cell inequality is high.
 *
 * ## Phase Order
 *
 *   Phase 0 — Snapshot:
 *     Compute per-age aggregate supporter surplus and dependent need.
 *     Freeze surplus pool.
 *
 *   Phase 1 — Intra-cohort pooling:
 *     Working → unoccupied + disabled (same age).
 *     Fill 1-tick survival needs first.
 *
 *   Phase 2 — Vertical survival transfers:
 *     All dependents.  Use support weight kernel.
 *     Fill 1 tick consumption target.
 *
 *   Phase 3 — Buffer allocation (intentionally non-frozen):
 *     Recompute remaining surplus from live wealth (after Phase 1+2
 *     mutations) against the precautionary reserve floor.  This is NOT
 *     a frozen snapshot — it reflects how much supporters actually have
 *     left.  Allocates remaining surplus proportionally toward the full
 *     food buffer target.
 *
 *   Phase 4 — Write transfer matrix.
 *     Ensure exact wealth conservation.
 *
 * ## Tracking
 *
 * Full-resolution per-cell (age × education × occupation) net transfer
 * amounts are written to `planet.foodMarket.lastTransferMatrix` so the
 * frontend can visualise them without re-running the simulation on the
 * client.  Positive = received, negative = given.  Global sum = 0.
 *
 * ## Invariants
 *
 * - Total wealth is conserved exactly (zero-sum transfers).
 * - No negative wealth.
 * - No transfer below the age-appropriate survival floor.
 * - Deterministic given state.
 * - No order dependence (weight-kernel proportional allocation).
 * - Complexity linear in demographic state size.
 */

import type {
    EducationLevelType,
    GameState,
    Occupation,
    Planet,
    TransferCohort,
    TransferMatrix,
    WealthDemography,
} from '../planet';
import { educationLevelKeys, OCCUPATIONS } from '../planet';
import {
    CHILD_MAX_AGE,
    ELDERLY_MIN_AGE,
    ELDERLY_FLOOR_FRACTION,
    FOOD_BUFFER_TARGET_TICKS,
    FOOD_PER_PERSON_PER_TICK,
    GENERATION_GAP,
    GENERATION_KERNEL_N,
    PRECAUTIONARY_RESERVE_TICKS,
    SUPPORTER_SURVIVAL_FRACTION,
    SUPPORT_WEIGHT_SIGMA,
} from '../constants';
import { getWealthDemography } from '../population/populationHelpers';
import { getFoodBufferDemography, ensureFoodMarket } from './foodMarketHelpers';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Supporter occupations — anyone with wealth above the survival floor can give.
 *  Includes 'unableToWork' so that wealthy retired / disabled elderly transfer
 *  surplus to dependents.  The continuous `supportCapacity` curve and the
 *  age-appropriate survival floor naturally limit how much they actually give;
 *  once their wealth drops to the floor they become net receivers instead.  */
const SUPPORTER_OCCS: ReadonlySet<Occupation> = new Set(['company', 'government', 'unoccupied', 'unableToWork']);

/** Dependent occupations for intra-cohort pooling (same-age dependents). */
const INTRA_COHORT_DEPENDENT_OCCS: ReadonlySet<Occupation> = new Set(['unoccupied', 'unableToWork']);

/** Per-age aggregated snapshot of supporter surplus. */
interface SurplusSnapshot {
    /** Total surplus wealth available for transfer (currency units). */
    totalSurplus: number;
    /** Total supporter population contributing to this surplus. */
    totalPop: number;
}

/** Per-age aggregated dependent need. */
interface DependentNeed {
    /** Total currency needed to fill food stock to the target level. */
    totalNeed: number;
    /** Total dependent population at this age. */
    totalPop: number;
}

// ---------------------------------------------------------------------------
// Continuous support capacity
// ---------------------------------------------------------------------------

/**
 * Continuous support capacity as a function of age.
 *
 * Returns a value in [0, 1] representing what fraction of a person's
 * effective surplus is available for intergenerational transfers.
 *
 *   age < 16          → 0.0   (children never support)
 *   16 ≤ age < 22     → linear ramp from 0 → 1
 *   22 ≤ age ≤ 60     → 1.0   (prime working-age plateau)
 *   60 < age ≤ 75     → linear decline from 1 → 0.4
 *   75 < age ≤ 100    → linear decline from 0.4 → 0.1
 *   age > 100         → 0.1   (clamped)
 *
 * The curve is monotone in each segment and continuous everywhere.
 * Elderly with capacity > 0 can still give — they just give less.
 */
export function supportCapacity(age: number): number {
    if (age < 16) {
        return 0;
    }
    if (age < 22) {
        return (age - 16) / 6; // linear ramp 0→1 over ages 16–21
    }
    if (age <= 60) {
        return 1;
    }
    if (age <= 75) {
        return 1 - (0.6 * (age - 60)) / 15; // 1→0.4 over ages 61–75
    }
    if (age <= 100) {
        return 0.4 - (0.3 * (age - 75)) / 25; // 0.4→0.1 over ages 76–100
    }
    return 0.1;
}

/**
 * Age-appropriate survival floor.
 *
 * Working-age supporters retain `SUPPORTER_SURVIVAL_FRACTION` of the food
 * target before giving.  Elderly supporters retain a lower fraction
 * (`ELDERLY_FLOOR_FRACTION`), meaning they deplete faster under scarcity —
 * producing emergent age-selective mortality without an explicit parameter.
 *
 * Between ELDERLY_MIN_AGE-5 and ELDERLY_MIN_AGE the floor transitions
 * linearly so there is no cliff.
 */
export function survivalFloorForAge(age: number, baseFoodCost: number): number {
    if (age < ELDERLY_MIN_AGE - 5) {
        return SUPPORTER_SURVIVAL_FRACTION * baseFoodCost;
    }
    if (age >= ELDERLY_MIN_AGE) {
        return ELDERLY_FLOOR_FRACTION * baseFoodCost;
    }
    // Linear transition zone: ages (ELDERLY_MIN_AGE-5) to ELDERLY_MIN_AGE
    const t = (age - (ELDERLY_MIN_AGE - 5)) / 5;
    const frac = SUPPORTER_SURVIVAL_FRACTION * (1 - t) + ELDERLY_FLOOR_FRACTION * t;
    return frac * baseFoodCost;
}

// ---------------------------------------------------------------------------
// Multi-modal Gaussian weight kernel
// ---------------------------------------------------------------------------

/**
 * Compute the unnormalised multi-modal Gaussian support weight.
 *
 *   w(Δ) = max_{n=1}^{N}  exp( − (|Δ| − n·G)² / (2σ²) )
 *
 * Peaks at Δ = G, 2G, 3G, … NG.
 *
 *   n=1 → parent ↔ child   (Δ ≈ 25)
 *   n=2 → grandparent ↔ grandchild (Δ ≈ 50)
 *   n=3 → great-grandparent ↔ great-grandchild (Δ ≈ 75)
 */
export function supportWeight(ageDifference: number): number {
    const sigma = SUPPORT_WEIGHT_SIGMA;
    const absDiff = Math.abs(ageDifference);
    let best = 0;
    for (let n = 1; n <= GENERATION_KERNEL_N; n++) {
        const delta = absDiff - n * GENERATION_GAP;
        const w = Math.exp(-(delta * delta) / (2 * sigma * sigma));
        if (w > best) {
            best = w;
        }
    }
    return best;
}

// ---------------------------------------------------------------------------
// Inequality-sensitive effective surplus
// ---------------------------------------------------------------------------

/**
 * Compute the fraction of a cohort-cell's surplus that is effectively
 * transferable, accounting for intra-cell wealth inequality.
 *
 * We use a transfer friction coefficient:
 *   α = 1 / (1 + cv²)
 * where cv² = variance / mean².
 *
 * When variance = 0 (all equal), α = 1 → full surplus.
 * When cv = 1, α = 0.5 → half the naive surplus is transferable.
 *
 * effectiveSurplus = α × max(mean − floor, 0) × population
 */
export function effectiveSurplus(mean: number, variance: number, floor: number, population: number): number {
    const naiveSurplus = Math.max(0, mean - floor);
    if (naiveSurplus <= 0 || population <= 0) {
        return 0;
    }
    const cv2 = mean > 0 ? variance / (mean * mean) : 0;
    const alpha = 1 / (1 + cv2);
    return alpha * naiveSurplus * population;
}

// ---------------------------------------------------------------------------
// Transfer matrix helpers
// ---------------------------------------------------------------------------

/** Create a zero-initialised transfer matrix for `numAges` age slots. */
export function createZeroTransferMatrix(numAges: number): TransferMatrix {
    const matrix: TransferMatrix = new Array(numAges);
    for (let age = 0; age < numAges; age++) {
        const cohort = {} as TransferCohort;
        for (const edu of educationLevelKeys) {
            cohort[edu] = {} as { [O in Occupation]: number };
            for (const occ of OCCUPATIONS) {
                cohort[edu][occ] = 0;
            }
        }
        matrix[age] = cohort;
    }
    return matrix;
}

/** Sum all cells of a transfer matrix (should be ~0 for a balanced system). */
export function sumTransferMatrix(matrix: TransferMatrix): number {
    let total = 0;
    for (let age = 0; age < matrix.length; age++) {
        for (const edu of educationLevelKeys) {
            for (const occ of OCCUPATIONS) {
                total += matrix[age][edu][occ];
            }
        }
    }
    return total;
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
    const numAges = demography.length;

    const foodTargetPerPerson = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;
    const baseFoodCost = foodTargetPerPerson * foodPrice;
    const precautionaryReserve = PRECAUTIONARY_RESERVE_TICKS * FOOD_PER_PERSON_PER_TICK * foodPrice;
    const oneTickFood = FOOD_PER_PERSON_PER_TICK;

    // Per-cell transfer matrix (age × edu × occ): positive = received, negative = given
    const transferMatrix: TransferMatrix = createZeroTransferMatrix(numAges);

    // Pre-compute per-age support capacity and survival floor
    const capacities = new Array<number>(numAges);
    const floors = new Array<number>(numAges);
    for (let age = 0; age < numAges; age++) {
        capacities[age] = supportCapacity(age);
        floors[age] = survivalFloorForAge(age, baseFoodCost);
    }

    // ===================================================================
    // Phase 0 — Snapshot: compute per-age aggregate surplus and needs
    // ===================================================================

    const isDependentAge = (age: number): boolean => age <= CHILD_MAX_AGE || age >= ELDERLY_MIN_AGE;

    // Compute per-age aggregate surplus (across ALL edu levels)
    // Surplus is scaled by supportCapacity — elderly give less per unit wealth.
    const survivalSurplusSnapshot: SurplusSnapshot[] = new Array(numAges);

    for (let age = 0; age < numAges; age++) {
        let totalSurplus = 0;
        let totalSupporterPop = 0;
        const cap = capacities[age];
        const floorForAge = floors[age];

        if (cap > 0) {
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    if (!SUPPORTER_OCCS.has(occ)) {
                        continue;
                    }
                    const pop = demography[age][edu][occ];
                    if (pop <= 0) {
                        continue;
                    }
                    const w = wealthDemography[age][edu][occ];
                    const raw = effectiveSurplus(w.mean, w.variance, floorForAge, pop);
                    totalSurplus += raw * cap;
                    totalSupporterPop += pop;
                }
            }
        }

        survivalSurplusSnapshot[age] = { totalSurplus, totalPop: totalSupporterPop };
    }

    // Compute per-age aggregate dependent need (across ALL edu levels)
    const computeDependentNeeds = (targetPerPerson: number): DependentNeed[] => {
        const needs: DependentNeed[] = new Array(numAges);
        for (let age = 0; age < numAges; age++) {
            let totalNeed = 0;
            let totalPop = 0;

            const collectNeed = (edu: EducationLevelType, occ: Occupation) => {
                const pop = demography[age][edu][occ];
                if (pop <= 0) {
                    return;
                }
                const fb = foodBuffers[age][edu][occ];
                const gap = Math.max(0, targetPerPerson - fb.foodStock);
                totalNeed += gap * foodPrice * pop;
                totalPop += pop;
            };

            if (isDependentAge(age)) {
                for (const edu of educationLevelKeys) {
                    for (const occ of OCCUPATIONS) {
                        collectNeed(edu, occ);
                    }
                }
            }
            // Disabled at working ages are also dependents for vertical transfers
            if (age > CHILD_MAX_AGE && age < ELDERLY_MIN_AGE) {
                for (const edu of educationLevelKeys) {
                    collectNeed(edu, 'unableToWork');
                }
            }

            needs[age] = { totalNeed, totalPop };
        }
        return needs;
    };

    const survivalNeeds = computeDependentNeeds(oneTickFood);

    // ===================================================================
    // Phase 1 — Intra-cohort pooling
    // ===================================================================
    // Within each age cohort that has support capacity, working individuals
    // support same-age unoccupied and disabled adults (spousal / peer pooling).
    // Uses the survival surplus and fills up to 1 tick of food.

    const phase1Used = new Array<number>(numAges).fill(0);

    for (let age = 0; age < numAges; age++) {
        if (capacities[age] <= 0) {
            continue;
        }

        // Compute intra-cohort dependent need (same-age unoccupied + disabled)
        let intraNeed = 0;
        const intraCells: { edu: EducationLevelType; occ: Occupation; pop: number; gap: number }[] = [];

        for (const edu of educationLevelKeys) {
            for (const occ of OCCUPATIONS) {
                if (!INTRA_COHORT_DEPENDENT_OCCS.has(occ)) {
                    continue;
                }
                const pop = demography[age][edu][occ];
                if (pop <= 0) {
                    continue;
                }
                const fb = foodBuffers[age][edu][occ];
                const gap = Math.max(0, oneTickFood - fb.foodStock);
                if (gap <= 0) {
                    continue;
                }
                const need = gap * foodPrice * pop;
                intraNeed += need;
                intraCells.push({ edu, occ, pop, gap });
            }
        }

        if (intraNeed <= 0 || survivalSurplusSnapshot[age].totalSurplus <= 0) {
            continue;
        }

        const available = survivalSurplusSnapshot[age].totalSurplus;
        const transfer = Math.min(intraNeed, available);
        if (transfer <= 0) {
            continue;
        }

        // Distribute transfer proportionally among dependent cells by need
        const ratio = transfer / intraNeed;

        for (const cell of intraCells) {
            const cellTransfer = cell.gap * foodPrice * cell.pop * ratio;
            if (cellTransfer <= 0) {
                continue;
            }

            const depWealth = wealthDemography[age][cell.edu][cell.occ];
            const perCapita = cellTransfer / cell.pop;
            wealthDemography[age][cell.edu][cell.occ] = {
                mean: depWealth.mean + perCapita,
                variance: depWealth.variance,
            };
            // Track credit in transfer matrix
            transferMatrix[age][cell.edu][cell.occ] += cellTransfer;
        }

        // Debit supporters proportionally across all edu × supporter-occ cells
        debitSupporters(demography, wealthDemography, age, transfer, floors[age], transferMatrix);
        phase1Used[age] = transfer;
        // Intra-cohort: giver and receiver are same age → per-cell balances still tracked
    }

    // ===================================================================
    // Phase 2 — Vertical survival transfers (1 tick consumption)
    // ===================================================================
    // Frozen surplus: original snapshot minus Phase 1 usage.

    const remainingSurvivalSurplus: SurplusSnapshot[] = survivalSurplusSnapshot.map((s, age) => ({
        totalSurplus: Math.max(0, s.totalSurplus - phase1Used[age]),
        totalPop: s.totalPop,
    }));

    executeVerticalTransfers(
        demography,
        wealthDemography,
        foodBuffers,
        remainingSurvivalSurplus,
        survivalNeeds,
        transferMatrix,
        numAges,
        floors,
        capacities,
        oneTickFood,
        foodPrice,
    );

    // ===================================================================
    // Phase 3 — Buffer allocation (intentionally non-frozen)
    // ===================================================================
    // Recompute remaining surplus from *live* wealth after Phase 1+2
    // mutations.  This is intentionally NOT a frozen snapshot: it reflects
    // how much supporters actually have left after survival transfers.
    // Uses the precautionary reserve as the floor (higher than survival).

    const remainingBufferSurplus: SurplusSnapshot[] = new Array(numAges);
    for (let age = 0; age < numAges; age++) {
        const cap = capacities[age];
        if (cap > 0) {
            let total = 0;
            let pop = 0;
            // For buffer allocation, use the higher of the age-floor and precautionaryReserve
            const bufFloor = Math.max(floors[age], precautionaryReserve);
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    if (!SUPPORTER_OCCS.has(occ)) {
                        continue;
                    }
                    const p = demography[age][edu][occ];
                    if (p <= 0) {
                        continue;
                    }
                    const w = wealthDemography[age][edu][occ];
                    total += effectiveSurplus(w.mean, w.variance, bufFloor, p) * cap;
                    pop += p;
                }
            }
            remainingBufferSurplus[age] = { totalSurplus: total, totalPop: pop };
        } else {
            remainingBufferSurplus[age] = { totalSurplus: 0, totalPop: 0 };
        }
    }

    // Recompute buffer need: subtract what dependents can self-fund from
    // wealth they already received in Phase 2.
    const remainingBufferNeeds: DependentNeed[] = new Array(numAges);
    for (let age = 0; age < numAges; age++) {
        let totalNeed = 0;
        let totalPop = 0;

        const collectNeed = (edu: EducationLevelType, occ: Occupation) => {
            const pop = demography[age][edu][occ];
            if (pop <= 0) {
                return;
            }
            const fb = foodBuffers[age][edu][occ];
            const w = wealthDemography[age][edu][occ];
            const bufGap = Math.max(0, foodTargetPerPerson - fb.foodStock);
            const costGap = bufGap * foodPrice;
            const selfFund = Math.max(0, w.mean);
            const externalNeed = Math.max(0, costGap - selfFund);
            totalNeed += externalNeed * pop;
            totalPop += pop;
        };

        if (isDependentAge(age)) {
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    collectNeed(edu, occ);
                }
            }
        }
        if (age > CHILD_MAX_AGE && age < ELDERLY_MIN_AGE) {
            for (const edu of educationLevelKeys) {
                collectNeed(edu, 'unableToWork');
            }
        }

        remainingBufferNeeds[age] = { totalNeed, totalPop };
    }

    // Use precautionary reserve as floor for Phase 3
    const bufferFloors = new Array<number>(numAges);
    for (let age = 0; age < numAges; age++) {
        bufferFloors[age] = Math.max(floors[age], precautionaryReserve);
    }

    executeVerticalTransfers(
        demography,
        wealthDemography,
        foodBuffers,
        remainingBufferSurplus,
        remainingBufferNeeds,
        transferMatrix,
        numAges,
        bufferFloors,
        capacities,
        foodTargetPerPerson,
        foodPrice,
    );

    // ===================================================================
    // Phase 4 — Write transfer matrix + dev assertion
    // ===================================================================
    if (process.env.NODE_ENV !== 'production') {
        const matrixSum = sumTransferMatrix(transferMatrix);
        if (Math.abs(matrixSum) > 1e-4) {
            console.warn(`[intergenerationalTransfers] transfer matrix not zero-sum: Δ=${matrixSum.toExponential(4)}`);
        }
    }
    foodMarket.lastTransferMatrix = transferMatrix;
}

// ---------------------------------------------------------------------------
// Vertical transfer execution via weight kernel
// ---------------------------------------------------------------------------

/**
 * Execute vertical transfers from supporter ages to dependent ages using
 * the multi-modal Gaussian support weight kernel.
 *
 * For each dependent age with unmet need:
 *   1. Compute weights from all ages with positive surplus.
 *   2. Request proportional shares from each supporter age.
 *   3. Each supporter age contributes min(requested, remaining surplus).
 *   4. Credit dependents by remaining need (not population).
 *   5. Debit supporters by effective surplus (with friction).
 */
function executeVerticalTransfers(
    demography: { [L in EducationLevelType]: { [O in Occupation]: number } }[],
    wealthDemography: WealthDemography,
    foodBuffers: { [L in EducationLevelType]: { [O in Occupation]: { foodStock: number } } }[],
    surplusPool: SurplusSnapshot[],
    needPool: DependentNeed[],
    transferMatrix: TransferMatrix,
    numAges: number,
    floors: number[],
    capacities: number[],
    _targetPerPerson: number,
    _foodPrice: number,
): void {
    // Mutable copy of remaining surplus per supporter age
    const remaining = surplusPool.map((s) => s.totalSurplus);

    // Collect all dependent ages with non-zero need
    const dependentAges: number[] = [];
    for (let age = 0; age < numAges; age++) {
        if (needPool[age].totalNeed > 0) {
            dependentAges.push(age);
        }
    }

    for (const depAge of dependentAges) {
        const need = needPool[depAge].totalNeed;
        if (need <= 0) {
            continue;
        }

        // Compute support weights from all ages with capacity > 0
        const weightedSuppliers: { supAge: number; weight: number }[] = [];
        let totalWeight = 0;

        for (let supAge = 0; supAge < numAges; supAge++) {
            if (capacities[supAge] <= 0) {
                continue;
            }
            if (remaining[supAge] <= 0) {
                continue;
            }
            if (supAge === depAge) {
                continue; // no self-support in vertical phase
            }

            const ageDiff = Math.abs(supAge - depAge);
            const w = supportWeight(ageDiff);
            if (w < 1e-10) {
                continue;
            }

            weightedSuppliers.push({ supAge, weight: w });
            totalWeight += w;
        }

        if (totalWeight <= 0) {
            continue;
        }

        // Proportional allocation pass
        let totalTransfer = 0;
        const transfers: { supAge: number; amount: number }[] = [];

        for (const { supAge, weight } of weightedSuppliers) {
            const share = (weight / totalWeight) * need;
            const actual = Math.min(share, remaining[supAge]);
            if (actual <= 0) {
                continue;
            }
            transfers.push({ supAge, amount: actual });
            totalTransfer += actual;
        }

        if (totalTransfer <= 0) {
            continue;
        }

        // Debit each supporter age (uses effective surplus for proportional allocation)
        for (const { supAge, amount } of transfers) {
            debitSupporters(demography, wealthDemography, supAge, amount, floors[supAge], transferMatrix);
            remaining[supAge] -= amount;
        }

        // Credit dependent age: distribute by remaining need, not population
        creditDependents(
            demography,
            wealthDemography,
            foodBuffers,
            depAge,
            totalTransfer,
            _targetPerPerson,
            _foodPrice,
            transferMatrix,
        );
    }
}

// ---------------------------------------------------------------------------
// Debit / Credit helpers
// ---------------------------------------------------------------------------

/**
 * Debit `amount` of wealth from supporter occupation cells at `age`,
 * distributed proportionally by each cell's *effective surplus* (including
 * the inequality friction α), so high-variance cells give proportionally
 * less than low-variance cells.
 *
 * Respects `floor` — no cell's mean drops below floor.
 */
function debitSupporters(
    demography: { [L in EducationLevelType]: { [O in Occupation]: number } }[],
    wealthDemography: WealthDemography,
    age: number,
    amount: number,
    floor: number,
    transferMatrix?: TransferMatrix,
): void {
    if (amount <= 0) {
        return;
    }

    interface CellInfo {
        edu: EducationLevelType;
        occ: Occupation;
        pop: number;
        effSurplus: number;
    }

    const cells: CellInfo[] = [];
    let totalEffSurplus = 0;

    for (const edu of educationLevelKeys) {
        for (const occ of OCCUPATIONS) {
            if (!SUPPORTER_OCCS.has(occ)) {
                continue;
            }
            const pop = demography[age][edu][occ];
            if (pop <= 0) {
                continue;
            }
            const w = wealthDemography[age][edu][occ];
            const es = effectiveSurplus(w.mean, w.variance, floor, pop);
            if (es <= 0) {
                continue;
            }
            cells.push({ edu, occ, pop, effSurplus: es });
            totalEffSurplus += es;
        }
    }

    if (totalEffSurplus <= 0) {
        return;
    }

    const actualDebit = Math.min(amount, totalEffSurplus);

    for (const cell of cells) {
        const share = (cell.effSurplus / totalEffSurplus) * actualDebit;
        const perCapita = share / cell.pop;
        const w = wealthDemography[age][cell.edu][cell.occ];
        wealthDemography[age][cell.edu][cell.occ] = {
            mean: Math.max(floor, w.mean - perCapita),
            variance: w.variance,
        };
        // Track total wealth removed from this cell
        if (transferMatrix) {
            transferMatrix[age][cell.edu][cell.occ] -= share;
        }
    }
}

/**
 * Credit `amount` of wealth to population cells at `age`,
 * distributed proportionally by each cell's remaining *need*
 * (food gap × price × pop).  Cells that already have enough
 * food stock or wealth receive less.
 *
 * Falls back to population-proportional if no cell has need > 0
 * (safety net — should rarely happen).
 */
function creditDependents(
    demography: { [L in EducationLevelType]: { [O in Occupation]: number } }[],
    wealthDemography: WealthDemography,
    foodBuffers: { [L in EducationLevelType]: { [O in Occupation]: { foodStock: number } } }[],
    age: number,
    amount: number,
    targetPerPerson: number,
    foodPrice: number,
    transferMatrix?: TransferMatrix,
): void {
    if (amount <= 0) {
        return;
    }

    interface CellInfo {
        edu: EducationLevelType;
        occ: Occupation;
        pop: number;
        need: number;
    }

    const cells: CellInfo[] = [];
    let totalNeed = 0;
    let totalPop = 0;

    for (const edu of educationLevelKeys) {
        for (const occ of OCCUPATIONS) {
            const pop = demography[age][edu][occ];
            if (pop <= 0) {
                continue;
            }
            const fb = foodBuffers[age][edu][occ];
            const w = wealthDemography[age][edu][occ];
            const gap = Math.max(0, targetPerPerson - fb.foodStock);
            const costGap = gap * foodPrice;
            const selfFund = Math.max(0, w.mean);
            const need = Math.max(0, costGap - selfFund) * pop;
            cells.push({ edu, occ, pop, need });
            totalNeed += need;
            totalPop += pop;
        }
    }

    if (totalPop <= 0) {
        return;
    }

    // Distribute by need if possible, otherwise by population
    if (totalNeed > 0) {
        for (const cell of cells) {
            if (cell.need <= 0) {
                continue;
            }
            const share = (cell.need / totalNeed) * amount;
            const perCapita = share / cell.pop;
            const w = wealthDemography[age][cell.edu][cell.occ];
            wealthDemography[age][cell.edu][cell.occ] = {
                mean: w.mean + perCapita,
                variance: w.variance,
            };
            // Track total wealth credited to this cell
            if (transferMatrix) {
                transferMatrix[age][cell.edu][cell.occ] += share;
            }
        }
    } else {
        // Fallback: population-proportional
        for (const cell of cells) {
            const share = (cell.pop / totalPop) * amount;
            const perCapita = share / cell.pop;
            const w = wealthDemography[age][cell.edu][cell.occ];
            wealthDemography[age][cell.edu][cell.occ] = {
                mean: w.mean + perCapita,
                variance: w.variance,
            };
            // Track total wealth credited to this cell
            if (transferMatrix) {
                transferMatrix[age][cell.edu][cell.occ] += share;
            }
        }
    }
}
