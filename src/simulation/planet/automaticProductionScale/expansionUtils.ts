import { MIN_EMPLOYABLE_AGE } from '../../constants';
import { educationLevelKeys } from '../../population/education';
import type { FacilityBase, ManagementFacility, ProductionFacility } from '../facility';
import type { AgentPlanetAssets, Planet } from '../planet';
import { constructionServiceResourceType } from '../services';
import {
    EXPANSION_WORKER_RESERVE_MARGIN,
    EXPANSION_WORKING_CAPITAL_TICKS,
    MAX_SCALE_EXPAND_FRACTION,
} from './constants';

export type ExpansionWorkforceStats = {
    totalAvailableUnemployed: number;
    totalRequiredNewWorkers: number;
    requiredWithReserve: number;
    hasSufficientWorkers: boolean;
};

export function computeConstructionInflationFactor(planet: Planet): number {
    const costFloor = planet.lastProductionCostFloors[constructionServiceResourceType.name];
    if (costFloor === undefined || costFloor <= 0) {
        return 1;
    }

    const price = planet.marketPrices[constructionServiceResourceType.name] ?? 0;
    if (price > 0 && isFinite(price)) {
        return price / costFloor;
    }
    return 1;
}

export function computeExpansionWorkforceStats(facility: FacilityBase, planet: Planet): ExpansionWorkforceStats {
    const demography = planet.population.demography;
    let totalAvailableUnemployed = 0;

    for (let age = MIN_EMPLOYABLE_AGE; age < demography.length; age++) {
        for (const edu of educationLevelKeys) {
            totalAvailableUnemployed += demography[age].unoccupied[edu].total;
        }
    }

    let totalRequiredNewWorkers = 0;
    for (const edu of educationLevelKeys) {
        const req = facility.workerRequirement[edu] ?? 0;
        if (req > 0) {
            const currentMax = facility.maxScale;
            const targetMax = Math.max(Math.ceil(currentMax * (1 + MAX_SCALE_EXPAND_FRACTION)), currentMax + 1);
            const additionalWorkers = req * (targetMax - currentMax);
            totalRequiredNewWorkers += additionalWorkers;
        }
    }

    if (totalRequiredNewWorkers <= 0) {
        return {
            totalAvailableUnemployed,
            totalRequiredNewWorkers,
            requiredWithReserve: 0,
            hasSufficientWorkers: false,
        };
    }

    const requiredWithReserve = totalRequiredNewWorkers * (1 + EXPANSION_WORKER_RESERVE_MARGIN);
    return {
        totalAvailableUnemployed,
        totalRequiredNewWorkers,
        requiredWithReserve,
        hasSufficientWorkers: totalAvailableUnemployed >= requiredWithReserve,
    };
}

export type ExpansionFundsCheckResult = {
    hasSufficientFunds: boolean;
};

export function checkExpansionFunds(
    facility: ManagementFacility | ProductionFacility,
    assets: AgentPlanetAssets,
    planet: Planet,
    totalConstructionServiceRequired: number,
    time: number,
): ExpansionFundsCheckResult {
    const constructionPrice = planet.marketPrices[constructionServiceResourceType.name] ?? 0;
    if (constructionPrice <= 0 || time <= 0) {
        return {
            hasSufficientFunds: false,
        };
    }

    const paymentPerTick = (totalConstructionServiceRequired / time) * constructionPrice;
    const requiredWorkingCapital = EXPANSION_WORKING_CAPITAL_TICKS * paymentPerTick;
    const cashFlow =
        assets.lastMonthAcc.revenue -
        assets.lastMonthAcc.wages -
        assets.lastMonthAcc.purchases -
        assets.lastMonthAcc.claimPayments;

    const hasSufficientFunds = assets.deposits >= requiredWorkingCapital && cashFlow >= paymentPerTick;

    return { hasSufficientFunds };
}

export function agentHasOwnConstructionFacility(facilities: ProductionFacility[]): boolean {
    return facilities.some((facility) =>
        facility.produces.some((output) => output.resource.name === constructionServiceResourceType.name),
    );
}
