import {
    GENERATION_GAP,
    GENERATION_KERNEL_N,
    GROCERY_BUFFER_TARGET_TICKS,
    MIN_EMPLOYABLE_AGE,
    SERVICE_PER_PERSON_PER_TICK,
    SUPPORT_WEIGHT_SIGMA,
} from '../constants';
import { distributeWealthChangeTracked } from '../financial/wealthOps';
import type { Planet } from '../planet/planet';
import { groceryServiceResourceType } from '../planet/services';
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
import { forEachPopulationCohort, mergeGaussianMoments, OCCUPATIONS } from '../population/population';

/** Per-age aggregated snapshot of supporter surplus. */
interface SurplusSnapshot {
    /** Total surplus wealth available for transfer (currency units). */
    totalSurplus: number;
    /** Total supporter population contributing to this surplus. */
    totalPop: number;
}

/** Per-age aggregated dependent need. */
interface DependentNeed {
    /** Total currency needed to fill grocery service buffer to the target level. */
    totalNeed: number;
    /** Total dependent population at this age. */
    totalPop: number;
}

/**
 * Pre-aggregated statistics for a single (age, occ, edu) cell.
 * Built once per tick and reused across all transfer computations.
 */
interface CellAggregate {
    pop: number;
    wealth: GaussianMoments;
    /** Total grocery service buffer (in service units) across all skill sub-cells. */
    groceryBuffer: number;
}

/**
 * Cache of pre-aggregated cell statistics indexed as
 * `cache[age][occ][edu]`. Built once per tick by `buildAggregateCache`.
 */
type AggregateCache = Array<{ [O in Occupation]: { [L in EducationLevelType]: CellAggregate } }>;

/**
 * Iterate over all skill levels once per (age, occ, edu) cell and store the
 * aggregated population, wealth moments and food stock.  The result is reused
 * by every subsequent loop in the same tick, eliminating redundant inner-SKILL
 * iterations.
 */
function buildAggregateCache(demography: Cohort<PopulationCategory>[]): AggregateCache {
    const numAges = demography.length;
    const cache = new Array(numAges) as AggregateCache;

    for (let age = 0; age < numAges; age++) {
        const ageCells = {} as AggregateCache[number];
        for (const occ of OCCUPATIONS) {
            ageCells[occ] = {} as { [L in EducationLevelType]: CellAggregate };
            for (const edu of educationLevelKeys) {
                ageCells[occ][edu] = { pop: 0, wealth: { mean: 0, variance: 0 }, groceryBuffer: 0 };
            }
        }

        forEachPopulationCohort(demography[age], (cat, occ, edu) => {
            const n = cat.total;
            if (n <= 0) {
                return;
            }
            const cell = ageCells[occ][edu];
            cell.wealth = mergeGaussianMoments(cell.pop, cell.wealth, n, cat.wealth);
            cell.pop += n;
            // Convert grocery service buffer ticks to equivalent service units
            // buffer ticks * SERVICE_PER_PERSON_PER_TICK * n = total service units
            cell.groceryBuffer += cat.services.grocery.buffer * SERVICE_PER_PERSON_PER_TICK * n;
        });

        cache[age] = ageCells;
    }

    return cache;
}

export function supportWeight(ageDifference: number): number {
    const sigma = SUPPORT_WEIGHT_SIGMA;
    let best = 0;

    const amplitude = (n: number): number => {
        if (n < 0) {
            return Math.exp(-0.5 * (Math.abs(n) + 1)); // parents and older relatives
        } else {
            return Math.exp(-0.5 * (n - 1)); // children and younger relatives
        }
    };
    for (let n = -GENERATION_KERNEL_N; n <= GENERATION_KERNEL_N; n++) {
        const target = n * GENERATION_GAP;
        const delta = ageDifference - target;

        const w = amplitude(n) * Math.exp(-(delta * delta) / (2 * sigma * sigma));
        if (w > best) {
            best = w;
        }
    }
    return best;
}

export function effectiveSurplus(mean: number, variance: number, floor: number, population: number): number {
    const naiveSurplus = Math.max(0, mean - floor);
    const dustTolerance = 1e-6;
    if (naiveSurplus <= dustTolerance || population <= 0) {
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

    const groceryPrice = planet.marketPrices[groceryServiceResourceType.name];

    const groceryTargetPerPerson = GROCERY_BUFFER_TARGET_TICKS * SERVICE_PER_PERSON_PER_TICK;

    const baseGroceryCost = SERVICE_PER_PERSON_PER_TICK * groceryPrice;

    const cache = buildAggregateCache(demography);

    const transferMatrix: PopulationTransferMatrix = createZeroTransferMatrix(numAges);

    const survivalSurplusSnapshot: SurplusSnapshot[] = new Array(numAges);

    for (let age = 0; age < numAges; age++) {
        let totalSurplus = 0;
        let totalSupporterPop = 0;

        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                const { pop, wealth } = cache[age][occ][edu];
                if (pop <= 0) {
                    continue;
                }
                if (age < MIN_EMPLOYABLE_AGE) {
                    continue;
                }
                const raw = effectiveSurplus(wealth.mean, wealth.variance, baseGroceryCost, pop);
                totalSurplus += raw;
                totalSupporterPop += pop;
            }
        }

        survivalSurplusSnapshot[age] = { totalSurplus, totalPop: totalSupporterPop };
    }

    // Compute per-age aggregate dependent need (across ALL edu levels and skills)
    const computeDependentNeeds = (targetPerPerson: number): DependentNeed[] => {
        const needs: DependentNeed[] = new Array(numAges);
        for (let age = 0; age < numAges; age++) {
            let totalNeed = 0;
            let totalPop = 0;

            for (const occ of OCCUPATIONS) {
                for (const edu of educationLevelKeys) {
                    const { pop, groceryBuffer, wealth } = cache[age][occ][edu];
                    if (pop <= 0) {
                        continue;
                    }
                    const perCapitaGroceryBuffer = groceryBuffer / pop;
                    const gap = Math.max(0, targetPerPerson - perCapitaGroceryBuffer);
                    // Cost to fill the gap at real market price (no urgency inflation here —
                    // urgency belongs in market demand bids, not in transfer amounts).
                    const costGap = gap * groceryPrice;
                    // Subtract existing per-capita wealth so we only transfer what they
                    // genuinely cannot self-fund.
                    const selfFund = Math.max(0, wealth.mean);
                    const netNeed = Math.max(0, costGap - selfFund);
                    totalNeed += netNeed * pop;
                    totalPop += pop;
                }
            }

            needs[age] = { totalNeed, totalPop };
        }
        return needs;
    };

    //Let's check the transfers a bit more.

    //This is entirely to supply everyone with groceryService.

    const survivalNeeds = computeDependentNeeds(groceryTargetPerPerson);
    const remaining = survivalSurplusSnapshot.map((s) => s.totalSurplus);

    // Compute global scarcity factor so all cohorts share shortages proportionally
    // rather than earlier ages consuming the supply pool first.
    const totalSupply = remaining.reduce((sum, s) => sum + s, 0);
    const totalDemand = survivalNeeds.reduce((sum, n) => sum + n.totalNeed, 0);
    const scarcityFactor = totalDemand > 0 ? Math.min(1, totalSupply / totalDemand) : 1;

    for (const [age, dependentNeed] of survivalNeeds.entries()) {
        const need = dependentNeed.totalNeed * scarcityFactor;
        if (need <= 0) {
            continue;
        }

        // Compute support weights from all ages with capacity > 0
        const weightedSuppliers: { supAge: number; weight: number }[] = [];
        let totalWeight = 0;

        for (let supAge = 0; supAge < numAges; supAge++) {
            if (remaining[supAge] <= 0) {
                continue;
            }

            // Signed age difference: positive = supporter is older than dependent
            const ageDiff = supAge - age;
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
        // Track actual debits to ensure credit matches exactly.
        let actualTotalDebited = 0;
        for (const { supAge, amount } of transfers) {
            const debited = debitSupporters(cache, demography, supAge, amount, baseGroceryCost, transferMatrix);
            remaining[supAge] -= debited;
            actualTotalDebited += debited;
        }

        if (actualTotalDebited <= 0) {
            continue;
        }

        creditDependents(
            cache,
            demography,
            age,
            actualTotalDebited,
            groceryTargetPerPerson,
            groceryPrice,
            transferMatrix,
        );
    }

    if (process.env.NODE_ENV !== 'production') {
        const matrixSum = sumTransferMatrix(transferMatrix);
        if (Math.abs(matrixSum) > 1e-4) {
            console.warn(`[intergenerationalTransfers] transfer matrix not zero-sum: Δ=${matrixSum.toExponential(4)}`);
        }
    }
    planet.population.lastTransferMatrix = transferMatrix;
}

function debitSupporters(
    cache: AggregateCache,
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
        for (const edu of educationLevelKeys) {
            const { pop, wealth } = cache[age][occ][edu];
            if (pop <= 0) {
                continue;
            }
            const es = effectiveSurplus(wealth.mean, wealth.variance, floor, pop);

            if (es <= 0) {
                continue;
            }
            cells.push({ occ, edu, pop, effSurplus: es });
            totalEffSurplus += es;
        }
    }

    if (totalEffSurplus <= 0) {
        return 0;
    }

    const actualDebit = Math.min(amount, totalEffSurplus);

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

    return actuallyDebited; // always non-negative
}

function creditDependents(
    cache: AggregateCache,
    demography: Cohort<PopulationCategory>[],
    age: number,
    amount: number,
    targetPerPerson: number,
    groceryPrice: number,
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
            const { pop, groceryBuffer, wealth } = cache[age][occ][edu];
            if (pop <= 0) {
                continue;
            }
            const perCapitaGroceryBuffer = groceryBuffer / pop;
            const gap = Math.max(0, targetPerPerson - perCapitaGroceryBuffer);
            // Real cost at market price — no urgency inflation.
            const costGap = gap * groceryPrice;
            const selfFund = Math.max(0, wealth.mean);
            const need = Math.max(0, costGap - selfFund) * pop;
            cells.push({ occ, edu, pop, need });
            totalNeed += need;
            totalPop += pop;
        }
    }

    if (totalPop <= 0) {
        return;
    }

    // Only distribute to cells that actually have a funding gap.
    // If totalNeed == 0 everyone can self-fund; nothing to credit.
    if (totalNeed <= 0) {
        return;
    }

    for (const cell of cells) {
        if (cell.need <= 0) {
            continue;
        }
        const share = (cell.need / totalNeed) * amount;
        const perCapita = share / cell.pop;

        const actualAggregate = distributeWealthChangeTracked(demography, age, cell.occ, cell.edu, perCapita);
        if (transferMatrix) {
            transferMatrix[age][cell.edu][cell.occ] += actualAggregate;
        }
    }
}
