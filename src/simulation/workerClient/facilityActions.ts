import { calculateCostsForConstruction, getFacilityType } from '../planet/facility';
import type { GameState } from '../planet/planet';
import { facilityByName } from '../planet/productionFacilities';
import { shipConstructionFacilityType } from '../planet/specialFacilities';
import { constructionShipType, shiptypes } from '../ships/ships';
import { processFacilityContraction } from '../agents/recycler';
import type { OutboundMessage, PendingAction } from './messages';

export function handleBuildFacility(
    state: GameState,
    action: Extract<PendingAction, { type: 'buildFacility' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, facilityKey, targetScale = 1 } = action;
    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'facilityBuildFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'facilityBuildFailed',
            requestId,
            reason: `Agent has no assets on planet '${planetId}'`,
        });
        return;
    }
    const catalogEntry = facilityByName.get(facilityKey);
    if (!catalogEntry) {
        safePostMessage({
            type: 'facilityBuildFailed',
            requestId,
            reason: `Unknown facility '${facilityKey}'`,
        });
        return;
    }
    const alreadyExists = assets.productionFacilities.some((f) => f.name === facilityKey);
    if (alreadyExists) {
        safePostMessage({
            type: 'facilityBuildFailed',
            requestId,
            reason: `Facility '${facilityKey}' already exists on planet '${planetId}'`,
        });
        return;
    }
    const facilityId = `${agentId}-${facilityKey.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    const newFacility = catalogEntry.factory(planetId, facilityId);
    const facilityType = getFacilityType(newFacility);
    const { cost, time } = calculateCostsForConstruction(facilityType, 0, targetScale);
    newFacility.construction = {
        type: 'new',
        progress: 0,
        constructionTargetMaxScale: targetScale,
        totalConstructionServiceRequired: cost,
        maximumConstructionServiceConsumption: cost / time,
        lastTickInvestedConstructionServices: 0,
    };
    newFacility.scale = 0;
    newFacility.maxScale = 0;
    assets.productionFacilities.push(newFacility);
    console.log(`[worker] Agent '${agentId}' built '${facilityKey}' (scale ${targetScale}) on planet '${planetId}'`);
    safePostMessage({ type: 'facilityBuilt', requestId, agentId, facilityId });
}

export function handleExpandFacility(
    state: GameState,
    action: Extract<PendingAction, { type: 'expandFacility' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, facilityId, targetScale } = action;
    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'facilityExpandFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'facilityExpandFailed',
            requestId,
            reason: `Agent has no assets on planet '${planetId}'`,
        });
        return;
    }
    const facility = assets.productionFacilities.find((f) => f.id === facilityId);
    if (!facility) {
        safePostMessage({ type: 'facilityExpandFailed', requestId, reason: `Facility '${facilityId}' not found` });
        return;
    }
    if (facility.construction !== null) {
        safePostMessage({
            type: 'facilityExpandFailed',
            requestId,
            reason: 'Facility is already under construction',
        });
        return;
    }
    if (targetScale <= facility.maxScale) {
        safePostMessage({
            type: 'facilityExpandFailed',
            requestId,
            reason: `Target scale ${targetScale} must be greater than current max scale ${facility.maxScale}`,
        });
        return;
    }
    const facilityType = getFacilityType(facility);
    const { cost, time } = calculateCostsForConstruction(facilityType, facility.maxScale, targetScale);
    facility.construction = {
        type: 'expansion',
        progress: 0,
        constructionTargetMaxScale: targetScale,
        totalConstructionServiceRequired: cost,
        maximumConstructionServiceConsumption: cost / time,
        lastTickInvestedConstructionServices: 0,
    };
    console.log(
        `[worker] Agent '${agentId}' expanding '${facilityId}' to scale ${targetScale} on planet '${planetId}'`,
    );
    safePostMessage({ type: 'facilityExpanded', requestId, agentId, facilityId });
}

export function handleSetFacilityScale(
    state: GameState,
    action: Extract<PendingAction, { type: 'setFacilityScale' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, facilityId, scaleFraction } = action;
    if (scaleFraction < 0 || scaleFraction > 1) {
        safePostMessage({ type: 'facilityScaleSetFailed', requestId, reason: `scaleFraction must be between 0 and 1` });
        return;
    }
    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'facilityScaleSetFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'facilityScaleSetFailed',
            requestId,
            reason: `Agent has no assets on planet '${planetId}'`,
        });
        return;
    }
    const facility =
        assets.productionFacilities.find((f) => f.id === facilityId) ??
        assets.shipConstructionFacilities.find((f) => f.id === facilityId);
    if (!facility) {
        safePostMessage({ type: 'facilityScaleSetFailed', requestId, reason: `Facility '${facilityId}' not found` });
        return;
    }
    facility.scale = facility.maxScale * scaleFraction;
    console.log(
        `[worker] Agent '${agentId}' set '${facilityId}' scale to ${facility.scale} (${scaleFraction * 100}%) on planet '${planetId}'`,
    );
    safePostMessage({ type: 'facilityScaleSet', requestId, agentId, facilityId });
}

export function handleContractFacility(
    state: GameState,
    action: Extract<PendingAction, { type: 'contractFacility' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, facilityId, targetScale } = action;
    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'facilityContractFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'facilityContractFailed',
            requestId,
            reason: `Agent has no assets on planet '${planetId}'`,
        });
        return;
    }
    const facility =
        assets.productionFacilities.find((f) => f.id === facilityId) ??
        assets.shipConstructionFacilities.find((f) => f.id === facilityId);
    if (!facility) {
        safePostMessage({ type: 'facilityContractFailed', requestId, reason: `Facility '${facilityId}' not found` });
        return;
    }
    if (facility.construction !== null) {
        safePostMessage({ type: 'facilityContractFailed', requestId, reason: 'Facility is under construction' });
        return;
    }
    if (targetScale >= facility.maxScale) {
        safePostMessage({
            type: 'facilityContractFailed',
            requestId,
            reason: `Target scale ${targetScale} must be less than current max scale ${facility.maxScale}`,
        });
        return;
    }
    if (targetScale < 1) {
        safePostMessage({
            type: 'facilityContractFailed',
            requestId,
            reason: 'Target scale must be at least 1',
        });
        return;
    }

    const planet = state.planets.get(planetId);
    if (!planet) {
        safePostMessage({ type: 'facilityContractFailed', requestId, reason: `Planet '${planetId}' not found` });
        return;
    }

    processFacilityContraction(planet, facility, agent, targetScale, state);

    console.log(
        `[worker] Agent '${agentId}' contracted '${facilityId}' maxScale from ${facility.maxScale} to ${targetScale} on planet '${planetId}'`,
    );
    safePostMessage({ type: 'facilityContracted', requestId, agentId, facilityId });
}

export function handleFacilityAction(
    state: GameState,
    action: PendingAction,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    switch (action.type) {
        case 'buildFacility':
            handleBuildFacility(state, action, safePostMessage);
            break;
        case 'expandFacility':
            handleExpandFacility(state, action, safePostMessage);
            break;
        case 'contractFacility':
            handleContractFacility(state, action, safePostMessage);
            break;
        case 'setFacilityScale':
            handleSetFacilityScale(state, action, safePostMessage);
            break;
        case 'buildShipConstructionFacility':
            handleBuildShipConstructionFacility(state, action, safePostMessage);
            break;
        case 'expandShipConstructionFacility':
            handleExpandShipConstructionFacility(state, action, safePostMessage);
            break;
        case 'setShipConstructionTarget':
            handleSetShipConstructionTarget(state, action, safePostMessage);
            break;
        case 'cancelConstruction':
            handleCancelConstruction(state, action, safePostMessage);
            break;
        default:
            break;
    }
}

export function handleBuildShipConstructionFacility(
    state: GameState,
    action: Extract<PendingAction, { type: 'buildShipConstructionFacility' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, facilityName, targetScale = 1 } = action;
    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'shipConstructionFacilityBuildFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'shipConstructionFacilityBuildFailed',
            requestId,
            reason: `Agent has no assets on planet '${planetId}'`,
        });
        return;
    }
    const alreadyExists = assets.shipConstructionFacilities.some((f) => f.name === facilityName);
    if (alreadyExists) {
        safePostMessage({
            type: 'shipConstructionFacilityBuildFailed',
            requestId,
            reason: `Ship construction facility '${facilityName}' already exists on planet '${planetId}'`,
        });
        return;
    }
    const facilityId = `${agentId}-ship-construction-${facilityName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    const newFacility = shipConstructionFacilityType(planetId, facilityId);
    newFacility.name = facilityName;
    const { cost, time } = calculateCostsForConstruction('ship_construction', 0, targetScale);
    newFacility.construction = {
        type: 'new',
        progress: 0,
        constructionTargetMaxScale: targetScale,
        totalConstructionServiceRequired: cost,
        maximumConstructionServiceConsumption: cost / time,
        lastTickInvestedConstructionServices: 0,
    };
    newFacility.scale = targetScale;
    newFacility.maxScale = 0;
    assets.shipConstructionFacilities.push(newFacility);
    console.log(
        `[worker] Agent '${agentId}' built ship construction facility '${facilityName}' (scale ${targetScale}) on planet '${planetId}'`,
    );
    safePostMessage({ type: 'shipConstructionFacilityBuilt', requestId, agentId, facilityId });
}

export function handleExpandShipConstructionFacility(
    state: GameState,
    action: Extract<PendingAction, { type: 'expandShipConstructionFacility' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, facilityId, targetScale } = action;
    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'shipConstructionFacilityExpandFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'shipConstructionFacilityExpandFailed',
            requestId,
            reason: `Agent has no assets on planet '${planetId}'`,
        });
        return;
    }
    const facility = assets.shipConstructionFacilities.find((f) => f.id === facilityId);
    if (!facility) {
        safePostMessage({
            type: 'shipConstructionFacilityExpandFailed',
            requestId,
            reason: `Ship construction facility '${facilityId}' not found`,
        });
        return;
    }
    if (facility.construction !== null) {
        safePostMessage({
            type: 'shipConstructionFacilityExpandFailed',
            requestId,
            reason: 'Facility is already under construction',
        });
        return;
    }
    if (targetScale <= facility.maxScale) {
        safePostMessage({
            type: 'shipConstructionFacilityExpandFailed',
            requestId,
            reason: `Target scale ${targetScale} must be greater than current max scale ${facility.maxScale}`,
        });
        return;
    }
    const { cost, time } = calculateCostsForConstruction('ship_construction', facility.maxScale, targetScale);
    facility.construction = {
        type: 'expansion',
        progress: 0,
        constructionTargetMaxScale: targetScale,
        totalConstructionServiceRequired: cost,
        maximumConstructionServiceConsumption: cost / time,
        lastTickInvestedConstructionServices: 0,
    };
    console.log(
        `[worker] Agent '${agentId}' expanding ship construction facility '${facilityId}' to scale ${targetScale} on planet '${planetId}'`,
    );
    safePostMessage({ type: 'shipConstructionFacilityExpanded', requestId, agentId, facilityId });
}

export function handleSetShipConstructionTarget(
    state: GameState,
    action: Extract<PendingAction, { type: 'setShipConstructionTarget' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, facilityId, shipTypeName, shipName } = action;
    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'shipConstructionTargetSetFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'shipConstructionTargetSetFailed',
            requestId,
            reason: `Agent has no assets on planet '${planetId}'`,
        });
        return;
    }
    const facility = assets.shipConstructionFacilities.find((f) => f.id === facilityId);
    if (!facility) {
        safePostMessage({
            type: 'shipConstructionTargetSetFailed',
            requestId,
            reason: `Ship construction facility '${facilityId}' not found`,
        });
        return;
    }
    if (facility.construction !== null) {
        safePostMessage({
            type: 'shipConstructionTargetSetFailed',
            requestId,
            reason: 'Facility is under construction',
        });
        return;
    }
    if (shipTypeName === null) {
        facility.produces = null;
        facility.shipName = '';
        console.log(
            `[worker] Agent '${agentId}' cleared ship construction target at facility '${facilityId}' on planet '${planetId}'`,
        );
    } else {
        const shipType =
            Object.values(shiptypes)
                .flatMap((cat) => Object.values(cat))
                .find((s) => s.name === shipTypeName) ??
            (constructionShipType.name === shipTypeName ? constructionShipType : undefined);
        if (!shipType) {
            safePostMessage({
                type: 'shipConstructionTargetSetFailed',
                requestId,
                reason: `Unknown ship type '${shipTypeName}'`,
            });
            return;
        }
        facility.produces = shipType;
        facility.shipName = shipName;
        facility.progress = 0;
        console.log(
            `[worker] Agent '${agentId}' set ship construction target to '${shipName}' (${shipTypeName}) at facility '${facilityId}' on planet '${planetId}'`,
        );
    }
    safePostMessage({ type: 'shipConstructionTargetSet', requestId, agentId, facilityId });
}

export function handleCancelConstruction(
    state: GameState,
    action: Extract<PendingAction, { type: 'cancelConstruction' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, facilityId } = action;
    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'constructionCancelFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'constructionCancelFailed',
            requestId,
            reason: `Agent has no assets on planet '${planetId}'`,
        });
        return;
    }

    const facilityIndex = assets.productionFacilities.findIndex((f) => f.id === facilityId);
    const shipyardIndex =
        facilityIndex === -1 ? assets.shipConstructionFacilities.findIndex((f) => f.id === facilityId) : -1;

    if (facilityIndex === -1 && shipyardIndex === -1) {
        safePostMessage({ type: 'constructionCancelFailed', requestId, reason: `Facility '${facilityId}' not found` });
        return;
    }

    if (shipyardIndex !== -1) {
        const facility = assets.shipConstructionFacilities[shipyardIndex];
        if (!facility.construction) {
            safePostMessage({
                type: 'constructionCancelFailed',
                requestId,
                reason: 'Facility is not under construction',
            });
            return;
        }
        if (facility.construction.type === 'new') {
            assets.shipConstructionFacilities.splice(shipyardIndex, 1);
            console.log(
                `[worker] Agent '${agentId}' cancelled new construction of shipyard '${facilityId}' on planet '${planetId}' — facility removed`,
            );
        } else {
            facility.construction = null;
            console.log(
                `[worker] Agent '${agentId}' cancelled expansion of shipyard '${facilityId}' on planet '${planetId}'`,
            );
        }
        safePostMessage({ type: 'constructionCancelled', requestId, agentId, facilityId });
        return;
    }

    const facility = assets.productionFacilities[facilityIndex];
    if (!facility.construction) {
        safePostMessage({
            type: 'constructionCancelFailed',
            requestId,
            reason: 'Facility is not under construction',
        });
        return;
    }
    if (facility.construction.type === 'new') {
        assets.productionFacilities.splice(facilityIndex, 1);
        console.log(
            `[worker] Agent '${agentId}' cancelled new construction of '${facilityId}' on planet '${planetId}' — facility removed`,
        );
    } else {
        facility.construction = null;
        console.log(`[worker] Agent '${agentId}' cancelled expansion of '${facilityId}' on planet '${planetId}'`);
    }
    safePostMessage({ type: 'constructionCancelled', requestId, agentId, facilityId });
}
