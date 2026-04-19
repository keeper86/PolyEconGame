import type { GameState } from '../planet/planet';
import type { OutboundMessage, PendingAction } from './messages';
import { facilityByName } from '../planet/productionFacilities';
import { calculateCostsForConstruction, getFacilityType, MINIMUM_CONSTRUCTION_TIME_IN_TICKS } from '../planet/facility';
import { shipyardFacilityType } from '../planet/specialFacilities';
import { shiptypes } from '../ships/ships';

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
        case 'buildShipyard':
            handleBuildShipyard(state, action, safePostMessage);
            break;
        case 'expandShipyard':
            handleExpandShipyard(state, action, safePostMessage);
            break;
        case 'setShipyardMode':
            handleSetShipyardMode(state, action, safePostMessage);
            break;
        default:
            // This function only handles facility actions
            break;
    }
}

/**
 * Handle 'buildShipyard' action — build a new shipyard facility on a planet
 */
export function handleBuildShipyard(
    state: GameState,
    action: Extract<PendingAction, { type: 'buildShipyard' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, shipyardName, targetScale = 1 } = action;
    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'shipyardBuildFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'shipyardBuildFailed',
            requestId,
            reason: `Agent has no assets on planet '${planetId}'`,
        });
        return;
    }
    const alreadyExists = assets.shipyardFacilities.some((f) => f.name === shipyardName);
    if (alreadyExists) {
        safePostMessage({
            type: 'shipyardBuildFailed',
            requestId,
            reason: `Shipyard '${shipyardName}' already exists on planet '${planetId}'`,
        });
        return;
    }
    const facilityId = `${agentId}-shipyard-${shipyardName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    const newFacility = shipyardFacilityType(planetId, facilityId);
    newFacility.name = shipyardName;
    const costs = calculateCostsForConstruction('ships', 0, targetScale);
    newFacility.construction = {
        progress: 0,
        constructionTargetMaxScale: targetScale,
        totalConstructionServiceRequired: costs,
        maximumConstructionServiceConsumption: costs / MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
        lastTickInvestedConstructionServices: 0,
    };
    newFacility.scale = targetScale;
    newFacility.maxScale = 0;
    assets.shipyardFacilities.push(newFacility);
    console.log(
        `[worker] Agent '${agentId}' built shipyard '${shipyardName}' (scale ${targetScale}) on planet '${planetId}'`,
    );
    safePostMessage({ type: 'shipyardBuilt', requestId, agentId, facilityId });
}

/**
 * Handle 'expandShipyard' action — increase scale of an existing active shipyard
 */
export function handleExpandShipyard(
    state: GameState,
    action: Extract<PendingAction, { type: 'expandShipyard' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, facilityId, targetScale } = action;
    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'shipyardExpandFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'shipyardExpandFailed',
            requestId,
            reason: `Agent has no assets on planet '${planetId}'`,
        });
        return;
    }
    const facility = assets.shipyardFacilities.find((f) => f.id === facilityId);
    if (!facility) {
        safePostMessage({ type: 'shipyardExpandFailed', requestId, reason: `Shipyard '${facilityId}' not found` });
        return;
    }
    if (facility.construction !== null) {
        safePostMessage({ type: 'shipyardExpandFailed', requestId, reason: 'Shipyard is already under construction' });
        return;
    }
    if (targetScale <= facility.maxScale) {
        safePostMessage({
            type: 'shipyardExpandFailed',
            requestId,
            reason: `Target scale ${targetScale} must be greater than current max scale ${facility.maxScale}`,
        });
        return;
    }
    const costs = calculateCostsForConstruction('ships', facility.maxScale, targetScale);
    facility.construction = {
        progress: 0,
        constructionTargetMaxScale: targetScale,
        totalConstructionServiceRequired: costs,
        maximumConstructionServiceConsumption: costs / MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
        lastTickInvestedConstructionServices: 0,
    };
    console.log(
        `[worker] Agent '${agentId}' expanding shipyard '${facilityId}' to scale ${targetScale} on planet '${planetId}'`,
    );
    safePostMessage({ type: 'shipyardExpanded', requestId, agentId, facilityId });
}

/**
 * Handle 'setShipyardMode' action — set shipyard to 'building', 'maintenance', or 'idle'
 */
export function handleSetShipyardMode(
    state: GameState,
    action: Extract<PendingAction, { type: 'setShipyardMode' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, facilityId } = action;
    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'shipyardModeSetFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'shipyardModeSetFailed',
            requestId,
            reason: `Agent has no assets on planet '${planetId}'`,
        });
        return;
    }
    const facility = assets.shipyardFacilities.find((f) => f.id === facilityId);
    if (!facility) {
        safePostMessage({ type: 'shipyardModeSetFailed', requestId, reason: `Shipyard '${facilityId}' not found` });
        return;
    }
    if (facility.construction !== null) {
        safePostMessage({ type: 'shipyardModeSetFailed', requestId, reason: 'Shipyard is under construction' });
        return;
    }
    if (facility.mode === 'maintenance' && action.mode !== 'idle') {
        safePostMessage({
            type: 'shipyardModeSetFailed',
            requestId,
            reason: 'Shipyard is already in maintenance mode; set to idle first',
        });
        return;
    }

    if (action.mode === 'idle') {
        (facility as { mode: string }).mode = 'idle';
        console.log(`[worker] Agent '${agentId}' set shipyard '${facilityId}' to idle on planet '${planetId}'`);
        safePostMessage({ type: 'shipyardModeSet', requestId, agentId, facilityId });
        return;
    }

    // Resolve ship type (used by both 'building' and 'maintenance' modes)
    const allShipTypes = Object.values(shiptypes).flatMap((category) => Object.values(category));
    const shipType = allShipTypes.find((t) => t.name === action.shipTypeName);
    if (!shipType) {
        safePostMessage({
            type: 'shipyardModeSetFailed',
            requestId,
            reason: `Unknown ship type '${action.shipTypeName}'`,
        });
        return;
    }

    if (action.mode === 'maintenance') {
        (facility as { mode: string; produces: typeof shipType }).mode = 'maintenance';
        (facility as { mode: string; produces: typeof shipType }).produces = shipType;
        console.log(
            `[worker] Agent '${agentId}' set shipyard '${facilityId}' to maintenance mode (${action.shipTypeName}) on planet '${planetId}'`,
        );
        safePostMessage({ type: 'shipyardModeSet', requestId, agentId, facilityId });
        return;
    }

    // mode === 'building'
    (facility as { mode: string; shipName: string; produces: typeof shipType; progress: number }).mode = 'building';
    (facility as { mode: string; shipName: string; produces: typeof shipType; progress: number }).shipName =
        action.shipName;
    (facility as { mode: string; shipName: string; produces: typeof shipType; progress: number }).produces = shipType;
    (facility as { mode: string; shipName: string; produces: typeof shipType; progress: number }).progress = 0;
    console.log(
        `[worker] Agent '${agentId}' started building '${action.shipName}' (${action.shipTypeName}) at shipyard '${facilityId}' on planet '${planetId}'`,
    );
    safePostMessage({ type: 'shipyardModeSet', requestId, agentId, facilityId });
}
