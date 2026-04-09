import type { GameState } from '../planet/planet';
import type { OutboundMessage, PendingAction } from './messages';
import { arableLandResourceType, waterSourceResourceType } from '../planet/landBoundResources';
import type { ResourceClaim, ResourceQuantity } from '../planet/claims';
import { collapseUntenantedClaims } from '../planet/claims';
import { makeAgriculturalProduction, makeStorage, makeWaterExtraction } from '../utils/initialWorld';
import { LAND_CLAIM_COST_PER_UNIT, TICKS_PER_MONTH } from '../constants';

/**
 * Calculates and charges the upfront cost for acquiring `quantity` units of a resource.
 * For renewables: 1 month of per-tick cost. For non-renewables: the flat cost.
 * Returns the upfront amount charged, or null if the agent cannot afford it.
 */
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

/**
 * Handle 'claimResources' action
 *
 * TODO: 1) we need to handle all claim-types
 *     2) this should happen after any actions that modify the planet's resources, such that we always have a consistent view on the available untenanted resources
 */
export function handleClaimResources(
    state: GameState,
    action: Extract<PendingAction, { type: 'claimResources' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, arableLandQuantity, waterSourceQuantity } = action;
    const agent = state.agents.get(agentId);
    const planet = state.planets.get(planetId);
    if (!agent || !planet) {
        safePostMessage({
            type: 'resourcesClaimFailed',
            requestId,
            reason: 'Agent or planet not found',
        });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'resourcesClaimFailed',
            requestId,
            reason: `Agent has no assets on planet '${planetId}'`,
        });
        return;
    }

    // Collapse all untenanted arable land into one pool
    const arablePool = collapseUntenantedClaims(planet, arableLandResourceType.name, `${planetId}-arable-unclaimed`);
    if (!arablePool || arablePool.quantity < arableLandQuantity) {
        safePostMessage({
            type: 'resourcesClaimFailed',
            requestId,
            reason: `Not enough untenanted arable land — requested ${arableLandQuantity}, available ${arablePool?.quantity ?? 0}`,
        });
        return;
    }

    // Collapse all untenanted water sources into one pool
    const waterPool = collapseUntenantedClaims(planet, waterSourceResourceType.name, `${planetId}-water-unclaimed`);
    if (!waterPool || waterPool.quantity < waterSourceQuantity) {
        safePostMessage({
            type: 'resourcesClaimFailed',
            requestId,
            reason: `Not enough untenanted water sources — requested ${waterSourceQuantity}, available ${waterPool?.quantity ?? 0}`,
        });
        return;
    }

    // Create new claim IDs for this agent
    const arableClaimId = `${planetId}-arable-${agentId}`;
    const waterClaimId = `${planetId}-water-${agentId}`;

    // Split arable land off the pool
    const arableRatio = arableLandQuantity / arablePool.maximumCapacity;
    const newArableClaim = {
        id: arableClaimId,
        type: arableLandResourceType,
        quantity: arableLandQuantity,
        regenerationRate: arablePool.regenerationRate * arableRatio,
        maximumCapacity: arableLandQuantity,
        tenantAgentId: agentId,
        tenantCostInCoins: 0,
        costPerTick: Math.floor(arableLandQuantity * 0.01),
        claimStatus: 'active' as const,
        noticePeriodEndsAtTick: null,
        pausedSinceTick: null,
    };
    arablePool.quantity -= arableLandQuantity;
    arablePool.regenerationRate -= newArableClaim.regenerationRate;
    arablePool.maximumCapacity -= arableLandQuantity;
    planet.resources[arableLandResourceType.name].push(newArableClaim);

    // Split water source off the pool
    const waterRatio = waterSourceQuantity / waterPool.maximumCapacity;
    const newWaterClaim = {
        id: waterClaimId,
        type: waterSourceResourceType,
        quantity: waterSourceQuantity,
        regenerationRate: waterPool.regenerationRate * waterRatio,
        maximumCapacity: waterSourceQuantity,
        tenantAgentId: agentId,
        tenantCostInCoins: 0,
        costPerTick: Math.floor(waterSourceQuantity * 0.005),
        claimStatus: 'active' as const,
        noticePeriodEndsAtTick: null,
        pausedSinceTick: null,
    };
    waterPool.quantity -= waterSourceQuantity;
    waterPool.regenerationRate -= newWaterClaim.regenerationRate;
    waterPool.maximumCapacity -= waterSourceQuantity;
    planet.resources[waterSourceResourceType.name].push(newWaterClaim);

    // Build production facilities if the agent doesn't already have them
    const hasWaterFacility = assets.productionFacilities.some((f) =>
        f.needs.some((n) => n.resource.name === waterSourceResourceType.name),
    );
    const hasAgriFacility = assets.productionFacilities.some((f) =>
        f.needs.some((n) => n.resource.name === arableLandResourceType.name),
    );

    const waterScale = waterSourceQuantity / 1000;
    const agriScale = arableLandQuantity / 1000;

    if (!hasWaterFacility) {
        const waterFacility = makeWaterExtraction(planetId, agentId, waterScale);
        assets.productionFacilities.push(waterFacility);
    }
    if (!hasAgriFacility) {
        const agriFacility = makeAgriculturalProduction(planetId, agentId, agriScale);
        assets.productionFacilities.push(agriFacility);
    }

    // Build storage if the agent doesn't have one yet
    if (!assets.storageFacility) {
        assets.storageFacility = makeStorage({
            planetId,
            id: `${agentId}-storage`,
            name: `${agentId} Storage`,
        });
    }

    console.log(
        `[worker] Agent '${agentId}' claimed ${arableLandQuantity} arable land and ` +
            `${waterSourceQuantity} water source on planet '${planetId}'`,
    );
    safePostMessage({ type: 'resourcesClaimed', requestId, agentId, arableClaimId, waterClaimId });
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
        type: pool.type,
        quantity,
        regenerationRate: pool.regenerationRate * ratio,
        maximumCapacity: quantity,
        tenantAgentId: agentId,
        tenantCostInCoins: isRenewable ? 0 : costAmount,
        costPerTick: isRenewable ? costAmount : 0,
        claimStatus: 'active' as const,
        noticePeriodEndsAtTick: null,
        pausedSinceTick: null,
    };
    pool.quantity -= quantity;
    pool.regenerationRate -= newClaim.regenerationRate;
    pool.maximumCapacity -= quantity;
    planet.resources[resourceName].push(newClaim);
    console.log(`[worker] Agent '${agentId}' leased ${quantity} of '${resourceName}' on planet '${planetId}'`);
    safePostMessage({ type: 'claimLeased', requestId, agentId, claimId });
}

export function handleExpandClaim(
    state: GameState,
    action: Extract<PendingAction, { type: 'expandClaim' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, claimId, additionalQuantity } = action;
    const agent = state.agents.get(agentId);
    const planet = state.planets.get(planetId);
    if (!agent || !planet) {
        safePostMessage({ type: 'claimExpandFailed', requestId, reason: 'Agent or planet not found' });
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
        safePostMessage({ type: 'claimExpandFailed', requestId, reason: `Claim '${claimId}' not found for agent` });
        return;
    }
    const pool = collapseUntenantedClaims(planet, resourceName, `${planetId}-${resourceName}-unclaimed`);
    if (!pool || pool.maximumCapacity < additionalQuantity) {
        safePostMessage({
            type: 'claimExpandFailed',
            requestId,
            reason: `Not enough untenanted ${resourceName} — requested ${additionalQuantity}, available ${pool?.maximumCapacity ?? 0}`,
        });
        return;
    }
    const ratio = additionalQuantity / pool.maximumCapacity;
    const isRenewable = existingClaim.regenerationRate > 0;
    const charged = chargeUpfrontCost(state, agentId, planetId, resourceName, additionalQuantity, isRenewable);
    if (charged === null) {
        const costAmount = Math.floor(additionalQuantity * (LAND_CLAIM_COST_PER_UNIT[resourceName] ?? 1));
        const upfrontCost = isRenewable ? costAmount * TICKS_PER_MONTH : costAmount;
        safePostMessage({
            type: 'claimExpandFailed',
            requestId,
            reason: `Insufficient deposits — required ${upfrontCost}, available ${agent.assets[planetId]?.deposits ?? 0}`,
        });
        return;
    }
    existingClaim.quantity += additionalQuantity;
    existingClaim.maximumCapacity += additionalQuantity;
    existingClaim.regenerationRate += pool.regenerationRate * ratio;
    if (existingClaim.regenerationRate > 0) {
        existingClaim.costPerTick = Math.floor(
            existingClaim.maximumCapacity * (LAND_CLAIM_COST_PER_UNIT[resourceName] ?? 1),
        );
    } else {
        existingClaim.tenantCostInCoins = Math.floor(
            existingClaim.maximumCapacity * (LAND_CLAIM_COST_PER_UNIT[resourceName] ?? 1),
        );
    }
    pool.quantity -= additionalQuantity;
    pool.regenerationRate -= pool.regenerationRate * ratio;
    pool.maximumCapacity -= additionalQuantity;
    console.log(
        `[worker] Agent '${agentId}' expanded claim '${claimId}' by ${additionalQuantity} on planet '${planetId}'`,
    );
    safePostMessage({ type: 'claimExpanded', requestId, agentId, claimId });
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
        case 'claimResources':
            handleClaimResources(state, action, safePostMessage);
            break;
        case 'leaseClaim':
            handleLeaseClaim(state, action, safePostMessage);
            break;
        case 'expandClaim':
            handleExpandClaim(state, action, safePostMessage);
            break;
        case 'quitClaim':
            handleQuitClaim(state, action, safePostMessage);
            break;
        default:
            break;
    }
}
