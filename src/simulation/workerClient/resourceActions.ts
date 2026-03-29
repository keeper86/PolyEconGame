import type { GameState } from '../planet/planet';
import type { OutboundMessage, PendingAction } from './messages';
import { arableLandResourceType, waterSourceResourceType } from '../planet/landBoundResources';
import { collapseUntenantedClaims } from '../utils/entities';
import { makeAgriculturalProduction, makeStorage, makeWaterExtraction } from '../utils/initialWorld';

/**
 * Handle 'claimResources' action
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
    const arablePool = collapseUntenantedClaims(
        planet,
        arableLandResourceType.name,
        `${planetId}-arable-unclaimed`,
    );
    if (!arablePool || arablePool.quantity < arableLandQuantity) {
        safePostMessage({
            type: 'resourcesClaimFailed',
            requestId,
            reason: `Not enough untenanted arable land — requested ${arableLandQuantity}, available ${arablePool?.quantity ?? 0}`,
        });
        return;
    }

    // Collapse all untenanted water sources into one pool
    const waterPool = collapseUntenantedClaims(
        planet,
        waterSourceResourceType.name,
        `${planetId}-water-unclaimed`,
    );
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
        claimAgentId: arablePool.claimAgentId,
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
        claimAgentId: waterPool.claimAgentId,
        tenantAgentId: agentId,
        tenantCostInCoins: Math.floor(waterSourceQuantity * 0.005),
    };
    waterPool.quantity -= waterSourceQuantity;
    waterPool.regenerationRate -= newWaterClaim.regenerationRate;
    waterPool.maximumCapacity -= waterSourceQuantity;
    planet.resources[waterSourceResourceType.name].push(newWaterClaim);

    // Register the tenancy on the agent's assets
    assets.resourceTenancies.push(arableClaimId, waterClaimId);

    // Add the government claim owner's claim list if it exists
    const govAgent = arablePool.claimAgentId ? state.agents.get(arablePool.claimAgentId) : null;
    if (govAgent) {
        const govAssets = govAgent.assets[planetId];
        if (govAssets) {
            govAssets.resourceClaims.push(arableClaimId, waterClaimId);
        }
    }

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
        default:
            // This function only handles resource actions
            break;
    }
}
