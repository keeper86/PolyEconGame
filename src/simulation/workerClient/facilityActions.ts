import type { GameState } from '../planet/planet';
import type { OutboundMessage, PendingAction } from './messages';
import { facilityByName } from '../planet/productionFacilities';
import { calculateCostsForConstruction, getFacilityType, MINIMUM_CONSTRUCTION_TIME_IN_TICKS } from '../planet/facility';

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
        default:
            // This function only handles facility actions
            break;
    }
}
