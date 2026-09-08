import assert from 'assert';
import {
    NOTICE_PERIOD_MONTHS,
    PRICE_CEIL,
    PRICE_FLOOR,
    SERVICE_DEPRECIATION_COST_MULTIPLIER,
    TICKS_PER_YEAR,
} from '../constants';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import { createShip } from '../ships/ships';
import { stochasticRound } from '../utils/stochasticRound';
import type { WorkforceCategory, WorkforceCohort } from '../workforce/workforce';
import { totalActiveForEdu, totalDepartingForEdu, totalOnboardingForEdu } from '../workforce/workforceAggregates';
import { ONBOARDING_EFFICIENCY, productivityFromXP, totalWorkersInCategory } from '../workforce/workforce';
import type { ResourceQuantity } from './claims';
import { extractFromClaimedResource, getLandBoundCostPerUnit, queryClaimedResource } from './claims';
import {
    auxiliaryCostPerTick,
    auxiliaryCostRates,
    facilityInputCostPerTick,
    facilityWageCostPerTick,
    jointOutputCostShares,
    type AuxiliaryCostRates,
} from './auxiliaryCosts';
import type { Facility, ManagementFacility, ProductionFacility, ShipConstructionFacility, Storage } from './facility';
import {
    computeFacilityConditionEfficiency,
    createLastTickResults,
    getAvailableStorageCapacity,
    putIntoStorageFacility,
    queryStorageFacility,
    removeFromStorageFacility,
} from './facility';
import type { Agent, AgentPlanetAssets, GameState, MonthAccumulator, Planet } from './planet';
import { getAllFacilities, hasActiveLicense, pushTickerEvent } from './planet';
import { constructionServiceResourceType } from './services';
import type { WaterFillFacilityResult, WorkerSlot } from './waterFill';
import { waterFill } from './waterFill';
import { ALL_PRODUCTION_FACILITY_ENTRIES } from './productionFacilities';
import { MIN_SCALE_FRACTION } from './automaticProductionScale/constants';
import { isStorageSpaceClampEnabled } from './automaticProductionScale/runtimeConfig';

function weightedMeanAgeForEdu(workforce: WorkforceCohort<WorkforceCategory>[], edu: EducationLevelType): number {
    let sumAge = 0;
    let count = 0;
    for (let age = 0; age < workforce.length; age++) {
        const active = workforce[age][edu].active;
        if (active > 0) {
            sumAge += age * active;
            count += active;
        }
    }
    return count > 0 ? sumAge / count : 30;
}

const RELATIVE_CONSUMPTION_MISMATCH_TOLERANCE = 1e-4;

type EnrichedFacility = {
    facility: Facility;
    resourceEfficiencyMap: Record<string, number>;
};

function emptyEduRecord(): Record<EducationLevelType, number> {
    return { none: 0, primary: 0, secondary: 0, tertiary: 0 };
}

type ConstructionTracking = { planet: Planet; monthAcc: MonthAccumulator; gameStateTick: number };

export function consumeConstructionForFacility(
    facility: Facility,
    storage: Storage | null,
    tracking: ConstructionTracking,
): number {
    if (!facility.construction || !storage) {
        return 0;
    }
    const resourceName = constructionServiceResourceType.name;
    const cs = facility.construction;
    const available = queryStorageFacility(storage, constructionServiceResourceType.name);
    let toConsume = Math.min(cs.maximumConstructionServiceConsumption, available);
    cs.lastTickInvestedConstructionServices = toConsume;

    if (toConsume > 0) {
        toConsume = removeFromStorageFacility(storage, constructionServiceResourceType.name, toConsume);
        cs.progress += toConsume;

        const price = tracking.planet.marketPrices[resourceName] ?? 0;
        tracking.planet.consumedResources[resourceName] =
            (tracking.planet.consumedResources[resourceName] ?? 0) + toConsume;
        tracking.monthAcc.consumedResources[resourceName] = {
            quantity: (tracking.monthAcc.consumedResources[resourceName]?.quantity ?? 0) + toConsume,
            value: (tracking.monthAcc.consumedResources[resourceName]?.value ?? 0) + toConsume * price,
        };
        tracking.monthAcc.consumptionValue += toConsume * price;

        tracking.planet.consumedResources[resourceName] =
            (tracking.planet.consumedResources[resourceName] ?? 0) + toConsume;
    }

    if (cs.progress >= cs.totalConstructionServiceRequired) {
        const oldMaxScale = facility.maxScale;
        const scaleFraction = oldMaxScale > 0 ? Math.round((facility.scale / oldMaxScale) * 4) / 4 : 1;
        const newMaxScale = cs.constructionTargetMaxScale;
        const addedScale = Math.max(0, newMaxScale - oldMaxScale);
        if (newMaxScale > 0) {
            facility.maxMaintenance = (oldMaxScale * facility.maxMaintenance + addedScale) / newMaxScale;
            facility.maintenanceStatus = Math.min(
                facility.maxMaintenance,
                (oldMaxScale * facility.maintenanceStatus + addedScale) / newMaxScale,
            );
            facility.cumulativeRepairAcc = (oldMaxScale * facility.cumulativeRepairAcc) / newMaxScale;
        }
        facility.maxScale = newMaxScale;
        facility.scale = facility.maxScale * Math.max(MIN_SCALE_FRACTION, scaleFraction);
        facility.construction = null;
        facility.lastConstructionCompletedTick = tracking.gameStateTick;
    }

    return toConsume;
}

export function constructionTick(gameState: GameState, planet: Planet): void {
    gameState.agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets) {
            return;
        }

        const allFacilities = getAllFacilities(assets);

        for (const facility of allFacilities) {
            const wasUnderConstruction = facility.construction !== null;
            const constructionServiceConsumption = consumeConstructionForFacility(facility, assets.storage, {
                planet,
                monthAcc: assets.monthAcc,
                gameStateTick: gameState.tick,
            });
            // For 'new' construction, the facility wasn't processed by productionTick(), so
            // lastTickResults contains stale data. Reset lastConsumed before setting fresh values.
            if (facility.construction?.type === 'new') {
                facility.lastTickResults = {
                    ...createLastTickResults(),
                    lastProduced: {},
                };
            }

            facility.lastTickResults.lastConsumed[constructionServiceResourceType.name] =
                (facility.lastTickResults.lastConsumed[constructionServiceResourceType.name] ?? 0) +
                constructionServiceConsumption;

            if (wasUnderConstruction && facility.construction === null) {
                pushTickerEvent(gameState, {
                    category: 'facilityCompleted',
                    planetId: planet.id,
                    agentId: agent.id,
                    agentName: agent.name,
                    message: `${agent.name} completed ${facility.name} on ${planet.name}`,
                    tick: gameState.tick,
                });
            }
        }
    });
}

function consumeNeeds(params: ProductionParameters | ManagementParameters): Record<string, number> {
    const { facility, storage, overallEfficiency, storageSpaceFactor, planet, agent } = params;
    const actualConsumed: Record<string, number> = {};

    const needs = facility.needs;
    const scale = facility.scale;
    const efficiency = overallEfficiency;
    const facilityId = facility.id;

    if (efficiency <= 0) {
        for (const need of needs) {
            actualConsumed[need.resource.name] = 0;
        }
        return actualConsumed;
    }
    for (const need of needs) {
        const consumed = need.quantity * scale * efficiency * storageSpaceFactor;
        if (need.resource.form === 'landBoundResource') {
            const extracted = extractFromClaimedResource(planet, agent, need.resource, consumed);
            actualConsumed[need.resource.name] = extracted;
            params.planet.consumedResources[need.resource.name] =
                (params.planet.consumedResources[need.resource.name] ?? 0) + extracted;

            if (process.env.SIM_DEBUG === '1') {
                if (consumed > 0 && Math.abs(extracted / consumed - 1) > RELATIVE_CONSUMPTION_MISMATCH_TOLERANCE) {
                    console.warn(`Unexpected: extracted ${extracted} of ${need.resource.name}, expected ${consumed}.`, {
                        planetId: planet.id,
                        agentId: agent.id,
                        facilityId,
                    });
                }
            }
        } else {
            const removed = removeFromStorageFacility(storage, need.resource.name, consumed);
            const actual = need.resource.form === 'services' ? consumed : removed;
            actualConsumed[need.resource.name] = actual;
            params.planet.consumedResources[need.resource.name] =
                (params.planet.consumedResources[need.resource.name] ?? 0) + actual;

            if (process.env.SIM_DEBUG === '1') {
                if (consumed > 0 && Math.abs(actual / consumed - 1) > RELATIVE_CONSUMPTION_MISMATCH_TOLERANCE) {
                    console.warn(`Unexpected: removed ${actual} of ${need.resource.name}, expected ${consumed}.`, {
                        planetId: planet.id,
                        agentId: agent.id,
                        facilityId,
                    });
                }
            }
        }
    }
    return actualConsumed;
}

function produceOutputs(
    params: IntermediateResults & { facility: ProductionFacility | ManagementFacility },
): Record<string, number> {
    const { facility, storage, overallEfficiency, storageSpaceFactor } = params;

    const actualProduced: Record<string, number> = {};

    if (overallEfficiency <= 0) {
        for (const output of facility.produces) {
            actualProduced[output.resource.name] = 0;
        }
        return actualProduced;
    }
    const totalTemplateOutput = facility.produces.reduce((sum, output) => sum + output.quantity, 0);
    const mix = facility.type === 'production' ? facility.productionMix : undefined;
    for (const output of facility.produces) {
        const share = mix?.[output.resource.name] ?? output.quantity / Math.max(1, totalTemplateOutput);
        const produced = totalTemplateOutput * share * facility.scale * overallEfficiency * storageSpaceFactor;
        actualProduced[output.resource.name] = produced;
        params.planet.producedResources[output.resource.name] =
            (params.planet.producedResources[output.resource.name] ?? 0) + produced;
        if (produced > 0) {
            const stored = putIntoStorageFacility(storage, output.resource, produced);
            if (Math.abs(stored / produced - 1) > RELATIVE_CONSUMPTION_MISMATCH_TOLERANCE) {
                console.warn(
                    `Unexpected: stored ${stored} of ${output.resource.name}, expected ${produced}. storage: ${storage.department?.transportStarvation} scale: ${facility.scale} / ${facility.maxScale}`,
                );
            }
        }
    }
    return actualProduced;
}

function computeTotalStorageDemand(enrichedFacilities: EnrichedFacility[]): Map<string, number> {
    const totalStorageDemand = new Map<string, number>();
    for (const { facility } of enrichedFacilities) {
        if (facility.type === 'ship_construction') {
            if (!facility.produces) {
                continue;
            }
            const proportionPerTick = Math.min(1, Math.sqrt(facility.scale) / facility.produces.buildingTime);
            for (const need of facility.produces.buildingCost) {
                const required = need.quantity * proportionPerTick;
                totalStorageDemand.set(
                    need.resource.name,
                    (totalStorageDemand.get(need.resource.name) ?? 0) + required,
                );
            }

            continue;
        }
        for (const need of facility.needs) {
            if (need.resource.form === 'landBoundResource') {
                continue;
            }
            const required = need.quantity * facility.scale;
            totalStorageDemand.set(need.resource.name, (totalStorageDemand.get(need.resource.name) ?? 0) + required);
        }
    }
    return totalStorageDemand;
}

function computeResourceEfficiencyMap(
    ef: EnrichedFacility,
    totalStorageDemand: Map<string, number>,
    storage: Storage,
    planet: Planet,
    agent: Agent,
): Record<string, number> {
    const { facility } = ef;
    const resourceEfficiencyMap: Record<string, number> = {};
    if (facility.type === 'ship_construction') {
        if (!facility.produces) {
            return resourceEfficiencyMap;
        }
        for (const need of facility.produces.buildingCost) {
            const required = need.quantity * Math.min(1, Math.sqrt(facility.scale) / facility.produces.buildingTime);
            const available = queryStorageFacility(storage, need.resource.name);
            const totalDemand = totalStorageDemand.get(need.resource.name) ?? required;
            const fairShare = totalDemand > 0 ? (required / totalDemand) * available : available;
            resourceEfficiencyMap[need.resource.name] = required > 0 ? Math.min(1, fairShare / required) : 1;
        }
        return resourceEfficiencyMap;
    }

    for (const need of facility.needs) {
        const required = need.quantity * facility.scale;
        if (need.resource.form === 'landBoundResource') {
            resourceEfficiencyMap[need.resource.name] =
                required > 0 ? Math.min(1, queryClaimedResource(planet, agent, need.resource) / required) : 1;
            continue;
        }
        const available = queryStorageFacility(storage, need.resource.name);
        const totalDemand = totalStorageDemand.get(need.resource.name) ?? required;
        const fairShare = totalDemand > 0 ? (required / totalDemand) * available : available;
        resourceEfficiencyMap[need.resource.name] = required > 0 ? Math.min(1, fairShare / required) : 1;
    }
    return resourceEfficiencyMap;
}

export function computeStorageSpaceFactor(facility: Facility, assets: AgentPlanetAssets): number {
    if (!isStorageSpaceClampEnabled()) {
        return 1;
    }
    if (facility.type === 'ship_construction') {
        return 1;
    }
    if (facility.type === 'storage') {
        return 1;
    }
    if (facility.produces.length === 0) {
        return 1;
    }
    const storage = assets.storage;
    const totalTemplateOutput = facility.produces.reduce((sum, output) => sum + output.quantity, 0);
    const mix = facility.type === 'production' ? facility.productionMix : undefined;
    let factor = 1;
    for (const output of facility.produces) {
        if (output.resource.form === 'services' || output.resource.form === 'internal') {
            continue;
        }
        const share = mix?.[output.resource.name] ?? output.quantity / Math.max(1, totalTemplateOutput);
        const producedPerTick = totalTemplateOutput * share * facility.scale;
        if (producedPerTick <= 0) {
            continue;
        }
        const freeQuantity = getAvailableStorageCapacity(storage, output.resource);
        factor = Math.min(factor, Math.min(1, freeQuantity / producedPerTick));
    }
    return Math.max(0, Math.min(1, factor));
}

type IntermediateResults = {
    storage: Storage;
    overallEfficiency: number;
    storageSpaceFactor: number;
    workerResults: WaterFillFacilityResult;
    resourceEfficiencyMap: Record<string, number>;
    monthAcc: MonthAccumulator;
    planet: Planet;
    agent: Agent;
};

type ProductionParameters = IntermediateResults & {
    facility: ProductionFacility;
};

type ManagementParameters = IntermediateResults & {
    facility: ManagementFacility;
};

type ShipConstructionParameters = IntermediateResults & {
    facility: ShipConstructionFacility;
};

function accumulateTheoreticalCostFloor(
    facility: ProductionFacility,
    planet: Planet,
    rates: AuxiliaryCostRates,
    outputAccum: Map<string, number>,
    costAccum: Map<string, number>,
): void {
    const totalCostPerUnit =
        facilityInputCostPerTick(facility, planet) +
        facilityWageCostPerTick(facility, planet) +
        auxiliaryCostPerTick(facility, rates);

    const shares = jointOutputCostShares(facility, planet, outputAccum);

    for (const output of facility.produces) {
        const qty = output.quantity;
        if (qty <= 0) {
            continue;
        }

        const share = shares.get(output.resource.name) ?? 0;
        const costForOutput = totalCostPerUnit * share;
        const outputDepreciationMultiplier =
            output.resource.form === 'services' ? SERVICE_DEPRECIATION_COST_MULTIPLIER : 1.0;

        costAccum.set(
            output.resource.name,
            (costAccum.get(output.resource.name) ?? 0) + costForOutput * outputDepreciationMultiplier,
        );
    }
}

export function updateProductionCostFloors(planet: Planet): void {
    const costAccum = new Map<string, number>();
    const outputAccum = new Map<string, number>();
    const rates = auxiliaryCostRates(planet);

    for (const { template } of Object.values(ALL_PRODUCTION_FACILITY_ENTRIES)) {
        for (const output of template.produces) {
            if (output.quantity > 0) {
                outputAccum.set(output.resource.name, (outputAccum.get(output.resource.name) ?? 0) + output.quantity);
            }
        }
    }

    for (const { template } of Object.values(ALL_PRODUCTION_FACILITY_ENTRIES)) {
        if (template.produces.length > 0) {
            accumulateTheoreticalCostFloor(template, planet, rates, outputAccum, costAccum);
        }
    }

    for (const [resource, totalCost] of costAccum) {
        const totalQty = outputAccum.get(resource) ?? 0;

        if (totalQty > 0) {
            planet.lastProductionCostFloors[resource] = Math.min(
                PRICE_CEIL,
                Math.max(PRICE_FLOOR, totalCost / totalQty),
            );
        }
    }
}

function processProductionFacility(params: ProductionParameters): void {
    const actualProduced = produceOutputs(params);
    const actualConsumed = consumeNeeds(params);
    const { overallEfficiency, workerResults, resourceEfficiencyMap, monthAcc, planet, facility, agent } = params;

    let costBalance = 0;

    const needCostByName = (need: ResourceQuantity) =>
        need.resource.form === 'landBoundResource'
            ? getLandBoundCostPerUnit(planet, agent.id, need.resource.name)
            : (planet.marketPrices[need.resource.name] ?? 0);

    let inputCosts = 0;
    facility.needs.forEach((need) => {
        const consumedQty = actualConsumed[need.resource.name] ?? 0;
        const value = consumedQty * needCostByName(need);
        costBalance -= value;
        inputCosts += value;
        monthAcc.consumptionValue += value;
    });

    const agentAssets = agent.assets[planet.id];
    assert(agentAssets, 'Agent assets should be defined at this point');
    const actualWageCost = computeWageCostPerTick(agentAssets.wagePerEdu, workerResults.totalUsedByEdu);
    costBalance -= actualWageCost;

    let outputRevenue = 0;
    for (const [name, qty] of Object.entries(actualProduced)) {
        const value = qty * (planet.marketPrices[name] ?? 0);
        costBalance += value;
        outputRevenue += value;
        monthAcc.productionValue += value;
    }

    if (outputRevenue > 0) {
        const totalCostThisFacility = actualWageCost + inputCosts;
        for (const [name, qty] of Object.entries(actualProduced)) {
            const outValue = qty * (planet.marketPrices[name] ?? 0);
            const costForOutput = totalCostThisFacility * (outValue / outputRevenue);
            planet.productionCosts[name] = (planet.productionCosts[name] ?? 0) + costForOutput;
        }
    }

    facility.lastTickResults = {
        overallEfficiency: overallEfficiency,
        workerEfficiency: workerResults.workerEfficiency,
        resourceEfficiency: resourceEfficiencyMap,
        overqualifiedWorkers: workerResults.overqualifiedWorkers,
        totalUsedByEdu: workerResults.totalUsedByEdu,
        exactUsedByEdu: workerResults.exactUsedByEdu,
        lastProduced: actualProduced,
        lastConsumed: actualConsumed,
        revenue: outputRevenue,
        wageCosts: actualWageCost,
        inputCosts,
        costBalance,
    };
}

function processManagementFacility(params: ManagementParameters): void {
    const actualConsumed = consumeNeeds(params);
    const actualProduced = produceOutputs(params);
    const { overallEfficiency, workerResults, resourceEfficiencyMap, monthAcc, planet, facility, agent } = params;

    let costBalance = 0;
    const needCostByName = new Map<string, number>();
    for (const need of facility.needs) {
        needCostByName.set(
            need.resource.name,
            need.resource.form === 'landBoundResource'
                ? getLandBoundCostPerUnit(planet, agent.id, need.resource.name)
                : (planet.marketPrices[need.resource.name] ?? 0),
        );
    }
    let inputCosts = 0;
    for (const [name, qty] of Object.entries(actualConsumed)) {
        const value = qty * (needCostByName.get(name) ?? planet.marketPrices[name] ?? 0);
        costBalance -= value;
        inputCosts += value;
        monthAcc.consumptionValue += value;
    }

    const wageCosts = computeWageCostPerTick(params.agent.assets[planet.id].wagePerEdu, workerResults.totalUsedByEdu);
    costBalance -= wageCosts;
    facility.lastTickResults = {
        overallEfficiency,
        workerEfficiency: workerResults.workerEfficiency,
        resourceEfficiency: resourceEfficiencyMap,
        overqualifiedWorkers: workerResults.overqualifiedWorkers,
        totalUsedByEdu: workerResults.totalUsedByEdu,
        exactUsedByEdu: workerResults.exactUsedByEdu,
        lastProduced: actualProduced,
        lastConsumed: actualConsumed,
        wageCosts,
        inputCosts,
        costBalance,
    };
}

function processShipConstructionFacility(params: ShipConstructionParameters, gameState: GameState): void {
    const { facility, storage, overallEfficiency, workerResults, resourceEfficiencyMap, monthAcc, planet, agent } =
        params;
    const actualConsumed: Record<string, number> = {};
    if (facility.produces) {
        if (overallEfficiency > 0) {
            const part = Math.min(1, Math.sqrt(facility.scale) / facility.produces.buildingTime);
            for (const need of facility.produces.buildingCost) {
                const required = need.quantity * part;
                const consumed = required * overallEfficiency;
                const removed = removeFromStorageFacility(storage, need.resource.name, consumed);
                actualConsumed[need.resource.name] = need.resource.form === 'services' ? consumed : removed;
            }
            facility.progress += part * overallEfficiency;
            if (facility.progress >= 1) {
                const newShip = createShip(facility.produces, gameState.tick, facility.shipName, planet);
                agent.ships.push(newShip);
                pushTickerEvent(gameState, {
                    category: 'shipCompleted',
                    planetId: planet.id,
                    agentId: agent.id,
                    agentName: agent.name,
                    message: `${agent.name} completed ${newShip.name} (${newShip.type.type}) on ${planet.name}`,
                    tick: gameState.tick,
                });
                facility.progress = 0;
                facility.produces = null;
                facility.shipName = '';
            }
        } else {
            for (const need of facility.produces.buildingCost) {
                actualConsumed[need.resource.name] = 0;
            }
        }
    }

    let costBalance = 0;
    let inputCosts = 0;
    for (const [name, qty] of Object.entries(actualConsumed)) {
        const value = qty * (planet.marketPrices[name] ?? 0);
        monthAcc.consumptionValue += value;
        costBalance -= value;
        inputCosts += value;
        monthAcc.consumedResources[name] = {
            quantity: (monthAcc.consumedResources[name]?.quantity ?? 0) + qty,
            value: (monthAcc.consumedResources[name]?.value ?? 0) + value,
        };
    }

    const agentAssets = agent.assets[planet.id];
    assert(agentAssets, 'Agent assets should be defined at this point');
    const actualWageCost = computeWageCostPerTick(agentAssets.wagePerEdu, workerResults.totalUsedByEdu);
    costBalance -= actualWageCost;

    facility.lastTickResults = {
        overallEfficiency,
        workerEfficiency: workerResults.workerEfficiency,
        resourceEfficiency: resourceEfficiencyMap,
        overqualifiedWorkers: workerResults.overqualifiedWorkers,
        totalUsedByEdu: workerResults.totalUsedByEdu,
        exactUsedByEdu: workerResults.exactUsedByEdu,
        lastConsumed: actualConsumed,
        wageCosts: actualWageCost,
        inputCosts,
        costBalance,
    };
}

export function productionTick(gameState: GameState, planet: Planet): void {
    gameState.agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets) {
            return;
        }
        if (!hasActiveLicense(assets, 'workforce')) {
            return;
        }

        const workforce = assets.workforceDemography;

        const workerPool = {} as Record<EducationLevelType, number>;
        for (const edu of educationLevelKeys) {
            const active = workforce ? totalActiveForEdu(workforce, edu) : 0;
            const departing = workforce ? totalDepartingForEdu(workforce, edu) : 0;
            const onboarding = workforce ? totalOnboardingForEdu(workforce, edu) : 0;
            const onboardingEfficiency = gameState.tick < TICKS_PER_YEAR ? 1 : ONBOARDING_EFFICIENCY;
            workerPool[edu] =
                active +
                stochasticRound(departing * DEPARTING_EFFICIENCY) +
                stochasticRound(onboarding * onboardingEfficiency);
        }

        const ageProd = {} as Record<EducationLevelType, number>;
        for (const edu of educationLevelKeys) {
            ageProd[edu] = ageProductivityMultiplier(workforce ? weightedMeanAgeForEdu(workforce, edu) : 30);
        }

        const xpProdByEdu = {} as Record<EducationLevelType, number>;
        for (const edu of educationLevelKeys) {
            if (!workforce) {
                xpProdByEdu[edu] = 1;
                continue;
            }
            let totalXP = 0;
            let totalWorkers = 0;
            for (let age = 0; age < workforce.length; age++) {
                const category = workforce[age][edu];
                totalXP += category.workforceExperience;
                totalWorkers += totalWorkersInCategory(category);
            }
            const avgXP = totalWorkers > 0 ? totalXP / totalWorkers : 0;
            xpProdByEdu[edu] = productivityFromXP(avgXP);
        }

        const activeFacilities = getAllFacilities(assets, true);

        const enrichedFacilities: EnrichedFacility[] = activeFacilities.map((facility) => {
            return { facility, resourceEfficiencyMap: {} };
        });

        const totalStorageDemand = computeTotalStorageDemand(enrichedFacilities);
        for (const ef of enrichedFacilities) {
            ef.resourceEfficiencyMap = computeResourceEfficiencyMap(
                ef,
                totalStorageDemand,
                assets.storage,
                planet,
                agent,
            );
        }

        const allSlots: WorkerSlot[] = [];
        const hrSlots: WorkerSlot[] = [];
        const effectiveDemandBySlot = new Map<WorkerSlot, number>();
        const totalSlotCapacity: Record<EducationLevelType, number> = {
            none: 0,
            primary: 0,
            secondary: 0,
            tertiary: 0,
        };
        for (const { facility } of enrichedFacilities) {
            const construction = facility.construction;
            const allocatorScale =
                construction &&
                construction.type === 'expansion' &&
                construction.constructionTargetMaxScale > facility.scale
                    ? facility.scale +
                      (construction.constructionTargetMaxScale - facility.scale) *
                          Math.min(
                              1,
                              construction.progress / Math.max(1, construction.totalConstructionServiceRequired),
                          )
                    : facility.scale;
            for (const [eduLevel, req] of Object.entries(facility.workerRequirement)) {
                if (!req || req <= 0) {
                    continue;
                }
                const jobEdu = eduLevel as EducationLevelType;
                const jobEduIdx = educationLevelKeys.indexOf(jobEdu);
                const allocatorFullTarget = req * allocatorScale;

                const hrMult =
                    facility.id === assets.humanResourcesDepartment?.id ? 1 : assets.hrProductivityMultiplier;

                const avgXpProd = xpProdByEdu[jobEdu] ?? 1;
                const combinedProd = ageProd[jobEdu] * avgXpProd * hrMult;
                const bodies = combinedProd > 0 ? Math.ceil(allocatorFullTarget / combinedProd) : 0;
                const slot: WorkerSlot = {
                    facilityId: facility.id,
                    facilityType: facility.type,
                    jobEdu,
                    jobEduIdx,
                    capacity: Math.max(1, bodies),
                    assigned: 0,
                    effectiveAssigned: 0,
                    assignedByEdu: {},
                    overqualifiedCount: 0,
                    hrMultiplier: hrMult,
                };
                if (facility.id === assets.humanResourcesDepartment?.id) {
                    hrSlots.push(slot);
                } else {
                    allSlots.push(slot);
                }
                totalSlotCapacity[jobEdu] = (totalSlotCapacity[jobEdu] ?? 0) + slot.capacity;
                effectiveDemandBySlot.set(slot, req * facility.scale);
            }
        }

        assets.totalSlotCapacity = totalSlotCapacity;

        let remaining: Record<EducationLevelType, number>;
        let byFacility: Map<string, WaterFillFacilityResult>;
        let used: number;

        if (hrSlots.length > 0) {
            const hrResult = waterFill(hrSlots, workerPool, ageProd, xpProdByEdu, effectiveDemandBySlot);
            const otherResult = waterFill(allSlots, hrResult.remaining, ageProd, xpProdByEdu, effectiveDemandBySlot);
            byFacility = new Map([...hrResult.byFacility, ...otherResult.byFacility]);
            remaining = otherResult.remaining;
            used = hrResult.used + otherResult.used;
        } else {
            const result = waterFill(allSlots, workerPool, ageProd, xpProdByEdu, effectiveDemandBySlot);
            remaining = result.remaining;
            byFacility = result.byFacility;
            used = result.used;
        }

        assets.usedWorkers = used;

        if (workforce) {
            for (let age = 0; age < workforce.length; age++) {
                for (const edu of educationLevelKeys) {
                    const cat = workforce[age][edu];
                    const pool = workerPool[edu];
                    const unassigned = remaining[edu];
                    const assignmentRatio = pool > 0 ? (pool - unassigned) / pool / TICKS_PER_YEAR : 0;
                    cat.workforceExperience += cat.active * assignmentRatio;
                    for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
                        cat.workforceExperience += cat.onboarding[m] * ONBOARDING_EFFICIENCY * assignmentRatio;
                    }
                    for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
                        cat.workforceExperience +=
                            (cat.voluntaryDeparting[m] + cat.departingFired[m] + cat.departingRetired[m]) *
                            DEPARTING_EFFICIENCY *
                            assignmentRatio;
                    }
                }
            }
        }

        const unusedWorkers = {} as Record<EducationLevelType, number>;
        for (const edu of educationLevelKeys) {
            unusedWorkers[edu] = remaining[edu];
        }
        assets.unusedWorkers = unusedWorkers;

        const overqualifiedWorkers: {
            [jobEdu in EducationLevelType]?: {
                [workerEdu in EducationLevelType]?: number;
            };
        } = {};
        for (const facResult of byFacility.values()) {
            for (const [jobEdu, breakdown] of Object.entries(facResult.overqualifiedWorkers)) {
                const je = jobEdu as EducationLevelType;
                if (!overqualifiedWorkers[je]) {
                    overqualifiedWorkers[je] = {};
                }
                for (const [workerEdu, count] of Object.entries(breakdown)) {
                    const we = workerEdu as EducationLevelType;
                    overqualifiedWorkers[je]![we] = (overqualifiedWorkers[je]![we] ?? 0) + (count as number);
                }
            }
        }
        assets.overqualifiedWorkers = overqualifiedWorkers;

        for (const { facility, resourceEfficiencyMap } of enrichedFacilities) {
            const workerResults: WaterFillFacilityResult = byFacility.get(facility.id) ?? {
                workerEfficiency: {},
                workerEfficiencyOverall: 1,
                overqualifiedWorkers: {},
                totalUsedByEdu: emptyEduRecord(),
                exactUsedByEdu: emptyEduRecord(),
            };

            const resourceEfficiencies = Object.values(resourceEfficiencyMap);
            const rawEfficiency = Math.min(
                workerResults.workerEfficiencyOverall,
                ...(resourceEfficiencies.length > 0 ? resourceEfficiencies : [1]),
            );
            const overallEfficiency = rawEfficiency * computeFacilityConditionEfficiency(facility.maintenanceStatus);
            const storageSpaceFactor = computeStorageSpaceFactor(facility, assets);

            if (overallEfficiency > 0) {
                planet.environment.pollution.air +=
                    facility.pollutionPerTick.air * facility.scale * overallEfficiency * storageSpaceFactor;
                planet.environment.pollution.water +=
                    facility.pollutionPerTick.water * facility.scale * overallEfficiency * storageSpaceFactor;
                planet.environment.pollution.soil +=
                    facility.pollutionPerTick.soil * facility.scale * overallEfficiency * storageSpaceFactor;
            }

            const productionParameterBase = {
                storage: assets.storage,
                overallEfficiency,
                storageSpaceFactor,
                workerResults,
                resourceEfficiencyMap,
                monthAcc: assets.monthAcc,
                planet,
                agent,
            };

            if (facility.type === 'production') {
                processProductionFacility({ ...productionParameterBase, facility });
            } else if (facility.type === 'management' || facility.type === 'storage') {
                processManagementFacility({
                    ...productionParameterBase,
                    facility: facility as ManagementFacility,
                });
            } else {
                processShipConstructionFacility({ ...productionParameterBase, facility }, gameState);
            }
        }
    });
}

const DEPARTING_EFFICIENCY = 0.5;
export const ageProductivityMultiplier = (age: number): number => {
    if (age <= 18) {
        return 0.8;
    }
    if (age < 30) {
        return 0.8 + ((age - 18) * 0.2) / 12;
    }
    if (age <= 50) {
        return 1.0;
    }
    if (age < 65) {
        return 1.0 - ((age - 50) * 0.15) / 15;
    }
    return Math.max(0.7, 0.85 - ((age - 65) * 0.15) / 15);
};

function computeWageCostPerTick(
    agentWages: AgentPlanetAssets['wagePerEdu'],
    totalUsedByEdu: Record<EducationLevelType, number>,
): number {
    let wageCost = 0;
    for (const edu of educationLevelKeys) {
        const workers = totalUsedByEdu[edu] ?? 0;
        if (workers > 0) {
            wageCost += agentWages[edu] * workers;
        }
    }
    return wageCost;
}
