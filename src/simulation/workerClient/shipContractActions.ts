import { MAX_DISPATCH_TIMEOUT_TICKS } from '../constants';
import { lockIntoEscrow, queryStorageFacility, releaseFromEscrow } from '../planet/facility';
import type { Facility } from '../planet/facility';
import type { GameState } from '../planet/planet';
import type { ConstructionContract, ShipBuyingOffer, ShipListing, TransportContract } from '../ships/ships';
import { shiptypes } from '../ships/ships';
import { ALL_FACILITY_ENTRIES } from '../planet/productionFacilities';
import { appendTradeRecord, effectiveShipValue, updateShipEma } from '../ships/shipMarket';
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
    const ship = carrierAgent.ships.find((s) => s.name === shipName);
    if (!ship) {
        safePostMessage({ type: 'transportContractAcceptFailed', requestId, reason: `Ship '${shipName}' not found` });
        return;
    }
    if (ship.type.type !== 'transport') {
        safePostMessage({
            type: 'transportContractAcceptFailed',
            requestId,
            reason: 'Only transport ships can accept transport contracts',
        });
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
        deadlineTick: state.tick + MAX_DISPATCH_TIMEOUT_TICKS,
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

export function handlePostConstructionContract(
    state: GameState,
    action: Extract<PendingAction, { type: 'postConstructionContract' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const {
        requestId,
        agentId,
        planetId,
        toPlanetId,
        facilityName,
        commissioningAgentId,
        offeredReward,
        expiresAtTick,
    } = action;

    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'constructionContractPostFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({ type: 'constructionContractPostFailed', requestId, reason: 'No assets on planet' });
        return;
    }
    if (assets.deposits < offeredReward) {
        safePostMessage({
            type: 'constructionContractPostFailed',
            requestId,
            reason: 'Insufficient deposits to escrow reward',
        });
        return;
    }
    if (expiresAtTick <= state.tick) {
        safePostMessage({
            type: 'constructionContractPostFailed',
            requestId,
            reason: 'Contract expiry is in the past',
        });
        return;
    }
    if (!state.agents.has(commissioningAgentId)) {
        safePostMessage({
            type: 'constructionContractPostFailed',
            requestId,
            reason: 'Commissioning agent not found',
        });
        return;
    }
    const PLACEHOLDER = 'catalog';
    const facilityEntry = ALL_FACILITY_ENTRIES.find((e) => e.factory(PLACEHOLDER, PLACEHOLDER).name === facilityName);
    if (!facilityEntry) {
        safePostMessage({
            type: 'constructionContractPostFailed',
            requestId,
            reason: `Unknown facility '${facilityName}'`,
        });
        return;
    }

    assets.deposits -= offeredReward;
    assets.depositHold += offeredReward;

    const contractId = generateId('cc');
    const contract: ConstructionContract = {
        id: contractId,
        fromPlanetId: planetId,
        toPlanetId,
        facilityName,
        commissioningAgentId,
        offeredReward,
        postedByAgentId: agentId,
        expiresAtTick,
        status: 'open',
    };

    assets.constructionContracts.push(contract);
    safePostMessage({ type: 'constructionContractPosted', requestId, agentId, contractId });
}

export function handleAcceptConstructionContract(
    state: GameState,
    action: Extract<PendingAction, { type: 'acceptConstructionContract' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, posterAgentId, contractId, shipName } = action;

    const carrierAgent = state.agents.get(agentId);
    if (!carrierAgent) {
        safePostMessage({ type: 'constructionContractAcceptFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const posterAgent = state.agents.get(posterAgentId);
    if (!posterAgent) {
        safePostMessage({ type: 'constructionContractAcceptFailed', requestId, reason: 'Poster agent not found' });
        return;
    }
    const posterAssets = posterAgent.assets[planetId];
    if (!posterAssets) {
        safePostMessage({ type: 'constructionContractAcceptFailed', requestId, reason: 'Contract planet not found' });
        return;
    }

    const contractIndex = posterAssets.constructionContracts.findIndex((c) => c.id === contractId);
    if (contractIndex === -1) {
        safePostMessage({ type: 'constructionContractAcceptFailed', requestId, reason: 'Contract not found' });
        return;
    }
    const contract = posterAssets.constructionContracts[contractIndex];
    if (contract.status !== 'open') {
        safePostMessage({ type: 'constructionContractAcceptFailed', requestId, reason: 'Contract is not open' });
        return;
    }
    if (state.tick > contract.expiresAtTick) {
        safePostMessage({ type: 'constructionContractAcceptFailed', requestId, reason: 'Contract has expired' });
        return;
    }

    const ship = carrierAgent.ships.find((s) => s.name === shipName && s.type.type === 'construction');
    if (!ship) {
        safePostMessage({
            type: 'constructionContractAcceptFailed',
            requestId,
            reason: `Construction ship '${shipName}' not found`,
        });
        return;
    }
    if (ship.state.type !== 'idle') {
        safePostMessage({ type: 'constructionContractAcceptFailed', requestId, reason: 'Ship is not idle' });
        return;
    }
    if (ship.state.planetId !== contract.fromPlanetId) {
        safePostMessage({
            type: 'constructionContractAcceptFailed',
            requestId,
            reason: `Ship is not on the departure planet '${contract.fromPlanetId}'`,
        });
        return;
    }

    // Create the facility blueprint for pre-fabrication (starts in 'under construction' state)
    const PLACEHOLDER = 'catalog';
    const facilityEntry = ALL_FACILITY_ENTRIES.find(
        (e) => e.factory(PLACEHOLDER, PLACEHOLDER).name === contract.facilityName,
    );
    if (!facilityEntry) {
        safePostMessage({
            type: 'constructionContractAcceptFailed',
            requestId,
            reason: `Unknown facility '${contract.facilityName}'`,
        });
        return;
    }

    const facilityId = generateId('cf');
    const facilityBlueprint = facilityEntry.factory(contract.fromPlanetId, facilityId);
    // Put it under construction
    facilityBlueprint.construction = {
        constructionTargetMaxScale: 1,
        totalConstructionServiceRequired: 100,
        maximumConstructionServiceConsumption: 10,
        progress: 0,
        lastTickInvestedConstructionServices: 0,
    };

    const fulfillmentDueAtTick = state.tick + (contract.expiresAtTick - state.tick);
    posterAssets.constructionContracts[contractIndex] = {
        ...contract,
        status: 'accepted',
        acceptedByAgentId: agentId,
        shipName,
        fulfillmentDueAtTick,
    };

    ship.state = {
        type: 'pre-fabrication',
        planetId: contract.fromPlanetId,
        to: contract.toPlanetId,
        buildingTarget: facilityBlueprint,
        progress: 0,
        contractId,
        posterAgentId,
    };

    safePostMessage({ type: 'constructionContractAccepted', requestId, agentId, contractId });
}

export function handleCancelConstructionContract(
    state: GameState,
    action: Extract<PendingAction, { type: 'cancelConstructionContract' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, contractId } = action;

    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'constructionContractCancelFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({ type: 'constructionContractCancelFailed', requestId, reason: 'No assets on planet' });
        return;
    }

    const contractIndex = assets.constructionContracts.findIndex((c) => c.id === contractId);
    if (contractIndex === -1) {
        safePostMessage({ type: 'constructionContractCancelFailed', requestId, reason: 'Contract not found' });
        return;
    }
    const contract = assets.constructionContracts[contractIndex];
    if (contract.status !== 'open') {
        safePostMessage({
            type: 'constructionContractCancelFailed',
            requestId,
            reason: 'Only open contracts can be cancelled',
        });
        return;
    }

    assets.depositHold -= contract.offeredReward;
    assets.deposits += contract.offeredReward;

    assets.constructionContracts.splice(contractIndex, 1);
    safePostMessage({ type: 'constructionContractCancelled', requestId, agentId, contractId });
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
    const shipIndex = sellerAgent.ships.findIndex((s) => s.name === shipName);
    if (shipIndex === -1) {
        safePostMessage({ type: 'shipBuyingOfferAcceptFailed', requestId, reason: `Ship '${shipName}' not found` });
        return;
    }
    const ship = sellerAgent.ships[shipIndex];
    if (ship.state.type !== 'idle') {
        safePostMessage({ type: 'shipBuyingOfferAcceptFailed', requestId, reason: 'Ship is not idle' });
        return;
    }
    if (ship.type.type !== 'transport') {
        safePostMessage({
            type: 'shipBuyingOfferAcceptFailed',
            requestId,
            reason: 'Only transport ships can be sold via buy offers',
        });
        return;
    }
    // offer.shipType is a ShipTypeKey; resolve to display name for comparison
    const shipTypesByKey = Object.fromEntries(Object.values(shiptypes).flatMap((cat) => Object.entries(cat))) as Record<
        string,
        { name: string }
    >;
    const expectedTypeName = shipTypesByKey[offer.shipType]?.name;
    if (!expectedTypeName || ship.type.name !== expectedTypeName) {
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
    sellerAgent.ships.splice(shipIndex, 1);
    buyerAgent.ships.push(ship);

    // Transfer escrowed payment from buyer's hold to seller's deposits
    buyerAssets.depositHold -= offer.price;
    sellerAssets.deposits += offer.price;

    buyerAssets.shipBuyingOffers.splice(offerIndex, 1);

    // Record trade in ship capital market
    const ev = effectiveShipValue(ship, state);
    updateShipEma(state.shipCapitalMarket, ship.type.name, offer.price);
    appendTradeRecord(state.shipCapitalMarket, {
        shipTypeName: ship.type.name,
        price: offer.price,
        tick: state.tick,
        maintainanceStatus: ship.maintainanceStatus,
        maxMaintenance: ship.maxMaintenance,
        effectiveValue: ev,
    });

    safePostMessage({ type: 'shipBuyingOfferAccepted', requestId, agentId, offerId });
}

export function handlePostShipListing(
    state: GameState,
    action: Extract<PendingAction, { type: 'postShipListing' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, shipName, askPrice } = action;

    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'shipListingPostFailed', requestId, reason: 'Agent not found' });
        return;
    }

    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({ type: 'shipListingPostFailed', requestId, reason: 'No assets on planet' });
        return;
    }

    const ship = agent.ships.find((s) => s.name === shipName);
    if (!ship) {
        safePostMessage({ type: 'shipListingPostFailed', requestId, reason: `Ship '${shipName}' not found` });
        return;
    }
    if (ship.state.type === 'derelict') {
        safePostMessage({ type: 'shipListingPostFailed', requestId, reason: 'Cannot list a derelict ship' });
        return;
    }
    if (ship.state.type !== 'idle') {
        safePostMessage({ type: 'shipListingPostFailed', requestId, reason: 'Ship must be idle to be listed' });
        return;
    }
    if (ship.state.planetId !== planetId) {
        safePostMessage({
            type: 'shipListingPostFailed',
            requestId,
            reason: `Ship is not on planet '${planetId}'`,
        });
        return;
    }
    if (assets.shipListings.some((l) => l.shipName === shipName)) {
        safePostMessage({ type: 'shipListingPostFailed', requestId, reason: 'Ship is already listed for sale' });
        return;
    }

    ship.state = { type: 'listed', planetId };

    const listingId = generateId('sl');
    const listing: ShipListing = {
        id: listingId,
        sellerAgentId: agentId,
        shipName,
        shipTypeName: ship.type.name,
        askPrice,
        planetId,
        postedAtTick: state.tick,
    };
    assets.shipListings.push(listing);

    safePostMessage({ type: 'shipListingPosted', requestId, agentId, listingId });
}

export function handleCancelShipListing(
    state: GameState,
    action: Extract<PendingAction, { type: 'cancelShipListing' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, listingId } = action;

    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'shipListingCancelFailed', requestId, reason: 'Agent not found' });
        return;
    }

    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({ type: 'shipListingCancelFailed', requestId, reason: 'No assets on planet' });
        return;
    }

    const listingIndex = assets.shipListings.findIndex((l) => l.id === listingId);
    if (listingIndex === -1) {
        safePostMessage({ type: 'shipListingCancelFailed', requestId, reason: 'Listing not found' });
        return;
    }

    const listing = assets.shipListings[listingIndex];
    if (listing.sellerAgentId !== agentId) {
        safePostMessage({ type: 'shipListingCancelFailed', requestId, reason: 'You do not own this listing' });
        return;
    }

    // Restore ship state to idle
    const ship = agent.ships.find((s) => s.name === listing.shipName);
    if (ship && ship.state.type === 'listed') {
        ship.state = { type: 'idle', planetId };
    }

    assets.shipListings.splice(listingIndex, 1);
    safePostMessage({ type: 'shipListingCancelled', requestId, agentId, listingId });
}

export function handleAcceptShipListing(
    state: GameState,
    action: Extract<PendingAction, { type: 'acceptShipListing' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, buyerAgentId, buyerPlanetId, sellerAgentId, listingId } = action;

    const buyerAgent = state.agents.get(buyerAgentId);
    if (!buyerAgent) {
        safePostMessage({ type: 'shipListingAcceptFailed', requestId, reason: 'Buyer agent not found' });
        return;
    }

    const sellerAgent = state.agents.get(sellerAgentId);
    if (!sellerAgent) {
        safePostMessage({ type: 'shipListingAcceptFailed', requestId, reason: 'Seller agent not found' });
        return;
    }

    const buyerAssets = buyerAgent.assets[buyerPlanetId];
    if (!buyerAssets) {
        safePostMessage({
            type: 'shipListingAcceptFailed',
            requestId,
            reason: 'Buyer has no assets on specified planet',
        });
        return;
    }

    // Find the listing in seller's assets
    let listing: ShipListing | undefined;
    let sellerAssets: (typeof sellerAgent.assets)[string] | undefined;
    for (const [, assets] of Object.entries(sellerAgent.assets)) {
        const found = assets.shipListings.find((l) => l.id === listingId);
        if (found) {
            listing = found;
            sellerAssets = assets;
            break;
        }
    }

    if (!listing || !sellerAssets) {
        safePostMessage({ type: 'shipListingAcceptFailed', requestId, reason: 'Listing not found' });
        return;
    }
    if (listing.sellerAgentId !== sellerAgentId) {
        safePostMessage({ type: 'shipListingAcceptFailed', requestId, reason: 'Seller agent mismatch' });
        return;
    }

    const shipIndex = sellerAgent.ships.findIndex((s) => s.name === listing!.shipName);
    if (shipIndex === -1) {
        safePostMessage({ type: 'shipListingAcceptFailed', requestId, reason: 'Ship no longer exists' });
        return;
    }
    const ship = sellerAgent.ships[shipIndex];
    if (ship.state.type !== 'listed') {
        safePostMessage({ type: 'shipListingAcceptFailed', requestId, reason: 'Ship is no longer listed' });
        return;
    }
    if (buyerAssets.deposits < listing.askPrice) {
        safePostMessage({ type: 'shipListingAcceptFailed', requestId, reason: 'Insufficient deposits' });
        return;
    }

    // Atomic settlement
    // Transfer ship
    sellerAgent.ships.splice(shipIndex, 1);
    ship.state = { type: 'idle', planetId: listing.planetId };
    buyerAgent.ships.push(ship);

    // Transfer funds
    buyerAssets.deposits -= listing.askPrice;
    sellerAssets.deposits += listing.askPrice;

    // Remove listing
    const listingIndex = sellerAssets.shipListings.indexOf(listing);
    sellerAssets.shipListings.splice(listingIndex, 1);

    // Record trade
    const ev = effectiveShipValue(ship, state);
    updateShipEma(state.shipCapitalMarket, ship.type.name, listing.askPrice);
    appendTradeRecord(state.shipCapitalMarket, {
        shipTypeName: ship.type.name,
        price: listing.askPrice,
        tick: state.tick,
        maintainanceStatus: ship.maintainanceStatus,
        maxMaintenance: ship.maxMaintenance,
        effectiveValue: ev,
    });

    safePostMessage({ type: 'shipListingAccepted', requestId, buyerAgentId, listingId });
}

export function handleDispatchShip(
    state: GameState,
    action: Extract<PendingAction, { type: 'dispatchShip' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, fromPlanetId, toPlanetId, shipName, cargoGoal } = action;

    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'shipDispatchFailed', requestId, reason: 'Agent not found' });
        return;
    }

    if (!state.planets.has(toPlanetId)) {
        safePostMessage({
            type: 'shipDispatchFailed',
            requestId,
            reason: `Destination planet '${toPlanetId}' not found`,
        });
        return;
    }

    const ship = agent.ships.find((s) => s.name === shipName);
    if (!ship) {
        safePostMessage({ type: 'shipDispatchFailed', requestId, reason: `Ship '${shipName}' not found` });
        return;
    }
    if (ship.state.type !== 'idle') {
        safePostMessage({ type: 'shipDispatchFailed', requestId, reason: 'Ship is not idle' });
        return;
    }
    if (ship.state.planetId !== fromPlanetId) {
        safePostMessage({ type: 'shipDispatchFailed', requestId, reason: `Ship is not on planet '${fromPlanetId}'` });
        return;
    }
    if (ship.type.type !== 'transport') {
        safePostMessage({
            type: 'shipDispatchFailed',
            requestId,
            reason: 'Only transport ships can be self-dispatched',
        });
        return;
    }

    if (!cargoGoal) {
        // Ferry-mode: transit without cargo — go directly to transporting
        ship.state = {
            type: 'transporting',
            from: fromPlanetId,
            to: toPlanetId,
            cargo: null,
            arrivalTick: state.tick + Math.ceil(1000 / ship.type.speed),
        };
        safePostMessage({ type: 'shipDispatched', requestId, agentId, shipName });
        return;
    }

    const assets = agent.assets[fromPlanetId];
    if (!assets?.storageFacility) {
        safePostMessage({ type: 'shipDispatchFailed', requestId, reason: 'No storage facility on departure planet' });
        return;
    }

    const storageEntry = assets.storageFacility.currentInStorage[cargoGoal.resourceName];
    if (!storageEntry) {
        safePostMessage({
            type: 'shipDispatchFailed',
            requestId,
            reason: `Unknown resource '${cargoGoal.resourceName}'`,
        });
        return;
    }

    const available = queryStorageFacility(assets.storageFacility, cargoGoal.resourceName);
    if (cargoGoal.quantity > available) {
        safePostMessage({ type: 'shipDispatchFailed', requestId, reason: 'Insufficient cargo quantity in storage' });
        return;
    }

    ship.state = {
        type: 'loading',
        planetId: fromPlanetId,
        to: toPlanetId,
        cargoGoal: { resource: storageEntry.resource, quantity: cargoGoal.quantity },
        currentCargo: { resource: storageEntry.resource, quantity: 0 },
        deadlineTick: state.tick + MAX_DISPATCH_TIMEOUT_TICKS,
        // No contractId or posterAgentId — cargo is loaded from own storage
    };

    safePostMessage({ type: 'shipDispatched', requestId, agentId, shipName });
}

export function handleDispatchPassengerShip(
    state: GameState,
    action: Extract<PendingAction, { type: 'dispatchPassengerShip' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, fromPlanetId, toPlanetId, shipName, passengerCount } = action;

    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'passengerShipDispatchFailed', requestId, reason: 'Agent not found' });
        return;
    }

    if (!state.planets.has(fromPlanetId)) {
        safePostMessage({
            type: 'passengerShipDispatchFailed',
            requestId,
            reason: `Source planet '${fromPlanetId}' not found`,
        });
        return;
    }

    if (!state.planets.has(toPlanetId)) {
        safePostMessage({
            type: 'passengerShipDispatchFailed',
            requestId,
            reason: `Destination planet '${toPlanetId}' not found`,
        });
        return;
    }

    const ship = agent.ships.find((s) => s.name === shipName);
    if (!ship) {
        safePostMessage({
            type: 'passengerShipDispatchFailed',
            requestId,
            reason: `Ship '${shipName}' not found`,
        });
        return;
    }
    if (ship.state.type !== 'idle') {
        safePostMessage({ type: 'passengerShipDispatchFailed', requestId, reason: 'Ship is not idle' });
        return;
    }
    if (ship.state.planetId !== fromPlanetId) {
        safePostMessage({
            type: 'passengerShipDispatchFailed',
            requestId,
            reason: `Ship is not on planet '${fromPlanetId}'`,
        });
        return;
    }
    if (ship.type.type !== 'passenger') {
        safePostMessage({
            type: 'passengerShipDispatchFailed',
            requestId,
            reason: 'Only passenger ships can transport passengers',
        });
        return;
    }

    const capacity = ship.type.passengerCapacity;
    const goal = Math.min(passengerCount, capacity);
    if (goal <= 0) {
        safePostMessage({ type: 'passengerShipDispatchFailed', requestId, reason: 'Passenger count must be > 0' });
        return;
    }

    ship.state = {
        type: 'passenger_boarding',
        posterAgentId: agentId,
        planetId: fromPlanetId,
        to: toPlanetId,
        passengerGoal: goal,
        currentPassengers: 0,
        manifest: {},
        deadlineTick: state.tick + MAX_DISPATCH_TIMEOUT_TICKS,
    };

    safePostMessage({ type: 'passengerShipDispatched', requestId, agentId, shipName });
}

export function handleDispatchConstructionShip(
    state: GameState,
    action: Extract<PendingAction, { type: 'dispatchConstructionShip' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, fromPlanetId, toPlanetId, shipName, facilityName } = action;

    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'constructionShipDispatchFailed', requestId, reason: 'Agent not found' });
        return;
    }

    if (!state.planets.has(toPlanetId)) {
        safePostMessage({
            type: 'constructionShipDispatchFailed',
            requestId,
            reason: `Destination planet '${toPlanetId}' not found`,
        });
        return;
    }

    const ship = agent.ships.find((s) => s.name === shipName);
    if (!ship) {
        safePostMessage({ type: 'constructionShipDispatchFailed', requestId, reason: `Ship '${shipName}' not found` });
        return;
    }
    if (ship.state.type !== 'idle') {
        safePostMessage({ type: 'constructionShipDispatchFailed', requestId, reason: 'Ship is not idle' });
        return;
    }
    if (ship.state.planetId !== fromPlanetId) {
        safePostMessage({
            type: 'constructionShipDispatchFailed',
            requestId,
            reason: `Ship is not on planet '${fromPlanetId}'`,
        });
        return;
    }
    if (ship.type.type !== 'construction') {
        safePostMessage({
            type: 'constructionShipDispatchFailed',
            requestId,
            reason: 'Only construction ships can be dispatched for construction',
        });
        return;
    }

    const PLACEHOLDER = 'catalog';
    const facilityEntry = facilityName
        ? ALL_FACILITY_ENTRIES.find((e) => e.factory(PLACEHOLDER, PLACEHOLDER).name === facilityName)
        : undefined;
    if (facilityName && !facilityEntry) {
        safePostMessage({
            type: 'constructionShipDispatchFailed',
            requestId,
            reason: `Unknown facility '${facilityName}'`,
        });
        return;
    }

    let facilityBlueprint: Facility | null = null;
    if (facilityEntry) {
        const facilityId = generateId('cf');
        facilityBlueprint = facilityEntry.factory(fromPlanetId, facilityId);
        facilityBlueprint.construction = {
            constructionTargetMaxScale: 1,
            totalConstructionServiceRequired: 100,
            maximumConstructionServiceConsumption: 10,
            progress: 0,
            lastTickInvestedConstructionServices: 0,
        };
    }

    ship.state = {
        type: 'pre-fabrication',
        planetId: fromPlanetId,
        to: toPlanetId,
        buildingTarget: facilityBlueprint,
        progress: 0,
        deadlineTick: state.tick + MAX_DISPATCH_TIMEOUT_TICKS,
    };

    safePostMessage({ type: 'constructionShipDispatched', requestId, agentId, shipName });
}
