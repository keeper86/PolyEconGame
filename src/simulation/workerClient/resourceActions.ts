import type { GameState } from '../planet/planet';
import type { OutboundMessage, PendingAction } from './messages';
import { arableLandResourceType, waterSourceResourceType } from '../planet/landBoundResources';
import type { ResourceClaim, ResourceQuantity } from '../planet/claims';
import { collapseUntenantedClaims } from '../planet/claims';
import { makeAgriculturalProduction, makeStorage, makeWaterExtraction } from '../utils/initialWorld';
import { LAND_CLAIM_COST_PER_UNIT } from '../constants';

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
        tenantCostInCoins: Math.floor(arableLandQuantity * 0.01),
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
        tenantCostInCoins: Math.floor(waterSourceQuantity * 0.005),
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
    const newClaim = {
        id: claimId,
        type: pool.type,
        quantity,
        regenerationRate: pool.regenerationRate * ratio,
        maximumCapacity: quantity,
        tenantAgentId: agentId,
        tenantCostInCoins: Math.floor(quantity * (LAND_CLAIM_COST_PER_UNIT[resourceName] ?? 1)),
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
    existingClaim.quantity += additionalQuantity;
    existingClaim.maximumCapacity += additionalQuantity;
    existingClaim.regenerationRate += pool.regenerationRate * ratio;
    existingClaim.tenantCostInCoins = Math.floor(
        existingClaim.maximumCapacity * (LAND_CLAIM_COST_PER_UNIT[resourceName] ?? 1),
    );
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
    existingClaim.tenantAgentId = null;
    existingClaim.tenantCostInCoins = 0;
    collapseUntenantedClaims(planet, resourceName, `${planetId}-${resourceName}-unclaimed`);
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
