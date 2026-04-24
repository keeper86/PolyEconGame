import type { GameState } from '../planet/planet';
import type { OutboundMessage, PendingAction } from './messages';
import { facilityByName, shipMaintenanceFacilityType } from '../planet/productionFacilities';
import { calculateCostsForConstruction, getFacilityType, MINIMUM_CONSTRUCTION_TIME_IN_TICKS } from '../planet/facility';
import { shipConstructionFacilityType } from '../planet/specialFacilities';
import { shiptypes, constructionShipType } from '../ships/ships';

/**
 * Handle 'buildFacility' action
 */
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
    const costs = calculateCostsForConstruction(facilityType, 0, targetScale);
    newFacility.construction = {
        progress: 0,
        constructionTargetMaxScale: targetScale,
        totalConstructionServiceRequired: costs,
        maximumConstructionServiceConsumption: costs / MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
        lastTickInvestedConstructionServices: 0,
    };
    newFacility.scale = targetScale;
    newFacility.maxScale = 0;
    assets.productionFacilities.push(newFacility);
    console.log(`[worker] Agent '${agentId}' built '${facilityKey}' (scale ${targetScale}) on planet '${planetId}'`);
    safePostMessage({ type: 'facilityBuilt', requestId, agentId, facilityId });
}

/**
 * Handle 'expandFacility' action — increase scale of an existing active facility
 */
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
    const costs = calculateCostsForConstruction(facilityType, facility.maxScale, targetScale);
    facility.construction = {
        progress: 0,
        constructionTargetMaxScale: targetScale,
        totalConstructionServiceRequired: costs,
        maximumConstructionServiceConsumption: costs / MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
        lastTickInvestedConstructionServices: 0,
    };
    console.log(
        `[worker] Agent '${agentId}' expanding '${facilityId}' to scale ${targetScale} on planet '${planetId}'`,
    );
    safePostMessage({ type: 'facilityExpanded', requestId, agentId, facilityId });
}

/**
 * Handle 'setFacilityScale' action — set operating scale of an active facility
 */
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
    const facility = assets.productionFacilities.find((f) => f.id === facilityId);
    if (!facility) {
        safePostMessage({ type: 'facilityScaleSetFailed', requestId, reason: `Facility '${facilityId}' not found` });
        return;
    }
    if (facility.construction !== null) {
        safePostMessage({
            type: 'facilityScaleSetFailed',
            requestId,
            reason: 'Facility is under construction',
        });
        return;
    }
    facility.scale = facility.maxScale * scaleFraction;
    console.log(
        `[worker] Agent '${agentId}' set '${facilityId}' scale to ${facility.scale} (${scaleFraction * 100}%) on planet '${planetId}'`,
    );
    safePostMessage({ type: 'facilityScaleSet', requestId, agentId, facilityId });
}

/**
 * Dispatch facility-related actions to the appropriate handler
 */
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
        case 'buildShipMaintenanceFacility':
            handleBuildShipMaintenanceFacility(state, action, safePostMessage);
            break;
        case 'expandShipMaintenanceFacility':
            handleExpandShipMaintenanceFacility(state, action, safePostMessage);
            break;
        default:
            // This function only handles facility actions
            break;
    }
}

/**
 * Handle 'buildShipConstructionFacility' action
 */
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
    const costs = calculateCostsForConstruction('ship_construction', 0, targetScale);
    newFacility.construction = {
        progress: 0,
        constructionTargetMaxScale: targetScale,
        totalConstructionServiceRequired: costs,
        maximumConstructionServiceConsumption: costs / MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
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

/**
 * Handle 'expandShipConstructionFacility' action
 */
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
    const costs = calculateCostsForConstruction('ship_construction', facility.maxScale, targetScale);
    facility.construction = {
        progress: 0,
        constructionTargetMaxScale: targetScale,
        totalConstructionServiceRequired: costs,
        maximumConstructionServiceConsumption: costs / MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
        lastTickInvestedConstructionServices: 0,
    };
    console.log(
        `[worker] Agent '${agentId}' expanding ship construction facility '${facilityId}' to scale ${targetScale} on planet '${planetId}'`,
    );
    safePostMessage({ type: 'shipConstructionFacilityExpanded', requestId, agentId, facilityId });
}

/**
 * Handle 'setShipConstructionTarget' action — set or clear the ship being built
 */
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

/**
 * Handle 'buildShipMaintenanceFacility' action
 */
export function handleBuildShipMaintenanceFacility(
    state: GameState,
    action: Extract<PendingAction, { type: 'buildShipMaintenanceFacility' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, facilityName, targetScale = 1 } = action;
    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'shipMaintenanceFacilityBuildFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'shipMaintenanceFacilityBuildFailed',
            requestId,
            reason: `Agent has no assets on planet '${planetId}'`,
        });
        return;
    }
    const alreadyExists = assets.shipMaintenanceFacilities.some((f) => f.name === facilityName);
    if (alreadyExists) {
        safePostMessage({
            type: 'shipMaintenanceFacilityBuildFailed',
            requestId,
            reason: `Ship maintenance facility '${facilityName}' already exists on planet '${planetId}'`,
        });
        return;
    }
    const facilityId = `${agentId}-ship-maintenance-${facilityName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    const newFacility = shipMaintenanceFacilityType(planetId, facilityId);
    newFacility.name = facilityName;
    const costs = calculateCostsForConstruction(getFacilityType(newFacility), 0, targetScale);
    newFacility.construction = {
        progress: 0,
        constructionTargetMaxScale: targetScale,
        totalConstructionServiceRequired: costs,
        maximumConstructionServiceConsumption: costs / MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
        lastTickInvestedConstructionServices: 0,
    };
    newFacility.scale = targetScale;
    newFacility.maxScale = 0;
    assets.shipMaintenanceFacilities.push(newFacility);
    console.log(
        `[worker] Agent '${agentId}' built ship maintenance facility '${facilityName}' (scale ${targetScale}) on planet '${planetId}'`,
    );
    safePostMessage({ type: 'shipMaintenanceFacilityBuilt', requestId, agentId, facilityId });
}

/**
 * Handle 'expandShipMaintenanceFacility' action
 */
export function handleExpandShipMaintenanceFacility(
    state: GameState,
    action: Extract<PendingAction, { type: 'expandShipMaintenanceFacility' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, facilityId, targetScale } = action;
    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'shipMaintenanceFacilityExpandFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'shipMaintenanceFacilityExpandFailed',
            requestId,
            reason: `Agent has no assets on planet '${planetId}'`,
        });
        return;
    }
    const facility = assets.shipMaintenanceFacilities.find((f) => f.id === facilityId);
    if (!facility) {
        safePostMessage({
            type: 'shipMaintenanceFacilityExpandFailed',
            requestId,
            reason: `Ship maintenance facility '${facilityId}' not found`,
        });
        return;
    }
    if (facility.construction !== null) {
        safePostMessage({
            type: 'shipMaintenanceFacilityExpandFailed',
            requestId,
            reason: 'Facility is already under construction',
        });
        return;
    }
    if (targetScale <= facility.maxScale) {
        safePostMessage({
            type: 'shipMaintenanceFacilityExpandFailed',
            requestId,
            reason: `Target scale ${targetScale} must be greater than current max scale ${facility.maxScale}`,
        });
        return;
    }
    const costs = calculateCostsForConstruction(getFacilityType(facility), facility.maxScale, targetScale);
    facility.construction = {
        progress: 0,
        constructionTargetMaxScale: targetScale,
        totalConstructionServiceRequired: costs,
        maximumConstructionServiceConsumption: costs / MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
        lastTickInvestedConstructionServices: 0,
    };
    console.log(
        `[worker] Agent '${agentId}' expanding ship maintenance facility '${facilityId}' to scale ${targetScale} on planet '${planetId}'`,
    );
    safePostMessage({ type: 'shipMaintenanceFacilityExpanded', requestId, agentId, facilityId });
}
