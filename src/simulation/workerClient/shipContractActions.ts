import type { GameState } from '../planet/planet';
import type { ShipBuyingOffer, ShipMaintenanceOffer, TransportContract } from '../ships/ships';
import { shiptypes } from '../ships/ships';
import type { OutboundMessage, PendingAction } from './messages';

function generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function handlePostTransportContract(
    state: GameState,
    action: Extract<PendingAction, { type: 'postTransportContract' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, toPlanetId, cargo, maxDurationInTicks, offeredReward, expiresAtTick } =
        action;

    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'transportContractPostFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({ type: 'transportContractPostFailed', requestId, reason: 'No assets on planet' });
        return;
    }
    if (assets.deposits < offeredReward) {
        safePostMessage({
            type: 'transportContractPostFailed',
            requestId,
            reason: 'Insufficient deposits to escrow reward',
        });
        return;
    }

    // Find the resource type. We need to look up from all resources.
    // For now we store just the name + quantity; the full resource type is resolved at acceptance.
    const planet = state.planets.get(planetId);
    if (!planet) {
        safePostMessage({ type: 'transportContractPostFailed', requestId, reason: 'Planet not found' });
        return;
    }

    // Resolve resource type from the planet's storage catalog
    const storageEntry = assets.storageFacility.currentInStorage[cargo.resourceName];
    if (!storageEntry) {
        safePostMessage({
            type: 'transportContractPostFailed',
            requestId,
            reason: `Unknown resource '${cargo.resourceName}'`,
        });
        return;
    }

    // Escrow the reward
    assets.deposits -= offeredReward;
    assets.depositHold += offeredReward;

    const contractId = generateId('tc');
    const contract: TransportContract = {
        id: contractId,
        fromPlanetId: planetId,
        toPlanetId,
        cargo: { type: storageEntry.resource, quantity: cargo.quantity },
        maxDurationInTicks,
        offeredReward,
        postedByAgentId: agentId,
        expiresAtTick,
        status: 'open',
    };

    assets.transportContracts.push(contract);
    safePostMessage({ type: 'transportContractPosted', requestId, agentId, contractId });
}

export function handleAcceptTransportContract(
    state: GameState,
    action: Extract<PendingAction, { type: 'acceptTransportContract' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, posterAgentId, contractId, shipName } = action;

    const carrierAgent = state.agents.get(agentId);
    if (!carrierAgent) {
        safePostMessage({ type: 'transportContractAcceptFailed', requestId, reason: 'Agent not found' });
        return;
    }

    const posterAgent = state.agents.get(posterAgentId);
    if (!posterAgent) {
        safePostMessage({ type: 'transportContractAcceptFailed', requestId, reason: 'Poster agent not found' });
        return;
    }

    const posterAssets = posterAgent.assets[planetId];
    if (!posterAssets) {
        safePostMessage({ type: 'transportContractAcceptFailed', requestId, reason: 'Contract planet not found' });
        return;
    }

    const contractIndex = posterAssets.transportContracts.findIndex((c) => c.id === contractId);
    if (contractIndex === -1) {
        safePostMessage({ type: 'transportContractAcceptFailed', requestId, reason: 'Contract not found' });
        return;
    }

    const contract = posterAssets.transportContracts[contractIndex];
    if (contract.status !== 'open') {
        safePostMessage({ type: 'transportContractAcceptFailed', requestId, reason: 'Contract is not open' });
        return;
    }

    // Validate the ship is idle and currently on fromPlanetId
    const ship = carrierAgent.transportShips.find((s) => s.name === shipName);
    if (!ship) {
        safePostMessage({ type: 'transportContractAcceptFailed', requestId, reason: `Ship '${shipName}' not found` });
        return;
    }
    if (ship.state.type !== 'idle') {
        safePostMessage({ type: 'transportContractAcceptFailed', requestId, reason: 'Ship is not idle' });
        return;
    }
    if (ship.state.planetId !== contract.fromPlanetId) {
        safePostMessage({
            type: 'transportContractAcceptFailed',
            requestId,
            reason: `Ship is not on the departure planet '${contract.fromPlanetId}'`,
        });
        return;
    }

    const fulfillmentDueAtTick = state.tick + contract.maxDurationInTicks;

    // Mutate contract in-place
    posterAssets.transportContracts[contractIndex] = {
        ...contract,
        status: 'accepted',
        acceptedByAgentId: agentId,
        shipName,
        fulfillmentDueAtTick,
    };

    // Transition ship to loading state
    ship.state = {
        type: 'loading',
        planetId: contract.fromPlanetId,
        to: contract.toPlanetId,
        cargoGoal: contract.cargo,
        currentCargo: { type: contract.cargo.type, quantity: 0 },
    };

    safePostMessage({ type: 'transportContractAccepted', requestId, agentId, contractId });
}

export function handleCancelTransportContract(
    state: GameState,
    action: Extract<PendingAction, { type: 'cancelTransportContract' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, contractId } = action;

    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'transportContractCancelFailed', requestId, reason: 'Agent not found' });
        return;
    }

    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({ type: 'transportContractCancelFailed', requestId, reason: 'No assets on planet' });
        return;
    }

    const contractIndex = assets.transportContracts.findIndex((c) => c.id === contractId);
    if (contractIndex === -1) {
        safePostMessage({ type: 'transportContractCancelFailed', requestId, reason: 'Contract not found' });
        return;
    }

    const contract = assets.transportContracts[contractIndex];
    if (contract.status !== 'open') {
        safePostMessage({
            type: 'transportContractCancelFailed',
            requestId,
            reason: 'Only open contracts can be cancelled',
        });
        return;
    }

    // Release escrowed reward
    assets.depositHold -= contract.offeredReward;
    assets.deposits += contract.offeredReward;

    assets.transportContracts[contractIndex] = { ...contract, status: 'cancelled' };
    safePostMessage({ type: 'transportContractCancelled', requestId, agentId, contractId });
}

export function handlePostShipBuyingOffer(
    state: GameState,
    action: Extract<PendingAction, { type: 'postShipBuyingOffer' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, shipType, price } = action;

    // Validate shipType
    const allShipTypeNames = Object.values(shiptypes).flatMap((category) => Object.keys(category));
    if (!allShipTypeNames.includes(shipType)) {
        safePostMessage({ type: 'shipBuyingOfferPostFailed', requestId, reason: `Unknown ship type '${shipType}'` });
        return;
    }

    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'shipBuyingOfferPostFailed', requestId, reason: 'Agent not found' });
        return;
    }

    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({ type: 'shipBuyingOfferPostFailed', requestId, reason: 'No assets on planet' });
        return;
    }

    if (assets.deposits < price) {
        safePostMessage({
            type: 'shipBuyingOfferPostFailed',
            requestId,
            reason: 'Insufficient deposits to escrow price',
        });
        return;
    }

    // Escrow the price
    assets.deposits -= price;
    assets.depositHold += price;

    const offerId = generateId('sbo');
    const offer: ShipBuyingOffer = {
        id: offerId,
        shipType: shipType as ShipBuyingOffer['shipType'],
        buyerAgentId: agentId,
        price,
        status: 'open',
    };

    assets.shipBuyingOffers.push(offer);
    safePostMessage({ type: 'shipBuyingOfferPosted', requestId, agentId, offerId });
}

export function handleAcceptShipBuyingOffer(
    state: GameState,
    action: Extract<PendingAction, { type: 'acceptShipBuyingOffer' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, posterAgentId, offerId, shipName } = action;

    const sellerAgent = state.agents.get(agentId);
    if (!sellerAgent) {
        safePostMessage({ type: 'shipBuyingOfferAcceptFailed', requestId, reason: 'Agent not found' });
        return;
    }

    const buyerAgent = state.agents.get(posterAgentId);
    if (!buyerAgent) {
        safePostMessage({ type: 'shipBuyingOfferAcceptFailed', requestId, reason: 'Buyer agent not found' });
        return;
    }

    const buyerAssets = buyerAgent.assets[planetId];
    if (!buyerAssets) {
        safePostMessage({ type: 'shipBuyingOfferAcceptFailed', requestId, reason: 'Offer planet not found' });
        return;
    }

    const offerIndex = buyerAssets.shipBuyingOffers.findIndex((o) => o.id === offerId);
    if (offerIndex === -1) {
        safePostMessage({ type: 'shipBuyingOfferAcceptFailed', requestId, reason: 'Offer not found' });
        return;
    }

    const offer = buyerAssets.shipBuyingOffers[offerIndex];
    if (offer.status !== 'open') {
        safePostMessage({ type: 'shipBuyingOfferAcceptFailed', requestId, reason: 'Offer is not open' });
        return;
    }

    // Validate the ship is idle
    const shipIndex = sellerAgent.transportShips.findIndex((s) => s.name === shipName);
    if (shipIndex === -1) {
        safePostMessage({ type: 'shipBuyingOfferAcceptFailed', requestId, reason: `Ship '${shipName}' not found` });
        return;
    }
    const ship = sellerAgent.transportShips[shipIndex];
    if (ship.state.type !== 'idle') {
        safePostMessage({ type: 'shipBuyingOfferAcceptFailed', requestId, reason: 'Ship is not idle' });
        return;
    }

    // Transfer ship from seller to buyer
    sellerAgent.transportShips.splice(shipIndex, 1);
    buyerAgent.transportShips.push(ship);

    // Transfer escrowed payment from buyer's hold to seller's deposits
    buyerAssets.depositHold -= offer.price;
    const sellerAssets = sellerAgent.assets[planetId] ?? sellerAgent.assets[sellerAgent.associatedPlanetId];
    if (sellerAssets) {
        sellerAssets.deposits += offer.price;
    }

    buyerAssets.shipBuyingOffers[offerIndex] = {
        ...offer,
        status: 'fulfilled',
        sellerAgentId: agentId,
        shipName,
    };

    safePostMessage({ type: 'shipBuyingOfferAccepted', requestId, agentId, offerId });
}

export function handlePostShipMaintenanceOffer(
    state: GameState,
    action: Extract<PendingAction, { type: 'postShipMaintenanceOffer' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, shipName, price, maximumTicksAllowed } = action;

    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'shipMaintenanceOfferPostFailed', requestId, reason: 'Agent not found' });
        return;
    }

    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({ type: 'shipMaintenanceOfferPostFailed', requestId, reason: 'No assets on planet' });
        return;
    }

    const ship = agent.transportShips.find((s) => s.name === shipName);
    if (!ship) {
        safePostMessage({
            type: 'shipMaintenanceOfferPostFailed',
            requestId,
            reason: `Ship '${shipName}' not found`,
        });
        return;
    }
    if (ship.state.type !== 'idle') {
        safePostMessage({ type: 'shipMaintenanceOfferPostFailed', requestId, reason: 'Ship must be idle' });
        return;
    }
    if (ship.state.planetId !== planetId) {
        safePostMessage({
            type: 'shipMaintenanceOfferPostFailed',
            requestId,
            reason: 'Ship is not on the specified planet',
        });
        return;
    }

    if (assets.deposits < price) {
        safePostMessage({ type: 'shipMaintenanceOfferPostFailed', requestId, reason: 'Insufficient deposits' });
        return;
    }

    assets.deposits -= price;
    assets.depositHold += price;

    const offerId = generateId('smo');
    const offer: ShipMaintenanceOffer = {
        id: offerId,
        shipName,
        shipOwnerAgentId: agentId,
        price,
        maximumTicksAllowed,
        status: 'open',
    };

    assets.shipMaintenanceOffers.push(offer);
    safePostMessage({ type: 'shipMaintenanceOfferPosted', requestId, agentId, offerId });
}

export function handleAcceptShipMaintenanceOffer(
    state: GameState,
    action: Extract<PendingAction, { type: 'acceptShipMaintenanceOffer' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, posterAgentId, offerId } = action;

    const providerAgent = state.agents.get(agentId);
    if (!providerAgent) {
        safePostMessage({ type: 'shipMaintenanceOfferAcceptFailed', requestId, reason: 'Agent not found' });
        return;
    }

    const ownerAgent = state.agents.get(posterAgentId);
    if (!ownerAgent) {
        safePostMessage({ type: 'shipMaintenanceOfferAcceptFailed', requestId, reason: 'Ship owner agent not found' });
        return;
    }

    const ownerAssets = ownerAgent.assets[planetId];
    if (!ownerAssets) {
        safePostMessage({ type: 'shipMaintenanceOfferAcceptFailed', requestId, reason: 'Offer planet not found' });
        return;
    }

    const offerIndex = ownerAssets.shipMaintenanceOffers.findIndex((o) => o.id === offerId);
    if (offerIndex === -1) {
        safePostMessage({ type: 'shipMaintenanceOfferAcceptFailed', requestId, reason: 'Offer not found' });
        return;
    }

    const offer = ownerAssets.shipMaintenanceOffers[offerIndex];
    if (offer.status !== 'open') {
        safePostMessage({ type: 'shipMaintenanceOfferAcceptFailed', requestId, reason: 'Offer is not open' });
        return;
    }

    // Validate provider has an idle shipyard on this planet
    const providerAssets = providerAgent.assets[planetId];
    if (!providerAssets) {
        safePostMessage({
            type: 'shipMaintenanceOfferAcceptFailed',
            requestId,
            reason: 'Provider has no assets on this planet',
        });
        return;
    }

    const idleShipyard = providerAssets.shipyardFacilities.find((f) => !f.construction && f.mode === 'idle');
    if (!idleShipyard) {
        safePostMessage({
            type: 'shipMaintenanceOfferAcceptFailed',
            requestId,
            reason: 'No idle shipyard available on this planet',
        });
        return;
    }

    const contractDueTick = state.tick + offer.maximumTicksAllowed;

    // Set the shipyard into maintenance mode
    idleShipyard.mode = 'maintenance';
    (idleShipyard as Extract<typeof idleShipyard, { mode: 'maintenance' }>).shipOwner = posterAgentId;
    (idleShipyard as Extract<typeof idleShipyard, { mode: 'maintenance' }>).shipName = offer.shipName;
    (idleShipyard as Extract<typeof idleShipyard, { mode: 'maintenance' }>).progress = 0;

    ownerAssets.shipMaintenanceOffers[offerIndex] = {
        ...offer,
        status: 'accepted',
        maintenanceProviderAgentId: agentId,
        contractDueTick,
    };

    safePostMessage({ type: 'shipMaintenanceOfferAccepted', requestId, agentId, offerId });
}
