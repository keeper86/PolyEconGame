import { TICKS_PER_MONTH } from '../constants';
import type { ResourceClaim } from '../planet/claims';
import { leaseClaim, mergeClaimBackIntoPool } from '../planet/claims';
import type { GameState } from '../planet/planet';
import type { OutboundMessage, PendingAction } from './messages';

export function handleLeaseClaim(
    state: GameState,
    action: Extract<PendingAction, { type: 'leaseClaim' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, resourceName, quantity } = action;

    if (quantity <= 0) {
        safePostMessage({ type: 'claimLeaseFailed', requestId, reason: 'Quantity must be positive' });
        return;
    }

    const result = leaseClaim(state, agentId, planetId, resourceName, quantity);
    if (!result.ok) {
        safePostMessage({ type: 'claimLeaseFailed', requestId, reason: result.reason });
        return;
    }

    console.log(`[worker] Agent '${agentId}' leased ${quantity} of '${resourceName}' on planet '${planetId}'`);
    safePostMessage({ type: 'claimLeased', requestId, agentId, claimId: result.claimId });
}

export function handleQuitClaim(
    state: GameState,
    action: Extract<PendingAction, { type: 'quitClaim' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, claimId } = action;
    const agent = state.agents.get(agentId);
    const planet = state.planets.get(planetId);
    if (!agent || !planet) {
        safePostMessage({ type: 'claimQuitFailed', requestId, reason: 'Agent or planet not found' });
        return;
    }
    let resourceName: string | null = null;
    let existingClaim: ResourceClaim | null = null;
    for (const [rName, entry] of Object.entries(planet.resources)) {
        const found = entry.claims.find((e) => e.id === claimId && e.tenantAgentId === agentId);
        if (found) {
            resourceName = rName;
            existingClaim = found;
            break;
        }
    }
    if (!existingClaim || !resourceName) {
        safePostMessage({ type: 'claimQuitFailed', requestId, reason: `Claim '${claimId}' not found for agent` });
        return;
    }
    const entry = planet.resources[resourceName]!;
    if (existingClaim.regenerationRate > 0) {
        existingClaim.noticePeriodEndsAtTick = state.tick + TICKS_PER_MONTH;
    } else {
        mergeClaimBackIntoPool(entry.pool, existingClaim);
        entry.claims = entry.claims.filter((c) => c.id !== claimId);
    }
    console.log(`[worker] Agent '${agentId}' quit claim '${claimId}' on planet '${planetId}'`);
    safePostMessage({ type: 'claimQuit', requestId, agentId, claimId });
}

export function handleResourceAction(
    state: GameState,
    action: PendingAction,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    switch (action.type) {
        case 'leaseClaim':
            handleLeaseClaim(state, action, safePostMessage);
            break;
        case 'quitClaim':
            handleQuitClaim(state, action, safePostMessage);
            break;
        default:
            break;
    }
}
