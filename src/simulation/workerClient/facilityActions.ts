import type { GameState } from '../planet/planet';
import type { OutboundMessage, PendingAction } from './messages';
import { facilityByName } from '../planet/facilities';

/**
 * Handle 'buildFacility' action
 */
export function handleBuildFacility(
    state: GameState,
    action: Extract<PendingAction, { type: 'buildFacility' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, facilityKey } = action;
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
    const facilityId = `${agentId}-${facilityKey.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    const newFacility = catalogEntry.factory(planetId, facilityId);
    newFacility.scale = 1;
    newFacility.maxScale = 1;
    assets.productionFacilities.push(newFacility);
    console.log(`[worker] Agent '${agentId}' built '${facilityKey}' on planet '${planetId}'`);
    safePostMessage({ type: 'facilityBuilt', requestId, agentId, facilityId });
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
        default:
            // This function only handles facility actions
            break;
    }
}
