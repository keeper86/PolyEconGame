import assert from 'assert';
import { processFacilityContraction } from '../agents/recycler';
import { computeBufferCapacity, computeMaxDailyHROutput } from '../workforce/hrBuffer';
import { isAutoscaleDebugEnabled, logAutoscaleFacility, logAutoscalePlanet } from './automaticProductionScaleDebug';
import type { HRFacility, PidState, ProductionFacility } from './facility';
import { calculateCostsForConstruction } from './facility';
import type { Agent, AgentPlanetAssets, GameState, Planet } from './planet';
import { constructionServiceResourceType } from './services';

export * from './automaticProductionScale/constants';
export { initiateCapacityContraction, initiateCapacityExpansion } from './automaticProductionScale/expansionActions';
export {
    calculateExpansionParams,
    computeDynamicExpansionTarget,
    findMaxAffordableScale,
    findMaxScaleForCSBudget,
    OVER_SHARE_FACTOR,
} from './automaticProductionScale/expansionTarget';
export {
    agentHasOwnConstructionFacility,
    checkExpansionFunds,
    computeConstructionInflationFactor,
    computeExpansionWorkforceStats,
    type ExpansionFundsCheckResult,
    type ExpansionWorkforceStats,
} from './automaticProductionScale/expansionUtils';
export { computePidDelta, getDefaultPidState } from './automaticProductionScale/pidController';
export { computeFacilityProfitThisTick, computeFacilitySignal } from './automaticProductionScale/signalComputation';
export {
    computeStorageExpansionTarget,
    computeStorageSignal,
    STORAGE_TARGET_FILL_RATE,
} from './automaticProductionScale/storageAutoscale';

import {
    CONTRACTION_INTEGRAL_DECAY,
    CONTRACTION_INTEGRAL_MAX,
    CONTRACTION_INTEGRAL_THRESHOLD,
    EXPANSION_INTEGRAL_DECAY,
    EXPANSION_INTEGRAL_MAX,
    EXPANSION_INTEGRAL_THRESHOLD,
    EXPANSION_PRICE_INFLATION_THRESHOLD,
    EXPANSION_WORKING_CAPITAL_TICKS,
    MAX_SCALE_CONTRACT_FRACTION,
    MAX_SCALE_EXPAND_FRACTION,
    SIGNAL_EMA_ALPHA,
} from './automaticProductionScale/constants';
import { initiateCapacityExpansion } from './automaticProductionScale/expansionActions';
import {
    calculateExpansionParams,
    computeDynamicExpansionTarget,
    findMaxScaleForCSBudget,
} from './automaticProductionScale/expansionTarget';
import {
    agentHasOwnConstructionFacility,
    checkExpansionFunds,
    computeConstructionInflationFactor,
    computeExpansionWorkforceStats,
    type ExpansionWorkforceStats,
} from './automaticProductionScale/expansionUtils';
import { computePidDelta, getDefaultPidState } from './automaticProductionScale/pidController';
import { computeFacilityProfitThisTick, computeFacilitySignal } from './automaticProductionScale/signalComputation';
import { computeStorageExpansionTarget, computeStorageSignal } from './automaticProductionScale/storageAutoscale';

const HR_TARGET_FILL_RATE = 0.85;

function computeHrSignal(hrDepartment: HRFacility): number {
    const pMax = computeBufferCapacity(computeMaxDailyHROutput(hrDepartment.maxScale));
    const fillRate = pMax > 0 ? hrDepartment.hrBuffer / pMax : 0;
    return Math.max(-1, Math.min(1, (HR_TARGET_FILL_RATE - fillRate) / HR_TARGET_FILL_RATE));
}

type AutoscaleDebugEntry = {
    tick: number;
    planetId: string;
    agentId: string;
    agentName: string;
    facilityId: string;
    facilityName: string;
    currentMaxScale: number;
    currentScale: number;
    scaleFraction: number;
    rawSignal: number;
    smoothedSignal: number;
    pidDelta: number;
    overallEfficiency: number;
    workerEfficiency: Record<string, number>;
    resourceEfficiency: Record<string, number>;
    worstResourceEfficiency: { resource: string; value: number } | null;
    guards: {
        atMaxScale: boolean;
        hasNoActiveConstruction: boolean;
        positiveSignal: boolean;
        integralAboveThreshold: boolean;
        efficiencyAbove95: boolean;
        workersAvailable: boolean;
        fundsAvailable: boolean;
        hasOwnConstruction: boolean;
    };
    workforce: {
        availableUnemployed: number;
        requiredNewWorkers: number;
        requiredWithReserve: number;
    };
    expansion: {
        targetMax: number;
        cost: number;
        time: number;
        estimatedCost: number;
        constructionPrice: number;
        constructionCostFloor: number;
        deposits: number;
        requiredWorkingCapital: number;
        paymentPerTick: number;
        facilityRevenuePerTick: number;
    };
    pid: {
        expansionIntegral: number;
        contractionIntegral: number;
        integral: number;
        smoothedSignal: number;
        dynamicThreshold: number;
    };
    didExpand: boolean;
    blockReason: string[];
};

function collectExpansionDebugContext(
    gameState: GameState,
    planet: Planet,
    agent: Agent,
    facility: ProductionFacility,
    assets: AgentPlanetAssets,
    state: PidState,
    rawSignal: number,
    signal: number,
    delta: number,
    dynamicThreshold: number,
    atMaxScale: boolean,
    hasNoActiveConstruction: boolean,
    integralAboveThreshold: boolean,
    efficiencyAbove95: boolean,
    workforceStats: ExpansionWorkforceStats,
    workersAvailable: boolean,
    fundsAvailable: boolean,
    hasOwnConstruction: boolean,
): AutoscaleDebugEntry {
    const { targetMax, cost, time } = calculateExpansionParams(facility);
    const constructionPrice = planet.marketPrices[constructionServiceResourceType.name] ?? 0;
    const constructionCostFloor = planet.lastProductionCostFloors[constructionServiceResourceType.name] ?? 0;
    const estimatedCost = cost * constructionPrice;

    const resourceEfficiency = facility.lastTickResults?.resourceEfficiency ?? {};
    const worstResourceEntry = Object.entries(resourceEfficiency).reduce<{
        resource: string;
        value: number;
    } | null>((worst, [resource, value]) => {
        if (!worst || value < worst.value) {
            return { resource, value };
        }
        return worst;
    }, null);

    const blockReason: string[] = [];
    if (!atMaxScale) {
        blockReason.push('notAtMaxScale');
    }
    if (!hasNoActiveConstruction) {
        blockReason.push('activeConstruction');
    }
    if (signal <= 0) {
        blockReason.push('nonPositiveSignal');
    }
    if (!integralAboveThreshold) {
        blockReason.push('expansionIntegralBelowThreshold');
    }
    if (!efficiencyAbove95) {
        blockReason.push('overallEfficiencyBelow95');
    }
    if (!workersAvailable) {
        blockReason.push('insufficientWorkers');
    }
    if (!fundsAvailable) {
        blockReason.push('insufficientFunds');
    }

    return {
        tick: gameState.tick,
        planetId: planet.id,
        agentId: agent.id,
        agentName: agent.name,
        facilityId: facility.id,
        facilityName: facility.name,
        currentMaxScale: facility.maxScale,
        currentScale: facility.scale,
        scaleFraction: facility.maxScale > 0 ? facility.scale / facility.maxScale : 0,
        rawSignal,
        smoothedSignal: signal,
        pidDelta: delta,
        overallEfficiency: facility.lastTickResults?.overallEfficiency ?? 0,
        workerEfficiency: facility.lastTickResults?.workerEfficiency ?? {},
        resourceEfficiency,
        worstResourceEfficiency: worstResourceEntry,
        guards: {
            atMaxScale,
            hasNoActiveConstruction,
            positiveSignal: signal > 0,
            integralAboveThreshold,
            efficiencyAbove95,
            workersAvailable,
            fundsAvailable,
            hasOwnConstruction,
        },
        workforce: {
            availableUnemployed: workforceStats.totalAvailableUnemployed,
            requiredNewWorkers: workforceStats.totalRequiredNewWorkers,
            requiredWithReserve: workforceStats.requiredWithReserve,
        },
        expansion: {
            targetMax,
            cost,
            time,
            estimatedCost,
            constructionPrice,
            constructionCostFloor,
            deposits: assets.deposits,
            requiredWorkingCapital: EXPANSION_WORKING_CAPITAL_TICKS * (cost / time) * constructionPrice,
            paymentPerTick: (cost / time) * constructionPrice,
            facilityRevenuePerTick:
                facility.scale *
                facility.produces.reduce(
                    (sum, output) => sum + output.quantity * (planet.marketPrices[output.resource.name] ?? 0),
                    0,
                ),
        },
        pid: {
            expansionIntegral: state.expansionIntegral,
            contractionIntegral: state.contractionIntegral,
            integral: state.integral,
            smoothedSignal: state.smoothedSignal,
            dynamicThreshold,
        },
        didExpand: false,
        blockReason,
    };
}

export function updateAgentProductionScale(gameState: GameState, planet: Planet): void {
    const debugAggregates = {
        facilitiesAtMaxScale: 0,
        facilitiesAtMaxScalePositiveSignal: 0,
        expansionCandidates: 0,
        expansionsStarted: 0,
        blockedByIntegral: 0,
        blockedByEfficiency: 0,
        blockedByWorkers: 0,
        blockedByFunds: 0,
    };

    const resourceTotalMaxCapacity = new Map<string, number>();
    const resourceTotalMaxNeeded = new Map<string, number>();
    let totalActiveConstructionDemand = 0;
    gameState.agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (assets) {
            for (const facility of assets.productionFacilities) {
                for (const out of facility.produces) {
                    const cap = out.quantity * facility.maxScale;
                    resourceTotalMaxCapacity.set(
                        out.resource.name,
                        (resourceTotalMaxCapacity.get(out.resource.name) ?? 0) + cap,
                    );
                }
            }
            for (const facility of assets.productionFacilities) {
                for (const out of facility.needs) {
                    const needed = out.quantity * facility.maxScale;
                    resourceTotalMaxNeeded.set(
                        out.resource.name,
                        (resourceTotalMaxNeeded.get(out.resource.name) ?? 0) + needed,
                    );
                }
                if (facility.construction !== null) {
                    totalActiveConstructionDemand += facility.construction.maximumConstructionServiceConsumption;
                }
            }
            if (assets.humanResourcesDepartment?.construction !== null) {
                totalActiveConstructionDemand +=
                    assets.humanResourcesDepartment?.construction.maximumConstructionServiceConsumption ?? 0;
            }
            if (assets.storageFacility?.department?.construction !== null) {
                totalActiveConstructionDemand +=
                    assets.storageFacility.department?.construction.maximumConstructionServiceConsumption ?? 0;
            }
        }
    });

    const csProduced = planet.producedResources.Construction ?? 0;
    const csConsumed = totalActiveConstructionDemand;
    const csNet = csProduced - csConsumed;
    planet.constructionBalanceEMA =
        SIGNAL_EMA_ALPHA * csNet + (1 - SIGNAL_EMA_ALPHA) * (planet.constructionBalanceEMA ?? 0);

    const maxConstructionCapacity = resourceTotalMaxCapacity.get('Construction') ?? 0;
    const availableCapacity = Math.max(0, maxConstructionCapacity - totalActiveConstructionDemand);

    const constructionBudget =
        csProduced > 0 ? Math.max(0, Math.min(planet.constructionBalanceEMA * 0.5, availableCapacity * 0.5)) : Infinity;

    gameState.agents.forEach((agent) => {
        if (!agent.automated) {
            return;
        }

        const assets = agent.assets[planet.id];
        if (!assets) {
            return;
        }
        const hasOwnConstruction = agentHasOwnConstructionFacility(assets.productionFacilities);

        for (const facility of assets.productionFacilities) {
            if (facility.construction !== null && facility.construction.type === 'new') {
                continue;
            }

            const hasAnyMarketData = facility.produces.some(
                (o) => planet.lastMarketResult[o.resource.name] !== undefined,
            );
            if (!hasAnyMarketData) {
                continue;
            }

            const rawSignal = computeFacilitySignal(facility, assets, planet);
            assert(rawSignal >= -1, 'Signal should be >= -1, but got ' + rawSignal);
            assert(rawSignal <= 1, 'Signal should be capped at 1, but got' + rawSignal);

            const state: PidState = { ...getDefaultPidState(), ...facility.pidState };

            const signal = SIGNAL_EMA_ALPHA * rawSignal + (1 - SIGNAL_EMA_ALPHA) * state.smoothedSignal;
            state.smoothedSignal = signal;

            const profitThisTick = computeFacilityProfitThisTick(facility);
            state.profitEMA = 0.1 * profitThisTick + 0.9 * (state.profitEMA ?? 0);

            const delta = computePidDelta(signal, state, facility.maxScale);
            const newScale = Math.max(facility.maxScale * 0.1, Math.min(facility.maxScale, facility.scale + delta));
            facility.scale = newScale;

            if (facility.scale === facility.maxScale && signal > 0) {
                state.expansionIntegral = Math.min(EXPANSION_INTEGRAL_MAX, state.expansionIntegral + signal);
            } else {
                state.expansionIntegral = Math.max(0, state.expansionIntegral - EXPANSION_INTEGRAL_DECAY);
            }

            const atLowerBound = facility.scale <= facility.maxScale * 0.1;
            if (atLowerBound && signal < 0) {
                state.contractionIntegral = Math.min(
                    CONTRACTION_INTEGRAL_MAX,
                    state.contractionIntegral + Math.abs(signal),
                );
            } else {
                state.contractionIntegral = Math.max(0, state.contractionIntegral - CONTRACTION_INTEGRAL_DECAY);
            }

            const dynamicThreshold = Math.min(
                EXPANSION_INTEGRAL_MAX,
                EXPANSION_INTEGRAL_THRESHOLD *
                    Math.max(1, computeConstructionInflationFactor(planet) / EXPANSION_PRICE_INFLATION_THRESHOLD),
            );

            const atMaxScale = facility.scale >= facility.maxScale;
            const hasNoActiveConstruction = facility.construction === null;
            const positiveSignal = signal > 0;
            const integralAboveThreshold = state.expansionIntegral >= dynamicThreshold;
            const efficiencyAbove95 = (facility.lastTickResults?.overallEfficiency ?? 0) > 0.95;
            const expansionConditionsMet = atMaxScale && hasNoActiveConstruction && integralAboveThreshold;

            let debugEntry: AutoscaleDebugEntry | null = null;
            let workersAvailable = false;
            let fundsAvailable = false;

            if (isAutoscaleDebugEnabled()) {
                if (atMaxScale) {
                    debugAggregates.facilitiesAtMaxScale++;
                }
                if (atMaxScale && positiveSignal) {
                    debugAggregates.facilitiesAtMaxScalePositiveSignal++;
                }
            }

            const needWorkerFundsCheck =
                expansionConditionsMet || (isAutoscaleDebugEnabled() && atMaxScale && positiveSignal);
            let workforceStats: ExpansionWorkforceStats | null = null;
            if (needWorkerFundsCheck) {
                workforceStats = computeExpansionWorkforceStats(facility, planet);
                workersAvailable = workforceStats.hasSufficientWorkers;
                if (hasOwnConstruction) {
                    fundsAvailable = true;
                } else {
                    const expansionParams = calculateExpansionParams(facility);
                    fundsAvailable = checkExpansionFunds(
                        facility,
                        assets,
                        planet,
                        expansionParams.cost,
                        expansionParams.time,
                    ).hasSufficientFunds;
                }
            }

            if (isAutoscaleDebugEnabled() && atMaxScale && positiveSignal && agent.id === 'civic-solutions-corp') {
                console.log(
                    'DEBUG',
                    facility.name,
                    facility.scale,
                    facility.maxScale,
                    delta,
                    JSON.stringify(facility.construction, null, 2),
                );

                debugEntry = collectExpansionDebugContext(
                    gameState,
                    planet,
                    agent,
                    facility,
                    assets,
                    state,
                    rawSignal,
                    signal,
                    delta,
                    dynamicThreshold,
                    atMaxScale,
                    hasNoActiveConstruction,
                    integralAboveThreshold,
                    efficiencyAbove95,
                    workforceStats!,
                    workersAvailable,
                    fundsAvailable,
                    hasOwnConstruction,
                );
                debugAggregates.expansionCandidates++;
                if (!integralAboveThreshold) {
                    debugAggregates.blockedByIntegral++;
                }
                if (!efficiencyAbove95) {
                    debugAggregates.blockedByEfficiency++;
                }
                if (!workersAvailable) {
                    debugAggregates.blockedByWorkers++;
                }
                if (!fundsAvailable) {
                    debugAggregates.blockedByFunds++;
                }
            }

            if (expansionConditionsMet) {
                const dynamicTarget = computeDynamicExpansionTarget(
                    facility,
                    assets,
                    planet,
                    resourceTotalMaxCapacity,
                    resourceTotalMaxNeeded,
                    hasOwnConstruction,
                    constructionBudget,
                );
                if (dynamicTarget > facility.maxScale) {
                    const expanded = initiateCapacityExpansion(
                        facility,
                        assets,
                        planet,
                        hasOwnConstruction,
                        dynamicTarget,
                    );
                    if (expanded) {
                        state.expansionIntegral = 0;
                        if (debugEntry) {
                            debugEntry.didExpand = true;
                            debugEntry.blockReason = [];
                        }
                        if (isAutoscaleDebugEnabled()) {
                            debugAggregates.expansionsStarted++;
                        }
                    }
                }
            }

            if (debugEntry) {
                logAutoscaleFacility(debugEntry);
            }

            if (
                atLowerBound &&
                facility.construction === null &&
                state.contractionIntegral >= CONTRACTION_INTEGRAL_THRESHOLD &&
                state.profitEMA < 0
            ) {
                const contracted = processFacilityContraction(
                    planet,
                    facility,
                    agent,
                    Math.max(1, Math.floor(facility.maxScale * (1 - MAX_SCALE_CONTRACT_FRACTION))),
                    gameState,
                );
                if (contracted) {
                    state.contractionIntegral = 0;
                }
            }

            facility.pidState = state;
        }

        const hrDepartment = assets.humanResourcesDepartment;
        if (hrDepartment && hrDepartment.construction?.type !== 'new') {
            const hrRawSignal = computeHrSignal(hrDepartment);
            const hrState: PidState = { ...getDefaultPidState(), ...hrDepartment.pidState };

            const hrSignal = SIGNAL_EMA_ALPHA * hrRawSignal + (1 - SIGNAL_EMA_ALPHA) * hrState.smoothedSignal;
            hrState.smoothedSignal = hrSignal;

            const hrDelta = computePidDelta(hrSignal, hrState, hrDepartment.maxScale);
            hrDepartment.scale = Math.max(
                hrDepartment.maxScale * 0.1,
                Math.min(hrDepartment.maxScale, hrDepartment.scale + hrDelta),
            );

            const hrUtilization = hrDepartment.scale / hrDepartment.maxScale;
            if (hrUtilization >= 0.8 && hrSignal > 0) {
                hrState.expansionIntegral = Math.min(EXPANSION_INTEGRAL_MAX, hrState.expansionIntegral + hrSignal);
            } else {
                hrState.expansionIntegral = Math.max(0, hrState.expansionIntegral - EXPANSION_INTEGRAL_DECAY);
            }

            const hrAtLowerBound = hrDepartment.scale <= hrDepartment.maxScale * 0.1;
            if (hrAtLowerBound && hrSignal < 0) {
                hrState.contractionIntegral = Math.min(
                    CONTRACTION_INTEGRAL_MAX,
                    hrState.contractionIntegral + Math.abs(hrSignal),
                );
            } else {
                hrState.contractionIntegral = Math.max(0, hrState.contractionIntegral - CONTRACTION_INTEGRAL_DECAY);
            }

            const hrDynamicThreshold = Math.min(
                EXPANSION_INTEGRAL_MAX,
                EXPANSION_INTEGRAL_THRESHOLD *
                    Math.max(1, computeConstructionInflationFactor(planet) / EXPANSION_PRICE_INFLATION_THRESHOLD),
            );

            if (
                hrUtilization >= 0.8 &&
                hrDepartment.construction === null &&
                hrState.expansionIntegral >= hrDynamicThreshold
            ) {
                // TODO: should scale to needed worker count
                let hrTargetMax = Math.max(
                    Math.ceil(hrDepartment.maxScale * (1 + MAX_SCALE_EXPAND_FRACTION)),
                    hrDepartment.maxScale + 1,
                );
                const { cost, time } = calculateCostsForConstruction('management', hrDepartment.maxScale, hrTargetMax);

                let hrFundsOk = true;
                if (!hasOwnConstruction) {
                    hrFundsOk = checkExpansionFunds(hrDepartment, assets, planet, cost, time).hasSufficientFunds;
                    hrTargetMax = findMaxScaleForCSBudget(
                        hrDepartment,
                        hrDepartment.maxScale,
                        hrTargetMax,
                        constructionBudget,
                    );
                }

                if (hrFundsOk && hrTargetMax > hrDepartment.maxScale) {
                    const { cost: adjCost, time: adjTime } = calculateCostsForConstruction(
                        'management',
                        hrDepartment.maxScale,
                        hrTargetMax,
                    );
                    hrDepartment.construction = {
                        type: 'expansion',
                        constructionTargetMaxScale: hrTargetMax,
                        totalConstructionServiceRequired: adjCost,
                        maximumConstructionServiceConsumption: adjCost / adjTime,
                        progress: 0,
                        lastTickInvestedConstructionServices: 0,
                    };
                    hrState.expansionIntegral = 0;
                }
            }

            if (
                hrAtLowerBound &&
                hrDepartment.construction === null &&
                hrState.contractionIntegral >= CONTRACTION_INTEGRAL_THRESHOLD
            ) {
                const hrTargetMin = Math.max(1, Math.floor(hrDepartment.maxScale * (1 - MAX_SCALE_CONTRACT_FRACTION)));
                if (hrTargetMin < hrDepartment.maxScale) {
                    processFacilityContraction(planet, hrDepartment, agent, hrTargetMin, gameState, 0.5);
                }
                hrState.contractionIntegral = 0;
            }

            hrDepartment.pidState = hrState;
        }

        const storageDepartment = assets.storageFacility.department;
        if (storageDepartment && storageDepartment.construction?.type !== 'new') {
            const stoRawSignal = computeStorageSignal(storageDepartment);
            const stoState: PidState = { ...getDefaultPidState(), ...storageDepartment.pidState };

            const stoSignal = SIGNAL_EMA_ALPHA * stoRawSignal + (1 - SIGNAL_EMA_ALPHA) * stoState.smoothedSignal;
            stoState.smoothedSignal = stoSignal;

            const stoDelta = computePidDelta(stoSignal, stoState, storageDepartment.maxScale);
            storageDepartment.scale = Math.max(
                storageDepartment.maxScale * 0.1,
                Math.min(storageDepartment.maxScale, storageDepartment.scale + stoDelta),
            );

            if (stoSignal > 0) {
                stoState.expansionIntegral = Math.min(EXPANSION_INTEGRAL_MAX, stoState.expansionIntegral + stoSignal);
            } else {
                stoState.expansionIntegral = Math.max(0, stoState.expansionIntegral - EXPANSION_INTEGRAL_DECAY);
            }

            const stoAtLowerBound = storageDepartment.scale <= storageDepartment.maxScale * 0.1;
            if (stoAtLowerBound && stoSignal < 0) {
                stoState.contractionIntegral = Math.min(
                    CONTRACTION_INTEGRAL_MAX,
                    stoState.contractionIntegral + Math.abs(stoSignal),
                );
            } else {
                stoState.contractionIntegral = Math.max(0, stoState.contractionIntegral - CONTRACTION_INTEGRAL_DECAY);
            }

            const stoDynamicThreshold = Math.min(
                EXPANSION_INTEGRAL_MAX,
                EXPANSION_INTEGRAL_THRESHOLD *
                    Math.max(1, computeConstructionInflationFactor(planet) / EXPANSION_PRICE_INFLATION_THRESHOLD),
            );

            if (
                stoSignal > 0 &&
                storageDepartment.construction === null &&
                stoState.expansionIntegral >= stoDynamicThreshold
            ) {
                const stoTargetMax = computeStorageExpansionTarget(
                    storageDepartment,
                    assets,
                    planet,
                    hasOwnConstruction,
                    constructionBudget,
                );
                if (stoTargetMax > storageDepartment.maxScale) {
                    const expanded = initiateCapacityExpansion(
                        storageDepartment,
                        assets,
                        planet,
                        hasOwnConstruction,
                        stoTargetMax,
                    );
                    if (expanded) {
                        stoState.expansionIntegral = 0;
                    }
                }
            }

            if (
                stoAtLowerBound &&
                storageDepartment.construction === null &&
                stoState.contractionIntegral >= CONTRACTION_INTEGRAL_THRESHOLD
            ) {
                const stoTargetMin = Math.max(
                    1,
                    Math.floor(storageDepartment.maxScale * (1 - MAX_SCALE_CONTRACT_FRACTION)),
                );
                if (stoTargetMin < storageDepartment.maxScale) {
                    processFacilityContraction(planet, storageDepartment, agent, stoTargetMin, gameState, 0.5);
                }
                stoState.contractionIntegral = 0;
            }

            storageDepartment.pidState = stoState;
        }
    });

    if (isAutoscaleDebugEnabled()) {
        logAutoscalePlanet({
            tick: gameState.tick,
            planetId: planet.id,
            planetName: planet.name,
            ...debugAggregates,
            constructionPrice: planet.marketPrices[constructionServiceResourceType.name] ?? 0,
            constructionCostFloor: planet.lastProductionCostFloors[constructionServiceResourceType.name] ?? 0,
            constructionPriceCostFloorRatio:
                (planet.lastProductionCostFloors[constructionServiceResourceType.name] ?? 0) > 0
                    ? (planet.marketPrices[constructionServiceResourceType.name] ?? 0) /
                      planet.lastProductionCostFloors[constructionServiceResourceType.name]
                    : 0,
        });
    }
}
