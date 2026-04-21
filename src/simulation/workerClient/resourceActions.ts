import { LAND_CLAIM_COST_PER_UNIT, TICKS_PER_MONTH } from '../constants';
import type { ResourceClaim, ResourceQuantity } from '../planet/claims';
import { collapseUntenantedClaims } from '../planet/claims';
import type { GameState } from '../planet/planet';
import type { OutboundMessage, PendingAction } from './messages';

function chargeUpfrontCost(
    state: GameState,
    agentId: string,
    planetId: string,
    resourceName: string,
    quantity: number,
    isRenewable: boolean,
): number | null {
    const costAmount = Math.floor(quantity * (LAND_CLAIM_COST_PER_UNIT[resourceName] ?? 1));
    const upfrontCost = isRenewable ? costAmount * TICKS_PER_MONTH : costAmount;
    const agentAssets = state.agents.get(agentId)?.assets[planetId];
    const planet = state.planets.get(planetId);
    if (!agentAssets || !planet) {
        return null;
    }
    if (agentAssets.deposits < upfrontCost) {
        return null;
    }
    agentAssets.deposits -= upfrontCost;
    const govAssets = state.agents.get(planet.governmentId)?.assets[planetId];
    if (govAssets) {
        govAssets.deposits += upfrontCost;
    }
    return upfrontCost;
}

export function handleLeaseClaim(
    state: GameState,
    action: Extract<PendingAction, { type: 'leaseClaim' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, resourceName, quantity } = action;
    const agent = state.agents.get(agentId);
    const planet = state.planets.get(planetId);
    if (!agent || !planet) {
        safePostMessage({ type: 'claimLeaseFailed', requestId, reason: 'Agent or planet not found' });
        return;
    }
    if (!agent.assets[planetId]) {
        safePostMessage({ type: 'claimLeaseFailed', requestId, reason: `Agent has no assets on planet '${planetId}'` });
        return;
    }
    const pool = collapseUntenantedClaims(planet, resourceName, `${planetId}-${resourceName}-unclaimed`);
    if (!pool || pool.maximumCapacity < quantity) {
        safePostMessage({
            type: 'claimLeaseFailed',
            requestId,
            reason: `Not enough untenanted ${resourceName} — requested ${quantity}, available ${pool?.maximumCapacity ?? 0}`,
        });
        return;
    }
    const claimId = `${planetId}-${resourceName}-${agentId}`;

    // If the agent already has an active claim for this resource, expand it instead of creating a duplicate.
    const existingClaim = planet.resources[resourceName].find((e) => e.id === claimId && e.tenantAgentId === agentId);
    if (existingClaim) {
        const ratio = quantity / pool.maximumCapacity;
        const isRenewable = existingClaim.regenerationRate > 0;
        const charged = chargeUpfrontCost(state, agentId, planetId, resourceName, quantity, isRenewable);
        if (charged === null) {
            const costAmount = Math.floor(quantity * (LAND_CLAIM_COST_PER_UNIT[resourceName] ?? 1));
            const upfrontCost = isRenewable ? costAmount * TICKS_PER_MONTH : costAmount;
            safePostMessage({
                type: 'claimLeaseFailed',
                requestId,
                reason: `Insufficient deposits — required ${upfrontCost}, available ${agent.assets[planetId]!.deposits}`,
            });
            return;
        }
        existingClaim.quantity += quantity;
        existingClaim.maximumCapacity += quantity;
        existingClaim.regenerationRate += pool.regenerationRate * ratio;
        if (isRenewable) {
            existingClaim.costPerTick = Math.floor(
                existingClaim.maximumCapacity * (LAND_CLAIM_COST_PER_UNIT[resourceName] ?? 1),
            );
        } else {
            existingClaim.tenantCostInCoins = Math.floor(
                existingClaim.maximumCapacity * (LAND_CLAIM_COST_PER_UNIT[resourceName] ?? 1),
            );
        }
        pool.quantity -= quantity;
        pool.regenerationRate -= pool.regenerationRate * ratio;
        pool.maximumCapacity -= quantity;
        agent.assets[planetId]!.monthAcc.claimPayments += charged;
        console.log(`[worker] Agent '${agentId}' expanded claim '${claimId}' by ${quantity} on planet '${planetId}'`);
        safePostMessage({ type: 'claimLeased', requestId, agentId, claimId });
        return;
    }

    const ratio = quantity / pool.maximumCapacity;
    const isRenewable = pool.regenerationRate > 0;
    const costAmount = Math.floor(quantity * (LAND_CLAIM_COST_PER_UNIT[resourceName] ?? 1));
    const charged = chargeUpfrontCost(state, agentId, planetId, resourceName, quantity, isRenewable);
    if (charged === null) {
        const upfrontCost = isRenewable ? costAmount * TICKS_PER_MONTH : costAmount;
        safePostMessage({
            type: 'claimLeaseFailed',
            requestId,
            reason: `Insufficient deposits — required ${upfrontCost}, available ${agent.assets[planetId]!.deposits}`,
        });
        return;
    }
    const newClaim = {
        id: claimId,
        resource: pool.resource,
        quantity,
        regenerationRate: pool.regenerationRate * ratio,
        maximumCapacity: quantity,
        tenantAgentId: agentId,
        tenantCostInCoins: isRenewable ? 0 : costAmount,
        costPerTick: isRenewable ? costAmount : 0,
        claimStatus: 'active' as const,
        noticePeriodEndsAtTick: null,
        pausedTicksThisYear: 0,
    };
    pool.quantity -= quantity;
    pool.regenerationRate -= newClaim.regenerationRate;
    pool.maximumCapacity -= quantity;
    planet.resources[resourceName].push(newClaim);
    agent.assets[planetId]!.monthAcc.claimPayments += charged;
    console.log(`[worker] Agent '${agentId}' leased ${quantity} of '${resourceName}' on planet '${planetId}'`);
    safePostMessage({ type: 'claimLeased', requestId, agentId, claimId });
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
    let existingClaim: (ResourceClaim & ResourceQuantity) | null = null;
    for (const [rName, entries] of Object.entries(planet.resources)) {
        const found = entries.find((e) => e.id === claimId && e.tenantAgentId === agentId);
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
    if (existingClaim.regenerationRate > 0) {
        existingClaim.noticePeriodEndsAtTick = state.tick + TICKS_PER_MONTH;
    } else {
        existingClaim.tenantAgentId = null;
        existingClaim.tenantCostInCoins = 0;
        existingClaim.costPerTick = 0;
        existingClaim.claimStatus = 'active';
        existingClaim.noticePeriodEndsAtTick = null;
        collapseUntenantedClaims(planet, resourceName, `${planetId}-${resourceName}-unclaimed`);
    }
    console.log(`[worker] Agent '${agentId}' quit claim '${claimId}' on planet '${planetId}'`);
    safePostMessage({ type: 'claimQuit', requestId, agentId, claimId });
}

/**
 * Dispatch resource-related actions to the appropriate handler
 */
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
