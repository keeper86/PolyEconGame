import { processFacilityContraction } from '../agents/recycler';
import { computeBufferCapacity, computeMaxDailyHROutput } from '../workforce/hrBuffer';
import { isAutoscaleDebugEnabled, logAutoscaleFacility, logAutoscalePlanet } from './automaticProductionScaleDebug';
import type { HRFacility, PidState, ProductionFacility, StorageFacility } from './facility';
import { calculateCostsForConstruction, getTransportStarvation, storageFormKeys } from './facility';
import type { Agent, AgentPlanetAssets, GameState, Planet } from './planet';
import { constructionServiceResourceType } from './services';
import { PRODUCED_HR_QUANTITY } from './specialFacilities';

export * from './automaticProductionScale/constants';
export {
    computeDynamicExpansionTarget,
    findMaxAffordableScale,
    findMaxScaleForCSBudget,
    findMaxScaleForLandboundResources,
} from './automaticProductionScale/expansionTarget';
export { computePidDelta, getDefaultPidState } from './automaticProductionScale/pidController';
export { computeFacilityStorageSignal, softClip } from './automaticProductionScale/signalComputation';
export {
    assertStabilityConditions,
    checkCapacityCoversTarget,
    checkLimitCycleBand,
    checkSymmetricRateLimit,
    correctionTimeTicks,
    evaluateStabilityConditions,
    limitCycleRatio,
    storageLeadTimeTicks,
} from './automaticProductionScale/stabilityConditions';
export {
    computeStorageExpansionTarget,
    computeStorageSignal,
    STORAGE_TARGET_FILL_RATE,
} from './automaticProductionScale/storageAutoscale';

import {
    CONTRACTION_INTEGRAL_DECAY,
    CONTRACTION_INTEGRAL_MAX,
    CONTRACTION_INTEGRAL_THRESHOLD,
    DYNAMIC_EXPANSION_CAP_FRACTION,
    EXPANSION_INTEGRAL_DECAY,
    EXPANSION_INTEGRAL_MAX,
    EXPANSION_INTEGRAL_THRESHOLD,
    EXPANSION_PRICE_INFLATION_THRESHOLD,
    EXPANSION_WORKING_CAPITAL_TICKS,
    EXPANSION_AT_CAPACITY_FRACTION,
    HR_EXPANSION_MIN_PRODUCTIVITY_MULTIPLIER,
    MAX_SCALE_CONTRACT_FRACTION,
    MIN_SCALE_FRACTION,
    SIGNAL_EMA_ALPHA,
    SOFT_FLOOR_RELAXATION,
    STORAGE_CONTRACTION_RATE,
    STORAGE_EXPANSION_RATE,
    STORAGE_STARVATION_EXPANSION_MAX,
} from './automaticProductionScale/constants';
import {
    getContractionIntegralThreshold,
    getExpansionIntegralThreshold,
    getExpansionAtCapacityFraction,
    getMinScaleFraction,
} from './automaticProductionScale/runtimeConfig';
import { initiateCapacityExpansion } from './automaticProductionScale/expansionActions';
import {
    calculateExpansionParams,
    computeDynamicExpansionTarget,
    findMaxAffordableScale,
    findMaxScaleForCSBudget,
} from './automaticProductionScale/expansionTarget';
import {
    agentHasOwnConstructionFacility,
    checkExpansionFunds,
    computeConstructionInflationFactor,
} from './automaticProductionScale/expansionUtils';
import { computePidDelta, getDefaultPidState } from './automaticProductionScale/pidController';
import { updateServiceFlowSignal } from './automaticProductionScale/serviceFlow';
import { computeFacilityStorageSignal } from './automaticProductionScale/signalComputation';
import { computeStorageExpansionTarget, computeStorageSignal } from './automaticProductionScale/storageAutoscale';
import { updateAgentShellCompartments } from './automaticProductionScale/shellCompartments';

const HR_TARGET_FILL_RATE = 0.85;
const HR_EXPANSION_FACTOR = 1.4;

function computeHrSignal(hrDepartment: HRFacility): number {
    const pMax = computeBufferCapacity(computeMaxDailyHROutput(hrDepartment.maxScale));
    const fillRate = pMax > 0 ? hrDepartment.hrBuffer / pMax : 0;
    return Math.max(-1, Math.min(1, (HR_TARGET_FILL_RATE - fillRate) / HR_TARGET_FILL_RATE));
}

const SHELL_BUFFER_FRACTION = 1.5;
const SHELL_OVERSHOOT_FRACTION = 2;

// Returns the construction budget still available after deciding growth (contraction frees budget).
export function reconcileShellScale(
    planet: Planet,
    agent: Agent,
    gameState: GameState,
    assets: AgentPlanetAssets,
    shell: StorageFacility,
    requiredScale: number,
    hasOwnConstruction: boolean,
    remainingConstructionBudget: number,
): number {
    if (requiredScale <= 0 || shell.construction !== null) {
        return remainingConstructionBudget;
    }

    const bufferScale = Math.max(1, Math.ceil(requiredScale * SHELL_BUFFER_FRACTION));

    if (shell.maxScale < requiredScale) {
        if (remainingConstructionBudget <= 0) {
            return remainingConstructionBudget;
        }
        const started = initiateCapacityExpansion(shell, assets, planet, hasOwnConstruction, bufferScale);
        if (!started) {
            return remainingConstructionBudget;
        }
        return Math.max(0, remainingConstructionBudget - shell.construction!.maximumConstructionServiceConsumption);
    }

    if (shell.maxScale > requiredScale * SHELL_OVERSHOOT_FRACTION && shell.maxScale > bufferScale) {
        processFacilityContraction(planet, shell, agent, bufferScale, gameState, 0.5);
    }

    return remainingConstructionBudget;
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
        efficiencyHealthy: boolean;
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
    inputsHealthy: boolean,
    workerCoverage: number,
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
    if (!inputsHealthy) {
        blockReason.push('inputsBelow90');
    }
    if (workerCoverage <= 0.05) {
        blockReason.push('lowWorkerCoverage');
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
            efficiencyHealthy: inputsHealthy,
            workersAvailable: workerCoverage >= 0.9,
            fundsAvailable,
            hasOwnConstruction,
        },
        workforce: {
            availableUnemployed: 0,
            requiredNewWorkers: 0,
            requiredWithReserve: workerCoverage,
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
    const expThreshold = getExpansionIntegralThreshold() ?? EXPANSION_INTEGRAL_THRESHOLD;
    const conThreshold = getContractionIntegralThreshold() ?? CONTRACTION_INTEGRAL_THRESHOLD;
    const debugAggregates = {
        facilitiesAtMaxScale: 0,
        facilitiesAtMaxScalePositiveSignal: 0,
        expansionCandidates: 0,
        expansionsStarted: 0,
        blockedByIntegral: 0,
        blockedByEfficiency: 0,
        blockedByFunds: 0,
    };

    const resourceTotalMaxCapacity = new Map<string, number>();
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
                if (facility.construction !== null) {
                    totalActiveConstructionDemand += facility.construction.maximumConstructionServiceConsumption;
                }
            }
            if (assets.humanResourcesDepartment?.construction !== null) {
                totalActiveConstructionDemand +=
                    assets.humanResourcesDepartment?.construction.maximumConstructionServiceConsumption ?? 0;
            }
            if (assets.storage?.department?.construction !== null) {
                totalActiveConstructionDemand +=
                    assets.storage.department?.construction.maximumConstructionServiceConsumption ?? 0;
            }
            for (const facility of assets.shipConstructionFacilities) {
                if (facility.construction !== null) {
                    totalActiveConstructionDemand += facility.construction.maximumConstructionServiceConsumption;
                }
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

    let remainingConstructionBudget =
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
                (o) => planet.avgMarketResult[o.resource.name] !== undefined,
            );
            if (!hasAnyMarketData) {
                continue;
            }

            const state: PidState = { ...getDefaultPidState(), ...facility.pidState };

            const inputEfficiency = Object.values(facility.lastTickResults.resourceEfficiency).reduce(
                (sum, r) => Math.min(sum, r),
                1,
            );

            const serviceFlowSignal = updateServiceFlowSignal(facility, assets, planet, state);
            const maxError = computeFacilityStorageSignal(facility, assets).maxError;
            const storageSignal = maxError > 0 ? inputEfficiency * maxError : maxError;

            const signal = serviceFlowSignal ? serviceFlowSignal.error : storageSignal;
            state.smoothedSignal = signal;

            const delta = computePidDelta(signal, state) * facility.maxScale;
            const minScale = facility.maxScale * (getMinScaleFraction() ?? MIN_SCALE_FRACTION);
            let newScale = facility.scale + delta;
            if (newScale < minScale) {
                newScale = minScale - (minScale - newScale) * SOFT_FLOOR_RELAXATION;
                newScale = Math.max(0, newScale);
            }
            newScale = Math.min(facility.maxScale, newScale);
            facility.scale = newScale;

            const hrHealthy = (assets.hrProductivityMultiplier ?? 1) >= HR_EXPANSION_MIN_PRODUCTIVITY_MULTIPLIER;
            const storageHealthy = getTransportStarvation(assets.storage) <= STORAGE_STARVATION_EXPANSION_MAX;

            const atMaxScale = facility.scale >= facility.maxScale * (getExpansionAtCapacityFraction() ?? EXPANSION_AT_CAPACITY_FRACTION);
            const atMinScale = facility.scale <= minScale;

            if (atMaxScale && signal > 0 && hrHealthy && storageHealthy) {
                state.expansionIntegral = Math.min(
                    EXPANSION_INTEGRAL_MAX,
                    state.expansionIntegral + STORAGE_EXPANSION_RATE,
                );
            } else {
                state.expansionIntegral = Math.max(0, state.expansionIntegral - EXPANSION_INTEGRAL_DECAY);
            }

            if (atMinScale && signal < 0) {
                state.contractionIntegral = Math.min(
                    CONTRACTION_INTEGRAL_MAX,
                    state.contractionIntegral + STORAGE_CONTRACTION_RATE,
                );
            } else {
                state.contractionIntegral = Math.max(0, state.contractionIntegral - CONTRACTION_INTEGRAL_DECAY);
            }

            const dynamicThreshold = hasOwnConstruction
                ? expThreshold
                : Math.min(
                      EXPANSION_INTEGRAL_MAX,
                      expThreshold *
                          Math.max(1, computeConstructionInflationFactor(planet) / EXPANSION_PRICE_INFLATION_THRESHOLD),
                  );

            const hasNoActiveConstruction = facility.construction === null;
            const positiveSignal = signal > 0;
            const integralAboveThreshold = state.expansionIntegral >= dynamicThreshold;
            const resourceEfficiencyValues = Object.values(facility.lastTickResults?.resourceEfficiency ?? {});
            const worstInputEfficiency =
                resourceEfficiencyValues.length > 0 ? Math.min(...resourceEfficiencyValues) : 1;
            const inputsHealthy = worstInputEfficiency >= 0.9;
            const workerCoverageValues = Object.values(facility.lastTickResults?.workerEfficiency ?? {}).filter(
                (v): v is number => typeof v === 'number',
            );
            const workerCoverage = workerCoverageValues.length > 0 ? Math.min(...workerCoverageValues) : 1;
            const baseConditionsMet = hasNoActiveConstruction && integralAboveThreshold && inputsHealthy;

            let debugEntry: AutoscaleDebugEntry | null = null;
            let fundsAvailable = false;

            if (isAutoscaleDebugEnabled()) {
                if (atMaxScale) {
                    debugAggregates.facilitiesAtMaxScale++;
                }
                if (atMaxScale && positiveSignal) {
                    debugAggregates.facilitiesAtMaxScalePositiveSignal++;
                }
            }

            const needFundsCheck = baseConditionsMet || (isAutoscaleDebugEnabled() && atMaxScale && positiveSignal);
            if (needFundsCheck) {
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

            if (isAutoscaleDebugEnabled() && atMaxScale && positiveSignal) {
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
                    signal,
                    signal,
                    delta,
                    dynamicThreshold,
                    atMaxScale,
                    hasNoActiveConstruction,
                    integralAboveThreshold,
                    inputsHealthy,
                    workerCoverage,
                    fundsAvailable,
                    hasOwnConstruction,
                );
                debugAggregates.expansionCandidates++;
                if (!integralAboveThreshold) {
                    debugAggregates.blockedByIntegral++;
                }
                if (!inputsHealthy) {
                    debugAggregates.blockedByEfficiency++;
                }
                if (!fundsAvailable) {
                    debugAggregates.blockedByFunds++;
                }
            }

            if (baseConditionsMet && fundsAvailable) {
                const dynamicTarget = computeDynamicExpansionTarget(
                    facility,
                    assets,
                    planet,
                    hasOwnConstruction,
                    remainingConstructionBudget,
                );
                if (dynamicTarget > facility.maxScale) {
                    const effectiveTarget = facility.maxScale + (dynamicTarget - facility.maxScale) * workerCoverage;
                    if (effectiveTarget >= facility.maxScale + 1) {
                        const expanded = initiateCapacityExpansion(
                            facility,
                            assets,
                            planet,
                            hasOwnConstruction,
                            effectiveTarget,
                        );
                        if (expanded) {
                            remainingConstructionBudget = Math.max(
                                0,
                                remainingConstructionBudget -
                                    facility.construction!.maximumConstructionServiceConsumption,
                            );
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
            }

            if (debugEntry) {
                logAutoscaleFacility(debugEntry);
            }

            if (
                facility.construction === null &&
                state.contractionIntegral >= conThreshold &&
                facility.scale < facility.maxScale
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

            const hrDelta = computePidDelta(hrSignal, hrState) * hrDepartment.maxScale;

            hrDepartment.scale = Math.max(
                hrDepartment.maxScale * MIN_SCALE_FRACTION,
                Math.min(hrDepartment.maxScale, hrDepartment.scale + hrDelta),
            );

            const hrUtilization = hrDepartment.scale / hrDepartment.maxScale;
            if (hrUtilization >= 0.8 && hrSignal > 0) {
                hrState.expansionIntegral = Math.min(EXPANSION_INTEGRAL_MAX, hrState.expansionIntegral + hrSignal);
            } else {
                hrState.expansionIntegral = Math.max(0, hrState.expansionIntegral - EXPANSION_INTEGRAL_DECAY);
            }

            if (hrDepartment.scale < hrDepartment.maxScale && hrSignal < 0) {
                hrState.contractionIntegral = Math.min(
                    CONTRACTION_INTEGRAL_MAX,
                    hrState.contractionIntegral + Math.abs(hrSignal),
                );
            } else {
                hrState.contractionIntegral = Math.max(0, hrState.contractionIntegral - CONTRACTION_INTEGRAL_DECAY);
            }

            const hrDynamicThreshold = Math.min(
                EXPANSION_INTEGRAL_MAX,
                expThreshold *
                    Math.max(1, computeConstructionInflationFactor(planet) / EXPANSION_PRICE_INFLATION_THRESHOLD),
            );

            const hrDemandScale = Math.max(
                1,
                Math.ceil((assets.usedWorkers * HR_EXPANSION_FACTOR) / PRODUCED_HR_QUANTITY),
            );
            const hrDemandExceedsCapacity = hrDemandScale > hrDepartment.maxScale;

            if (
                hrDepartment.construction === null &&
                (hrDemandExceedsCapacity || (hrUtilization >= 0.8 && hrState.expansionIntegral >= hrDynamicThreshold))
            ) {
                let hrTargetMax = Math.max(hrDemandScale, hrDepartment.maxScale + 1);

                const hrAbsoluteCap =
                    hrDepartment.maxScale +
                    Math.max(1, Math.ceil(hrDepartment.maxScale * DYNAMIC_EXPANSION_CAP_FRACTION));
                hrTargetMax = Math.min(hrTargetMax, hrAbsoluteCap);

                if (!hasOwnConstruction) {
                    hrTargetMax = findMaxAffordableScale(
                        hrDepartment,
                        assets,
                        planet,
                        hrDepartment.maxScale,
                        hrTargetMax,
                    );
                    hrTargetMax = findMaxScaleForCSBudget(
                        hrDepartment,
                        hrDepartment.maxScale,
                        hrTargetMax,
                        remainingConstructionBudget,
                    );
                }

                if (hrTargetMax > hrDepartment.maxScale) {
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
                    remainingConstructionBudget = Math.max(0, remainingConstructionBudget - adjCost / adjTime);
                    hrState.expansionIntegral = 0;
                }
            }

            if (
                hrDepartment.scale < hrDepartment.maxScale &&
                hrDepartment.construction === null &&
                hrState.contractionIntegral >= conThreshold
            ) {
                const hrTargetMin = Math.max(1, Math.floor(hrDepartment.maxScale * (1 - MAX_SCALE_CONTRACT_FRACTION)));
                if (hrTargetMin < hrDepartment.maxScale) {
                    processFacilityContraction(planet, hrDepartment, agent, hrTargetMin, gameState, 0.5);
                }
                hrState.contractionIntegral = 0;
            }

            hrDepartment.pidState = hrState;
        }

        const storageDepartment = assets.storage.department;
        if (storageDepartment && storageDepartment.construction?.type !== 'new') {
            const stoRawSignal = computeStorageSignal(storageDepartment);
            const stoState: PidState = { ...getDefaultPidState(), ...storageDepartment.pidState };

            const stoSignal = SIGNAL_EMA_ALPHA * stoRawSignal + (1 - SIGNAL_EMA_ALPHA) * stoState.smoothedSignal;
            stoState.smoothedSignal = stoSignal;

            const stoDelta = computePidDelta(stoSignal, stoState) * storageDepartment.maxScale;

            storageDepartment.scale = Math.max(
                storageDepartment.maxScale * MIN_SCALE_FRACTION,
                Math.min(storageDepartment.maxScale, storageDepartment.scale + stoDelta),
            );

            if (stoSignal > 0) {
                stoState.expansionIntegral = Math.min(EXPANSION_INTEGRAL_MAX, stoState.expansionIntegral + stoSignal);
            } else {
                stoState.expansionIntegral = Math.max(0, stoState.expansionIntegral - EXPANSION_INTEGRAL_DECAY);
            }

            if (storageDepartment.scale < storageDepartment.maxScale && stoSignal < 0) {
                stoState.contractionIntegral = Math.min(
                    CONTRACTION_INTEGRAL_MAX,
                    stoState.contractionIntegral + Math.abs(stoSignal),
                );
            } else {
                stoState.contractionIntegral = Math.max(0, stoState.contractionIntegral - CONTRACTION_INTEGRAL_DECAY);
            }

            const stoDynamicThreshold = Math.min(
                EXPANSION_INTEGRAL_MAX,
                expThreshold *
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
                    remainingConstructionBudget,
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
                        remainingConstructionBudget = Math.max(
                            0,
                            remainingConstructionBudget -
                                storageDepartment.construction!.maximumConstructionServiceConsumption,
                        );
                        stoState.expansionIntegral = 0;
                    }
                }
            }

            if (
                storageDepartment.scale < storageDepartment.maxScale &&
                storageDepartment.construction === null &&
                stoState.contractionIntegral >= conThreshold
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

        const shellSizing = updateAgentShellCompartments(assets);

        for (const form of storageFormKeys()) {
            const sizing = shellSizing[form];
            if (!sizing) {
                continue;
            }
            remainingConstructionBudget = reconcileShellScale(
                planet,
                agent,
                gameState,
                assets,
                assets.storage.shells[form],
                sizing.requiredScale,
                hasOwnConstruction,
                remainingConstructionBudget,
            );
        }
    });

    // Non-automated (player) agents never get production-scale autoscaling, but they still trade, so their
    // shell compartments must be authored to the production footprint or their physical-good bids find no
    // allocated storage and are dropped. No shell reconcile here: growing/shrinking shells is the player's
    // own construction decision.
    gameState.agents.forEach((agent) => {
        if (agent.automated) {
            return;
        }
        const assets = agent.assets[planet.id];
        if (assets) {
            updateAgentShellCompartments(assets);
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
