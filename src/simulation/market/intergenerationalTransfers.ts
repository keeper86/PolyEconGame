import {
    GENERATION_GAP,
    GENERATION_KERNEL_N,
    MIN_EMPLOYABLE_AGE,
    RELATIVE_PRICE_WILLING_TO_PAY_WHEN_BUFFER_EMPTY,
    SUPPORT_WEIGHT_SIGMA,
} from '../constants';
import { distributeWealthChangeTracked } from '../financial/wealthOps';
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
    ServiceName,
} from '../population/population';
import { forEachPopulationCohort, mergeGaussianMoments, OCCUPATIONS } from '../population/population';
import { nextRandom } from '../utils/stochasticRound';
import type { ServiceTierSupportWeightOverride } from './serviceDefinitions';
import { allServices, computeTierCost, SERVICE_DEFINITIONS, SERVICE_TIERS, serviceKeyOf } from './serviceDefinitions';

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
    /** Total service buffer (in service units) per service key, across all skill sub-cells. */
    buffers: Partial<Record<ServiceName, number>>;
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
                ageCells[occ][edu] = { pop: 0, wealth: { mean: 0, variance: 0 }, buffers: {} };
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
            // Convert per-category service buffers (ticks) to aggregate service units:
            // buffer ticks * consumptionRatePerPersonPerTick * n = total service units
            for (const svc of allServices) {
                const key = serviceKeyOf(svc);
                cell.buffers[key] =
                    (cell.buffers[key] ?? 0) + cat.services[key].buffer * svc.consumptionRatePerPersonPerTick * n;
            }
        });

        cache[age] = ageCells;
    }

    return cache;
}

export function supportWeight(ageDifference: number, override?: ServiceTierSupportWeightOverride): number {
    const sigma = override?.sigma ?? SUPPORT_WEIGHT_SIGMA;
    const generationGap = override?.generationGap ?? GENERATION_GAP;
    const kernelN = override?.kernelN ?? GENERATION_KERNEL_N;
    let best = 0;

    const amplitude = (n: number): number => {
        if (n < 0) {
            return Math.exp(-0.5 * (Math.abs(n) + 1)); // parents and older relatives
        } else {
            return Math.exp(-0.5 * (n - 1)); // children and younger relatives
        }
    };
    for (let n = -kernelN; n <= kernelN; n++) {
        const target = n * generationGap;
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

/** Compute per-age total supporter surplus given a wealth floor. Only ages >= MIN_EMPLOYABLE_AGE contribute. */
function computeSurplusSnapshot(cache: AggregateCache, floor: number): number[] {
    const numAges = cache.length;
    const snapshot: number[] = new Array(numAges);
    for (let age = 0; age < numAges; age++) {
        let totalSurplus = 0;
        if (age >= MIN_EMPLOYABLE_AGE) {
            for (const occ of OCCUPATIONS) {
                for (const edu of educationLevelKeys) {
                    const { pop, wealth } = cache[age][occ][edu];
                    if (pop <= 0) {
                        continue;
                    }
                    totalSurplus += effectiveSurplus(wealth.mean, wealth.variance, floor, pop);
                }
            }
        }
        snapshot[age] = totalSurplus;
    }
    return snapshot;
}

/**
 * Compute per-age dependent need for a set of tier services.
 * Need = cost to fill buffers to coverageFraction of target, minus wealth available after
 * covering higher-priority (alreadyCommittedCost) spending.
 */
function computeDependentNeedsForTier(
    cache: AggregateCache,
    tierServices: ServiceName[],
    marketPrices: Record<string, number>,
    coverageFraction: number,
    alreadyCommittedCost: number,
): DependentNeed[] {
    const numAges = cache.length;
    const needs: DependentNeed[] = new Array(numAges);

    const serviceParams = tierServices.map((key) => {
        const def = SERVICE_DEFINITIONS[key];
        const price = (marketPrices[def.resource.name] ?? 0) * RELATIVE_PRICE_WILLING_TO_PAY_WHEN_BUFFER_EMPTY;
        const targetPerPerson = def.bufferTargetTicks * def.consumptionRatePerPersonPerTick * coverageFraction;
        return { key, price, targetPerPerson };
    });

    for (let age = 0; age < numAges; age++) {
        let totalNeed = 0;
        let totalPop = 0;
        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                const { pop, buffers, wealth } = cache[age][occ][edu];
                if (pop <= 0) {
                    continue;
                }
                let totalCostGap = 0;
                for (const { key, price, targetPerPerson } of serviceParams) {
                    const perCapitaBuffer = (buffers[key] ?? 0) / pop;
                    const gap = Math.max(0, targetPerPerson - perCapitaBuffer);
                    // Apply a fill-fraction discount so urgency tapers as the buffer fills.
                    const fillFraction = targetPerPerson > 0 ? Math.min(1, perCapitaBuffer / targetPerPerson) : 1;
                    totalCostGap += gap * price * (1 - fillFraction);
                }
                // Wealth available for this tier = total wealth minus what is reserved for higher tiers.
                const availableWealth = Math.max(0, wealth.mean - alreadyCommittedCost);
                const netNeed = Math.max(0, totalCostGap - availableWealth);
                totalNeed += netNeed * pop;
                totalPop += pop;
            }
        }
        needs[age] = { totalNeed, totalPop };
    }
    return needs;
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

    const transferMatrix: PopulationTransferMatrix = createZeroTransferMatrix(numAges);

    let cumulativeMandatoryCost = 0;
    let activeCache = buildAggregateCache(demography);

    for (let tierIdx = 0; tierIdx < SERVICE_TIERS.length; tierIdx++) {
        const tier = SERVICE_TIERS[tierIdx];
        // Cost per tick to consume all services in this tier (at urgency price).
        const tierCostPerTick =
            computeTierCost(planet.marketPrices, tier) * RELATIVE_PRICE_WILLING_TO_PAY_WHEN_BUFFER_EMPTY;

        // Supporters must keep enough for all previous mandatory tiers (and this one if mandatory).
        const tierFloor = cumulativeMandatoryCost + (tier.mandatoryForOwnConsumption ? tierCostPerTick : 0);

        // Rebuild cache after the first tier because debit/credit calls mutate demography wealth.
        if (tierIdx > 0) {
            activeCache = buildAggregateCache(demography);
        }

        const remaining = computeSurplusSnapshot(activeCache, tierFloor);
        const tierNeeds = computeDependentNeedsForTier(
            activeCache,
            tier.services,
            planet.marketPrices,
            tier.coverageFraction,
            cumulativeMandatoryCost,
        );

        // Compute global scarcity factor so all cohorts share shortages proportionally.
        const totalSupply = remaining.reduce((sum, s) => sum + s, 0);
        const totalDemand = tierNeeds.reduce((sum, n) => sum + n.totalNeed, 0);
        const scarcityFactor = totalDemand > 0 ? Math.min(1, totalSupply / totalDemand) : 1;

        // Shuffle age indices to eliminate systematic processing-order bias over contested
        // supplier pools. Statistically correct in expectation across ticks.
        const ageOrder = Array.from({ length: numAges }, (_, i) => i);
        for (let i = ageOrder.length - 1; i > 0; i--) {
            const j = Math.floor(nextRandom() * (i + 1));
            [ageOrder[i], ageOrder[j]] = [ageOrder[j], ageOrder[i]];
        }

        for (const age of ageOrder) {
            const need = tierNeeds[age].totalNeed * scarcityFactor;
            if (need <= 0) {
                continue;
            }

            // Compute support weights from all ages with remaining surplus.
            const weightedSuppliers: { supAge: number; weight: number }[] = [];
            let totalWeight = 0;

            for (let supAge = 0; supAge < numAges; supAge++) {
                if (remaining[supAge] <= 0) {
                    continue;
                }
                // Signed age difference: positive = supporter is older than dependent
                const ageDiff = supAge - age;
                const w = supportWeight(ageDiff, tier.supportWeightOverride);
                if (w < 1e-10) {
                    continue;
                }
                weightedSuppliers.push({ supAge, weight: w });
                totalWeight += w;
            }

            if (totalWeight <= 0) {
                continue;
            }

            // Proportional allocation pass.
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

            // Debit each supporter age; track actual debits so credit matches exactly.
            let actualTotalDebited = 0;
            for (const { supAge, amount } of transfers) {
                const debited = debitSupporters(activeCache, demography, supAge, amount, tierFloor, transferMatrix);
                remaining[supAge] -= debited;
                actualTotalDebited += debited;
            }

            if (actualTotalDebited <= 0) {
                continue;
            }

            creditDependents(
                activeCache,
                demography,
                age,
                actualTotalDebited,
                tier.services,
                planet.marketPrices,
                tier.coverageFraction,
                cumulativeMandatoryCost,
                transferMatrix,
            );
        }

        if (tier.mandatoryForOwnConsumption) {
            cumulativeMandatoryCost += tierCostPerTick;
        }
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
    tierServices: ServiceName[],
    marketPrices: Record<string, number>,
    coverageFraction: number,
    alreadyCommittedCost: number,
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

    // Must use urgency-adjusted prices and the same fill-fraction discount as
    // computeDependentNeedsForTier so that per-cell need proportions are consistent
    // with the global need calculation. Using raw prices here would let cells appear
    // need-free when the global calculation (at urgency price) found a shortfall,
    // causing creditDependents to return early without distributing — destroying wealth.
    const serviceParams = tierServices.map((key) => {
        const def = SERVICE_DEFINITIONS[key];
        const price = (marketPrices[def.resource.name] ?? 0) * RELATIVE_PRICE_WILLING_TO_PAY_WHEN_BUFFER_EMPTY;
        const targetPerPerson = def.bufferTargetTicks * def.consumptionRatePerPersonPerTick * coverageFraction;
        return { key, price, targetPerPerson };
    });

    const cells: CellInfo[] = [];
    let totalNeed = 0;
    let totalPop = 0;

    for (const occ of OCCUPATIONS) {
        for (const edu of educationLevelKeys) {
            const { pop, buffers, wealth } = cache[age][occ][edu];
            if (pop <= 0) {
                continue;
            }
            let totalCostGap = 0;
            for (const { key, price, targetPerPerson } of serviceParams) {
                const perCapitaBuffer = (buffers[key] ?? 0) / pop;
                const gap = Math.max(0, targetPerPerson - perCapitaBuffer);
                const fillFraction = targetPerPerson > 0 ? Math.min(1, perCapitaBuffer / targetPerPerson) : 1;
                totalCostGap += gap * price * (1 - fillFraction);
            }
            // Wealth available for this tier after covering higher-priority spending.
            const availableWealth = Math.max(0, wealth.mean - alreadyCommittedCost);
            const need = Math.max(0, totalCostGap - availableWealth) * pop;
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
