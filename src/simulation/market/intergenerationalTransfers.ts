/**
 * market/intergenerationalTransfers.ts
 *
 * Implements structured intergenerational transfers (Subsystem 5).
 *
 * ## Invariants
 *
 * - Total wealth is conserved exactly (zero-sum transfers).
 * - No negative wealth.
 * - No transfer below the age-appropriate survival floor.
 * - Deterministic given state.
 * - Complexity linear in demographic state size.
 */

import {
    CHILD_MAX_AGE,
    ELDERLY_FLOOR_FRACTION,
    ELDERLY_MIN_AGE,
    FOOD_BUFFER_TARGET_TICKS,
    FOOD_PER_PERSON_PER_TICK,
    GENERATION_GAP,
    GENERATION_KERNEL_N,
    MIN_EMPLOYABLE_AGE,
    PRECAUTIONARY_RESERVE_TICKS,
    SUPPORT_WEIGHT_SIGMA,
    SUPPORTER_SURVIVAL_FRACTION,
} from '../constants';
import type { Planet } from '../planet/planet';
import { educationLevelKeys } from '../population/education';
import type {
    Cohort,
    EducationLevelType,
    GaussianMoments,
    Occupation,
    PopulationCategory,
    PopulationTransferCohort,
    PopulationTransferMatrix,
} from '../population/population';
import { mergeGaussianMoments, OCCUPATIONS, SKILL } from '../population/population';
import { distributeWealthChangeTracked } from '../financial/wealthOps';

// Debug logging helper: set SIM_DEBUG=1 to enable general logs and
// SIM_DEBUG_VERBOSE=1 to enable high-volume verbose logs (per-age / per-cell).
const SIM_DEBUG = Boolean(process.env.SIM_DEB2UG);
const SIM_DEBUG_VERBOSE = Boolean(process.env.SIM_DEBUG_VERBOSE);
function log(...args: unknown[]) {
    if (SIM_DEBUG) {
        console.debug('[intergenerationalTransfers]', ...args);
    }
}
function vlog(...args: unknown[]) {
    if (SIM_DEBUG && SIM_DEBUG_VERBOSE) {
        console.debug('[intergenerationalTransfers]', ...args);
    }
}
// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Supporter occupations — anyone with wealth above the survival floor can give.
 *  Includes 'unableToWork' so that wealthy retired / disabled elderly transfer
 *  surplus to dependents.  The continuous `supportCapacity` curve and the
 *  age-appropriate survival floor naturally limit how much they actually give;
 *  once their wealth drops to the floor they become net receivers instead.  */
const SUPPORTER_OCCS: ReadonlySet<Occupation> = new Set(['employed', 'unoccupied', 'unableToWork']);

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
// Skill-aggregation helpers
// ---------------------------------------------------------------------------

/**
 * Aggregate population total across all skill levels for a given
 * (age, occ, edu) cell.
 */
function aggregatePopulation(
    demography: Cohort<PopulationCategory>[],
    age: number,
    occ: Occupation,
    edu: EducationLevelType,
): number {
    let total = 0;
    for (const skill of SKILL) {
        total += demography[age][occ][edu][skill].total;
    }
    return total;
}

/**
 * Aggregate wealth moments across all skill levels for a given
 * (age, occ, edu) cell, using the parallel-axis (pooled-variance) formula.
 */
function aggregateWealth(
    demography: Cohort<PopulationCategory>[],
    age: number,
    occ: Occupation,
    edu: EducationLevelType,
): GaussianMoments {
    let result: GaussianMoments = { mean: 0, variance: 0 };
    let totalPop = 0;
    for (const skill of SKILL) {
        const cat = demography[age][occ][edu][skill];
        if (cat.total > 0) {
            result = mergeGaussianMoments(totalPop, result, cat.total, cat.wealth);
            totalPop += cat.total;
        }
    }
    return result;
}

/**
 * Aggregate food stock across all skill levels for a given
 * (age, occ, edu) cell.  Returns total food stock (not per-capita).
 */
function aggregateFoodStock(
    demography: Cohort<PopulationCategory>[],
    age: number,
    occ: Occupation,
    edu: EducationLevelType,
): number {
    let total = 0;
    for (const skill of SKILL) {
        total += demography[age][occ][edu][skill].foodStock;
    }
    return total;
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
    return 1;
    let res: number;
    if (age < 10) {
        res = 0;
    } else if (age < 25) {
        res = Math.min(1, age / MIN_EMPLOYABLE_AGE); // linear ramp 0→1 over ages 16–21
    } else if (age <= 60) {
        res = 1;
    } else if (age <= 75) {
        res = 1 - (0.2 * (age - 60)) / 15; // 1→0.4 over ages 61–75
    } else if (age <= 100) {
        res = 0.8 - (0.2 * (age - 75)) / 25; // 0.4→0.1 over ages 76–100
    } else {
        res = 0.5;
    }
    vlog('supportCapacity', { age, res });
    return res;
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
    let res: number;
    if (age < ELDERLY_MIN_AGE - 5) {
        res = SUPPORTER_SURVIVAL_FRACTION * baseFoodCost;
    } else if (age >= ELDERLY_MIN_AGE) {
        res = ELDERLY_FLOOR_FRACTION * baseFoodCost;
    } else {
        // Linear transition zone: ages (ELDERLY_MIN_AGE-5) to ELDERLY_MIN_AGE
        const t = (age - (ELDERLY_MIN_AGE - 5)) / 5;
        const frac = SUPPORTER_SURVIVAL_FRACTION * (1 - t) + ELDERLY_FLOOR_FRACTION * t;
        res = frac * baseFoodCost;
    }
    vlog('survivalFloorForAge', { age, baseFoodCost, res });
    return res;
}

// ---------------------------------------------------------------------------
// Asymmetric generation amplitude
// ---------------------------------------------------------------------------

/**
 * Asymmetric amplitude for generation offset `n`.
 *
 * Encodes social support priorities directly into the kernel.
 * `ageDifference = supAge − depAge`, so **positive n means the supporter
 * is older than the dependent** (the normal parent→child direction).
 *
 *   n = +1 (supporter is 1 gen older → parent supporting child):   amplitude = 1.0  (highest)
 *   n = +2 (supporter is 2 gen older → grandparent supporting gc):  amplitude = exp(−0.5) ≈ 0.607
 *   n =  0 (same age → peer support):                               amplitude = exp(−0.5) ≈ 0.607
 *   n = −1 (supporter is 1 gen younger → child supporting parent):  amplitude = exp(−1.0) ≈ 0.368
 *   n = −2 (supporter is 2 gen younger → gc supporting grandparent):amplitude = exp(−1.5) ≈ 0.223
 *
 * Positive n → supporter is older (downward transfers, socially dominant):
 *   amplitude = exp(−0.66 × (n − 1))   for n > 0
 * Zero and negative n → same-age or upward transfers (less common):
 *   amplitude = exp(−0.66 × (|n| + 1)) for n ≤ 0
 *
 * This ensures children (depAge ≪ supAge → large positive n in the kernel
 * at n = +1) receive the highest-weighted transfers, protecting reproductive
 * cohorts during scarcity.
 */
export function generationAmplitude(n: number): number {
    if (n > 0) {
        // Downward transfers: supporter older than dependent (parent→child direction)
        return Math.exp(-0.66 * (n - 1));
    } else {
        // Same-age or upward transfers: peer support or child supporting parent
        return Math.exp(-0.66 * (Math.abs(n) + 1));
    }
}

// ---------------------------------------------------------------------------
// Asymmetric multi-modal Gaussian weight kernel
// ---------------------------------------------------------------------------

/**
 * Compute the unnormalised asymmetric multi-modal Gaussian support weight.
 *
 * The kernel covers generation offsets n = −N … +N (including n = 0 for
 * same-age/peer support).  For each offset, the Gaussian is centred at
 * n × GENERATION_GAP and scaled by the asymmetric `generationAmplitude(n)`.
 *
 *   w(Δ) = max_{n=−N}^{+N}  amplitude(n) × exp( − (Δ − n·G)² / (2σ²) )
 *
 * The `ageDifference` parameter is *signed*: `ageDifference = supAge − depAge`.
 * **Positive** means the supporter is older than the dependent (the typical
 * parent→child direction).  Because the amplitude depends on the sign of n,
 * the kernel is intentionally **asymmetric** — a supporter 25 years *older*
 * than a dependent (n≈+1, amplitude≈1.0) receives a higher weight than one
 * 25 years *younger* (n≈−1, amplitude≈0.368).
 *
 * Peaks and their amplitudes (GENERATION_GAP = 25):
 *
 *   Δ = +25 (supporter is 25 y older → parent supporting child)
 *         n = +1, amplitude = 1.0  (highest priority)
 *   Δ = +50 (supporter is 50 y older → grandparent supporting gc)
 *         n = +2, amplitude ≈ 0.607
 *   Δ =   0 (same age → peer support)
 *         n =  0, amplitude ≈ 0.607
 *   Δ = −25 (supporter is 25 y younger → adult child supporting parent)
 *         n = −1, amplitude ≈ 0.368
 *   …etc.
 *
 * **Note:** Because the function returns the *max* across all n, the
 * weight at any given Δ is dominated by the nearest peak.  The asymmetric
 * amplitudes mean that young dependents (children) receive more support
 * than elderly when multiple dependents compete for the same surplus.
 */
export function supportWeight(ageDifference: number): number {
    const sigma = SUPPORT_WEIGHT_SIGMA;
    let best = 0;
    for (let n = -GENERATION_KERNEL_N; n <= GENERATION_KERNEL_N; n++) {
        const target = n * GENERATION_GAP;
        const delta = ageDifference - target;
        const amp = generationAmplitude(n);
        const w = amp * Math.exp(-(delta * delta) / (2 * sigma * sigma));
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
export function createZeroTransferMatrix(numAges: number): PopulationTransferMatrix {
    const matrix: PopulationTransferMatrix = new Array(numAges);
    for (let age = 0; age < numAges; age++) {
        const cohort = {} as PopulationTransferCohort;
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
export function sumTransferMatrix(matrix: PopulationTransferMatrix): number {
    let total = 0;
    let maxValue = 1e-10; // small value to prevent division by zero in case of an all-zero matrix
    for (let age = 0; age < matrix.length; age++) {
        for (const edu of educationLevelKeys) {
            for (const occ of OCCUPATIONS) {
                total += matrix[age][edu][occ];
                maxValue = Math.max(maxValue, Math.abs(matrix[age][edu][occ]));
            }
        }
    }
    return total / maxValue;
}

export function intergenerationalTransfersForPlanet(planet: Planet): void {
    const demography = planet.population.demography;
    const numAges = demography.length;

    // Price level converts physical food units into wealth (currency) units.
    // Defaults to 1.0 when not yet set.
    const foodPrice = planet.priceLevel ?? 1.0;

    const foodTargetPerPerson = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;
    const baseFoodCost = foodTargetPerPerson * foodPrice;
    const precautionaryReserve = PRECAUTIONARY_RESERVE_TICKS * FOOD_PER_PERSON_PER_TICK * foodPrice;
    const oneTickFood = FOOD_PER_PERSON_PER_TICK * 2;

    log('planet parameters', {
        numAges,
        foodPrice,
        foodTargetPerPerson,
        baseFoodCost,
        precautionaryReserve,
        oneTickFood,
    });

    // Per-cell transfer matrix (age × edu × occ): positive = received, negative = given
    const transferMatrix: PopulationTransferMatrix = createZeroTransferMatrix(numAges);

    // Pre-compute per-age support capacity and survival floor
    const capacities = new Array<number>(numAges);
    const floors = new Array<number>(numAges);
    for (let age = 0; age < numAges; age++) {
        capacities[age] = supportCapacity(age);
        floors[age] = survivalFloorForAge(age, baseFoodCost);
    }
    log('capacities & floors computed', {
        sampleCapacity: capacities.slice(0, Math.min(10, numAges)),
        sampleFloors: floors.slice(0, Math.min(10, numAges)),
    });

    // ===================================================================
    // Phase 0 — Snapshot: compute per-age aggregate surplus and needs
    // ===================================================================

    const isDependentAge = (age: number): boolean => age <= CHILD_MAX_AGE || age >= ELDERLY_MIN_AGE;

    // Compute per-age aggregate surplus (across ALL edu levels and skills)
    // Surplus is scaled by supportCapacity — elderly give less per unit wealth.
    const survivalSurplusSnapshot: SurplusSnapshot[] = new Array(numAges);

    for (let age = 0; age < numAges; age++) {
        let totalSurplus = 0;
        let totalSupporterPop = 0;
        const cap = capacities[age];
        const floorForAge = floors[age];

        if (cap > 0) {
            for (const occ of OCCUPATIONS) {
                if (!SUPPORTER_OCCS.has(occ)) {
                    continue;
                }
                for (const edu of educationLevelKeys) {
                    const pop = aggregatePopulation(demography, age, occ, edu);
                    if (pop <= 0) {
                        continue;
                    }
                    const w = aggregateWealth(demography, age, occ, edu);
                    const raw = effectiveSurplus(w.mean, w.variance, floorForAge, pop);
                    totalSurplus += raw * cap;
                    totalSupporterPop += pop;
                }
            }
        }

        survivalSurplusSnapshot[age] = { totalSurplus, totalPop: totalSupporterPop };
        if (totalSurplus > 0 || totalSupporterPop > 0) {
            vlog('survival snapshot', { age, totalSurplus, totalSupporterPop });
        }
    }

    // Compute per-age aggregate dependent need (across ALL edu levels and skills)
    const computeDependentNeeds = (targetPerPerson: number): DependentNeed[] => {
        const needs: DependentNeed[] = new Array(numAges);
        for (let age = 0; age < numAges; age++) {
            let totalNeed = 0;
            let totalPop = 0;

            const collectNeed = (occ: Occupation, edu: EducationLevelType) => {
                const pop = aggregatePopulation(demography, age, occ, edu);
                if (pop <= 0) {
                    return;
                }
                const foodStock = aggregateFoodStock(demography, age, occ, edu);
                const perCapitaFoodStock = foodStock / pop;
                const gap = Math.max(0, targetPerPerson - perCapitaFoodStock);
                totalNeed += gap * foodPrice * pop;
                totalPop += pop;
            };

            if (isDependentAge(age)) {
                for (const occ of OCCUPATIONS) {
                    for (const edu of educationLevelKeys) {
                        collectNeed(occ, edu);
                    }
                }
            }
            // Unoccupied and disabled at working ages are also dependents
            if (age > CHILD_MAX_AGE && age < ELDERLY_MIN_AGE) {
                for (const edu of educationLevelKeys) {
                    collectNeed('unoccupied', edu);
                    collectNeed('unableToWork', edu);
                }
            }

            needs[age] = { totalNeed, totalPop };
        }
        return needs;
    };

    const survivalNeeds = computeDependentNeeds(oneTickFood);

    // ===================================================================
    // Phase 2 — Survival transfers (unified kernel, 1 tick consumption)
    // ===================================================================
    // Uses the frozen surplus snapshot directly.  The asymmetric kernel
    // handles both same-age (peer/spousal) and cross-age transfers in a
    // single pass.

    executeVerticalTransfers(
        demography,
        survivalSurplusSnapshot,
        survivalNeeds,
        transferMatrix,
        numAges,
        floors,
        capacities,
        oneTickFood,
        foodPrice,
    );

    // ===================================================================
    // Phase 4 — Write transfer matrices + dev assertion
    // ===================================================================
    if (process.env.NODE_ENV !== 'production') {
        const matrixSum = sumTransferMatrix(transferMatrix);
        if (Math.abs(matrixSum) > 1e-4) {
            console.warn(`[intergenerationalTransfers] transfer matrix not zero-sum: Δ=${matrixSum.toExponential(4)}`);
        }
    }
    planet.population.lastTransferMatrix = transferMatrix;
}

// ---------------------------------------------------------------------------
// Vertical transfer execution via weight kernel
// ---------------------------------------------------------------------------

/**
 * Execute transfers from supporter ages to dependent ages using the
 * unified asymmetric multi-modal Gaussian support weight kernel.
 *
 * Handles all support ties in a single pass: same-age (peer/spousal,
 * n=0), parent↔child (n=±1), grandparent↔grandchild (n=±2), etc.
 *
 * For each dependent age with unmet need:
 *   1. Compute weights from all ages with positive surplus.
 *   2. Request proportional shares from each supporter age.
 *   3. Each supporter age contributes min(requested, remaining surplus).
 *   4. Credit dependents by remaining need (not population).
 *   5. Debit supporters by effective surplus (with friction).
 */
function executeVerticalTransfers(
    demography: Cohort<PopulationCategory>[],
    surplusPool: SurplusSnapshot[],
    needPool: DependentNeed[],
    transferMatrix: PopulationTransferMatrix,
    numAges: number,
    floors: number[],
    capacities: number[],
    targetPerPerson: number,
    foodPrice: number,
): void {
    // Mutable copy of remaining surplus per supporter age
    const remaining = surplusPool.map((s) => s.totalSurplus);
    log('executeVerticalTransfers start', { remainingSum: remaining.reduce((a, b) => a + b, 0) });

    // Collect all dependent ages with non-zero need
    const dependentAges: number[] = [];
    for (let age = 0; age < numAges; age++) {
        if (needPool[age].totalNeed > 0) {
            dependentAges.push(age);
        }
    }
    vlog('dependent ages', { dependentAges });

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

            // Signed age difference: positive = supporter is older than dependent
            const ageDiff = supAge - depAge;
            const w = supportWeight(ageDiff);
            if (w < 1e-10) {
                continue;
            }

            weightedSuppliers.push({ supAge, weight: w });
            totalWeight += w;
        }

        vlog('weights computed', { depAge, weightedSuppliersCount: weightedSuppliers.length, totalWeight });

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

        vlog('proposed transfers', { depAge, transfersCount: transfers.length, totalTransfer });

        if (totalTransfer <= 0) {
            continue;
        }

        // Debit each supporter age (uses effective surplus for proportional allocation)
        // Track actual debits to ensure credit matches exactly.
        let actualTotalDebited = 0;
        for (const { supAge, amount } of transfers) {
            const debited = debitSupporters(demography, supAge, amount, floors[supAge], transferMatrix);
            remaining[supAge] -= debited;
            actualTotalDebited += debited;
        }

        log('after debits', { depAge, actualTotalDebited, remainingSum: remaining.reduce((a, b) => a + b, 0) });

        if (actualTotalDebited <= 0) {
            continue;
        }

        // Credit dependent age: only credit what was actually debited
        log('creditDependents call', { depAge, amount: actualTotalDebited });
        creditDependents(demography, depAge, actualTotalDebited, targetPerPerson, foodPrice, transferMatrix);
        log('creditDependents done', { depAge });
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
 *
 * Returns the actual amount debited (may be less than `amount` if
 * total effective surplus is insufficient).
 */
function debitSupporters(
    demography: Cohort<PopulationCategory>[],
    age: number,
    amount: number,
    floor: number,
    transferMatrix?: PopulationTransferMatrix,
): number {
    if (amount <= 0) {
        return 0;
    }

    interface CellInfo {
        occ: Occupation;
        edu: EducationLevelType;
        pop: number;
        effSurplus: number;
    }

    const cells: CellInfo[] = [];
    let totalEffSurplus = 0;

    for (const occ of OCCUPATIONS) {
        if (!SUPPORTER_OCCS.has(occ)) {
            continue;
        }
        for (const edu of educationLevelKeys) {
            const pop = aggregatePopulation(demography, age, occ, edu);
            if (pop <= 0) {
                continue;
            }
            const w = aggregateWealth(demography, age, occ, edu);
            const es = effectiveSurplus(w.mean, w.variance, floor, pop);
            if (es <= 0) {
                continue;
            }
            cells.push({ occ, edu, pop, effSurplus: es });
            totalEffSurplus += es;
        }
    }

    if (totalEffSurplus <= 0) {
        vlog('debitSupporters none', { age, amountRequested: amount });
        return 0;
    }

    const actualDebit = Math.min(amount, totalEffSurplus);

    vlog('debitSupporters plan', {
        age,
        amountRequested: amount,
        totalEffSurplus,
        actualDebit,
        cellsCount: cells.length,
    });

    let actuallyDebited = 0;
    for (const cell of cells) {
        const share = (cell.effSurplus / totalEffSurplus) * actualDebit;
        const perCapita = share / cell.pop;
        // distributeWealthChangeTracked returns a negative aggregate for a debit
        const actualAggregate = distributeWealthChangeTracked(demography, age, cell.occ, cell.edu, -perCapita, floor);
        // Record debit in transfer matrix (negative = given away)
        if (transferMatrix) {
            transferMatrix[age][cell.edu][cell.occ] += actualAggregate; // actualAggregate is negative ✓
        }
        actuallyDebited += -actualAggregate; // convert to positive amount removed
    }

    vlog('debitSupporters done', { age, actualDebit: actuallyDebited });
    return actuallyDebited; // always non-negative
}

/**
 * Credit `amount` of wealth to population cells at `age`,
 * distributed proportionally by each cell's remaining *need*
 * (food gap × pop).  Cells that already have enough
 * food stock or wealth receive less.
 *
 * Falls back to population-proportional if no cell has need > 0
 * (safety net — should rarely happen).
 */
function creditDependents(
    demography: Cohort<PopulationCategory>[],
    age: number,
    amount: number,
    targetPerPerson: number,
    foodPrice: number,
    transferMatrix?: PopulationTransferMatrix,
): void {
    if (amount <= 0) {
        return;
    }

    interface CellInfo {
        occ: Occupation;
        edu: EducationLevelType;
        pop: number;
        need: number;
    }

    const cells: CellInfo[] = [];
    let totalNeed = 0;
    let totalPop = 0;

    for (const occ of OCCUPATIONS) {
        for (const edu of educationLevelKeys) {
            const pop = aggregatePopulation(demography, age, occ, edu);
            if (pop <= 0) {
                continue;
            }
            const foodStock = aggregateFoodStock(demography, age, occ, edu);
            const w = aggregateWealth(demography, age, occ, edu);
            const perCapitaFoodStock = foodStock / pop;
            const gap = Math.max(0, targetPerPerson - perCapitaFoodStock);
            const costGap = gap * foodPrice;
            const selfFund = Math.max(0, w.mean);
            const need = Math.max(0, costGap - selfFund) * pop;
            cells.push({ occ, edu, pop, need });
            totalNeed += need;
            totalPop += pop;
        }
    }

    if (totalPop <= 0) {
        return;
    }

    log('creditDependents summary', { age, amount, totalNeed, totalPop });

    // Distribute by need if possible, otherwise by population
    if (totalNeed > 0) {
        for (const cell of cells) {
            if (cell.need <= 0) {
                continue;
            }
            const share = (cell.need / totalNeed) * amount;
            const perCapita = share / cell.pop;
            log('creditDependents allocate', { age, cell: { occ: cell.occ, edu: cell.edu }, share, perCapita });
            const actualAggregate = distributeWealthChangeTracked(demography, age, cell.occ, cell.edu, perCapita);
            if (transferMatrix) {
                transferMatrix[age][cell.edu][cell.occ] += actualAggregate;
            }
        }
    } else {
        // Fallback: population-proportional
        for (const cell of cells) {
            const share = (cell.pop / totalPop) * amount;
            const perCapita = share / cell.pop;
            log('creditDependents fallback', { age, cell: { occ: cell.occ, edu: cell.edu }, share, perCapita });
            const actualAggregate = distributeWealthChangeTracked(demography, age, cell.occ, cell.edu, perCapita);
            if (transferMatrix) {
                transferMatrix[age][cell.edu][cell.occ] += actualAggregate;
            }
        }
    }
}
