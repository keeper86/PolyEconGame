import { lockIntoEscrow, queryStorageFacility, releaseFromEscrow } from '../planet/facility';
import type { GameState } from '../planet/planet';
import type { ShipBuyingOffer, TransportContract } from '../ships/ships';
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

    if (expiresAtTick <= state.tick) {
        safePostMessage({
            type: 'transportContractPostFailed',
            requestId,
            reason: 'Contract expiry is in the past',
        });
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

    const availableQuantity = queryStorageFacility(assets.storageFacility, cargo.resourceName);
    if (cargo.quantity > availableQuantity) {
        safePostMessage({
            type: 'transportContractPostFailed',
            requestId,
            reason: 'Insufficient cargo quantity in storage',
        });
        return;
    }

    // Escrow the reward
    assets.deposits -= offeredReward;
    assets.depositHold += offeredReward;

    // Escrow the cargo so it cannot be sold after posting
    lockIntoEscrow(assets.storageFacility, cargo.resourceName, cargo.quantity);

    const contractId = generateId('tc');
    const contract: TransportContract = {
        id: contractId,
        fromPlanetId: planetId,
        toPlanetId,
        cargo: { resource: storageEntry.resource, quantity: cargo.quantity },
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

    if (state.tick > contract.expiresAtTick) {
        safePostMessage({ type: 'transportContractAcceptFailed', requestId, reason: 'Contract has expired' });
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

    // Transition ship to loading state; cargo is pulled from the poster's storage
    ship.state = {
        type: 'loading',
        planetId: contract.fromPlanetId,
        to: contract.toPlanetId,
        cargoGoal: contract.cargo,
        currentCargo: { resource: contract.cargo.resource, quantity: 0 },
        contractId,
        posterAgentId,
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

    // Release escrowed cargo
    releaseFromEscrow(assets.storageFacility, contract.cargo.resource.name, contract.cargo.quantity);

    assets.transportContracts.splice(contractIndex, 1);
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
    if (ship.type.name !== offer.shipType) {
        safePostMessage({
            type: 'shipBuyingOfferAcceptFailed',
            requestId,
            reason: `Ship type '${ship.type.name}' does not match offer ship type '${offer.shipType}'`,
        });
        return;
    }
    if (ship.state.planetId !== planetId) {
        safePostMessage({
            type: 'shipBuyingOfferAcceptFailed',
            requestId,
            reason: `Ship is not on the offer planet '${planetId}'`,
        });
        return;
    }

    // Resolve seller's assets before mutating state so we can fail cleanly
    const sellerAssets = sellerAgent.assets[planetId] ?? sellerAgent.assets[sellerAgent.associatedPlanetId];
    if (!sellerAssets) {
        safePostMessage({
            type: 'shipBuyingOfferAcceptFailed',
            requestId,
            reason: 'Seller has no assets on the offer planet or their home planet',
        });
        return;
    }

    // Transfer ship from seller to buyer
    sellerAgent.transportShips.splice(shipIndex, 1);
    buyerAgent.transportShips.push(ship);

    // Transfer escrowed payment from buyer's hold to seller's deposits
    buyerAssets.depositHold -= offer.price;
    sellerAssets.deposits += offer.price;

    buyerAssets.shipBuyingOffers.splice(offerIndex, 1);

    safePostMessage({ type: 'shipBuyingOfferAccepted', requestId, agentId, offerId });
}
