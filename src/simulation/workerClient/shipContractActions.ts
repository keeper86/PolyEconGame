import { MAX_DISPATCH_TIMEOUT_TICKS } from '../constants';
import type { Facility } from '../planet/facility';
import { getWholeStorage, lockIntoEscrow, queryStorageFacility, releaseFromEscrow } from '../planet/facility';
import type { GameState } from '../planet/planet';
import { ALL_PRODUCTION_FACILITY_ENTRIES } from '../planet/productionFacilities';
import { appendTradeRecord, createShipListing, effectiveShipValue, updateShipEma } from '../ships/shipMarket';
import type { ConstructionContract, ShipBuyingOffer, ShipListing, TransportContract } from '../ships/ships';
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
        safePostMessage({
            type: 'transportContractPostFailed',
            requestId,
            error: { code: 'agentNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'transportContractPostFailed',
            requestId,
            error: { code: 'agentHasNoAssets', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    if (assets.deposits < offeredReward) {
        safePostMessage({
            type: 'transportContractPostFailed',
            requestId,
            error: { code: 'insufficientDepositsToEscrowReward', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    if (expiresAtTick <= state.tick) {
        safePostMessage({
            type: 'transportContractPostFailed',
            requestId,
            error: { code: 'contractExpiryInPast', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const storageEntry = getWholeStorage(assets.storage).find(
        ([resourceName]) => resourceName === cargo.resource.name,
    )?.[1];
    if (!storageEntry) {
        safePostMessage({
            type: 'transportContractPostFailed',
            requestId,
            error: { code: 'unknownResource', params: { resourceName: cargo.resource.name } },
            processedAtTick: state.tick,
        });
        return;
    }

    const availableQuantity = queryStorageFacility(assets.storage, cargo.resource.name);
    if (cargo.quantity > availableQuantity) {
        safePostMessage({
            type: 'transportContractPostFailed',
            requestId,
            error: { code: 'insufficientCargoInStorage', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    assets.deposits -= offeredReward;
    assets.depositHold += offeredReward;

    lockIntoEscrow(assets.storage, cargo.resource.name, cargo.quantity);

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
    safePostMessage({ type: 'transportContractPosted', requestId, agentId, contractId, processedAtTick: state.tick });
}

export function handleAcceptTransportContract(
    state: GameState,
    action: Extract<PendingAction, { type: 'acceptTransportContract' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, posterAgentId, contractId, shipId } = action;

    const carrierAgent = state.agents.get(agentId);
    if (!carrierAgent) {
        safePostMessage({
            type: 'transportContractAcceptFailed',
            requestId,
            error: { code: 'agentNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const posterAgent = state.agents.get(posterAgentId);
    if (!posterAgent) {
        safePostMessage({
            type: 'transportContractAcceptFailed',
            requestId,
            error: { code: 'shipPosterNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const posterAssets = posterAgent.assets[planetId];
    if (!posterAssets) {
        safePostMessage({
            type: 'transportContractAcceptFailed',
            requestId,
            error: { code: 'contractPlanetNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const contractIndex = posterAssets.transportContracts.findIndex((c) => c.id === contractId);
    if (contractIndex === -1) {
        safePostMessage({
            type: 'transportContractAcceptFailed',
            requestId,
            error: { code: 'contractNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const contract = posterAssets.transportContracts[contractIndex];
    if (contract.status !== 'open') {
        safePostMessage({
            type: 'transportContractAcceptFailed',
            requestId,
            error: { code: 'contractNotOpen', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    if (state.tick > contract.expiresAtTick) {
        safePostMessage({
            type: 'transportContractAcceptFailed',
            requestId,
            error: { code: 'contractExpired', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const ship = carrierAgent.ships.find((s) => s.id === shipId);
    if (!ship) {
        safePostMessage({
            type: 'transportContractAcceptFailed',
            requestId,
            error: { code: 'shipNotFound', params: { shipId: shipId } },
            processedAtTick: state.tick,
        });
        return;
    }
    if (ship.type.type !== 'transport') {
        safePostMessage({
            type: 'transportContractAcceptFailed',
            requestId,
            error: { code: 'onlyTransportShipsAcceptContracts', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    if (ship.state.type !== 'idle') {
        safePostMessage({
            type: 'transportContractAcceptFailed',
            requestId,
            error: { code: 'shipNotIdle', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    if (ship.state.planetId !== contract.fromPlanetId) {
        safePostMessage({
            type: 'transportContractAcceptFailed',
            requestId,
            error: { code: 'shipNotOnDeparturePlanet', params: { planetId: contract.fromPlanetId } },
            processedAtTick: state.tick,
        });
        return;
    }

    const fulfillmentDueAtTick = state.tick + contract.maxDurationInTicks;

    posterAssets.transportContracts[contractIndex] = {
        ...contract,
        status: 'accepted',
        acceptedByAgentId: agentId,
        shipId,
        fulfillmentDueAtTick,
    };

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

    safePostMessage({ type: 'transportContractAccepted', requestId, agentId, contractId, processedAtTick: state.tick });
}

export function handleCancelTransportContract(
    state: GameState,
    action: Extract<PendingAction, { type: 'cancelTransportContract' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, contractId } = action;

    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({
            type: 'transportContractCancelFailed',
            requestId,
            error: { code: 'agentNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'transportContractCancelFailed',
            requestId,
            error: { code: 'agentHasNoAssets', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const contractIndex = assets.transportContracts.findIndex((c) => c.id === contractId);
    if (contractIndex === -1) {
        safePostMessage({
            type: 'transportContractCancelFailed',
            requestId,
            error: { code: 'contractNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const contract = assets.transportContracts[contractIndex];
    if (contract.status !== 'open') {
        safePostMessage({
            type: 'transportContractCancelFailed',
            requestId,
            error: { code: 'onlyOpenContractsCancellable', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    assets.depositHold -= contract.offeredReward;
    assets.deposits += contract.offeredReward;

    releaseFromEscrow(assets.storage, contract.cargo.resource.name, contract.cargo.quantity);

    assets.transportContracts.splice(contractIndex, 1);
    safePostMessage({
        type: 'transportContractCancelled',
        requestId,
        agentId,
        contractId,
        processedAtTick: state.tick,
    });
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
        safePostMessage({
            type: 'constructionContractPostFailed',
            requestId,
            error: { code: 'agentNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'constructionContractPostFailed',
            requestId,
            error: { code: 'agentHasNoAssets', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    if (assets.deposits < offeredReward) {
        safePostMessage({
            type: 'constructionContractPostFailed',
            requestId,
            error: { code: 'insufficientDepositsToEscrowReward', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    if (expiresAtTick <= state.tick) {
        safePostMessage({
            type: 'constructionContractPostFailed',
            requestId,
            error: { code: 'contractExpiryInPast', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    if (!state.agents.has(commissioningAgentId)) {
        safePostMessage({
            type: 'constructionContractPostFailed',
            requestId,
            error: { code: 'shipCommissioningAgentNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    const PLACEHOLDER = 'catalog';
    const facilityEntry = Object.values(ALL_PRODUCTION_FACILITY_ENTRIES).find(
        (e) => e.factory(PLACEHOLDER, PLACEHOLDER).name === facilityName,
    );
    if (!facilityEntry) {
        safePostMessage({
            type: 'constructionContractPostFailed',
            requestId,
            error: { code: 'unknownFacility', params: { facilityName: facilityName } },
            processedAtTick: state.tick,
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
    safePostMessage({
        type: 'constructionContractPosted',
        requestId,
        agentId,
        contractId,
        processedAtTick: state.tick,
    });
}

export function handleAcceptConstructionContract(
    state: GameState,
    action: Extract<PendingAction, { type: 'acceptConstructionContract' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, posterAgentId, contractId, shipId } = action;

    const carrierAgent = state.agents.get(agentId);
    if (!carrierAgent) {
        safePostMessage({
            type: 'constructionContractAcceptFailed',
            requestId,
            error: { code: 'agentNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    const posterAgent = state.agents.get(posterAgentId);
    if (!posterAgent) {
        safePostMessage({
            type: 'constructionContractAcceptFailed',
            requestId,
            error: { code: 'shipPosterNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    const posterAssets = posterAgent.assets[planetId];
    if (!posterAssets) {
        safePostMessage({
            type: 'constructionContractAcceptFailed',
            requestId,
            error: { code: 'contractPlanetNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const contractIndex = posterAssets.constructionContracts.findIndex((c) => c.id === contractId);
    if (contractIndex === -1) {
        safePostMessage({
            type: 'constructionContractAcceptFailed',
            requestId,
            error: { code: 'contractNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    const contract = posterAssets.constructionContracts[contractIndex];
    if (contract.status !== 'open') {
        safePostMessage({
            type: 'constructionContractAcceptFailed',
            requestId,
            error: { code: 'contractNotOpen', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    if (state.tick > contract.expiresAtTick) {
        safePostMessage({
            type: 'constructionContractAcceptFailed',
            requestId,
            error: { code: 'contractExpired', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const ship = carrierAgent.ships.find((s) => s.id === shipId && s.type.type === 'construction');
    if (!ship) {
        safePostMessage({
            type: 'constructionContractAcceptFailed',
            requestId,
            error: { code: 'shipNotFound', params: { shipId: shipId } },
            processedAtTick: state.tick,
        });
        return;
    }
    if (ship.state.type !== 'idle') {
        safePostMessage({
            type: 'constructionContractAcceptFailed',
            requestId,
            error: { code: 'shipNotIdle', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    if (ship.state.planetId !== contract.fromPlanetId) {
        safePostMessage({
            type: 'constructionContractAcceptFailed',
            requestId,
            error: { code: 'shipNotOnDeparturePlanet', params: { planetId: contract.fromPlanetId } },
            processedAtTick: state.tick,
        });
        return;
    }

    const PLACEHOLDER = 'catalog';
    const facilityEntry = Object.values(ALL_PRODUCTION_FACILITY_ENTRIES).find(
        (e) => e.factory(PLACEHOLDER, PLACEHOLDER).name === contract.facilityName,
    );
    if (!facilityEntry) {
        safePostMessage({
            type: 'constructionContractAcceptFailed',
            requestId,
            error: { code: 'unknownFacility', params: { facilityName: contract.facilityName } },
            processedAtTick: state.tick,
        });
        return;
    }

    const facilityId = generateId('cf');
    const facilityBlueprint = facilityEntry.factory(contract.fromPlanetId, facilityId);

    facilityBlueprint.construction = {
        type: 'new',
        constructionTargetMaxScale: 1,
        totalConstructionServiceRequired: 100,
        maximumConstructionServiceConsumption: 10,
        progress: 0,
        lastTickInvestedConstructionServices: 0,
        suspended: false,
    };

    const fulfillmentDueAtTick = state.tick + (contract.expiresAtTick - state.tick);
    posterAssets.constructionContracts[contractIndex] = {
        ...contract,
        status: 'accepted',
        acceptedByAgentId: agentId,
        shipId,
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

    safePostMessage({
        type: 'constructionContractAccepted',
        requestId,
        agentId,
        contractId,
        processedAtTick: state.tick,
    });
}

export function handleCancelConstructionContract(
    state: GameState,
    action: Extract<PendingAction, { type: 'cancelConstructionContract' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, contractId } = action;

    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({
            type: 'constructionContractCancelFailed',
            requestId,
            error: { code: 'agentNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'constructionContractCancelFailed',
            requestId,
            error: { code: 'agentHasNoAssets', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const contractIndex = assets.constructionContracts.findIndex((c) => c.id === contractId);
    if (contractIndex === -1) {
        safePostMessage({
            type: 'constructionContractCancelFailed',
            requestId,
            error: { code: 'contractNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    const contract = assets.constructionContracts[contractIndex];
    if (contract.status !== 'open') {
        safePostMessage({
            type: 'constructionContractCancelFailed',
            requestId,
            error: { code: 'onlyOpenContractsCancellable', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    assets.depositHold -= contract.offeredReward;
    assets.deposits += contract.offeredReward;

    assets.constructionContracts.splice(contractIndex, 1);
    safePostMessage({
        type: 'constructionContractCancelled',
        requestId,
        agentId,
        contractId,
        processedAtTick: state.tick,
    });
}

export function handlePostShipBuyingOffer(
    state: GameState,
    action: Extract<PendingAction, { type: 'postShipBuyingOffer' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, shipType, price } = action;

    const allShipTypeNames = Object.values(shiptypes).flatMap((category) => Object.keys(category));
    if (!allShipTypeNames.includes(shipType)) {
        safePostMessage({
            type: 'shipBuyingOfferPostFailed',
            requestId,
            error: { code: 'unknownShipType', params: { shipType: shipType } },
            processedAtTick: state.tick,
        });
        return;
    }

    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({
            type: 'shipBuyingOfferPostFailed',
            requestId,
            error: { code: 'agentNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'shipBuyingOfferPostFailed',
            requestId,
            error: { code: 'agentHasNoAssets', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    if (assets.deposits < price) {
        safePostMessage({
            type: 'shipBuyingOfferPostFailed',
            requestId,
            error: { code: 'insufficientDepositsToEscrowPrice', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

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
    safePostMessage({ type: 'shipBuyingOfferPosted', requestId, agentId, offerId, processedAtTick: state.tick });
}

export function handleAcceptShipBuyingOffer(
    state: GameState,
    action: Extract<PendingAction, { type: 'acceptShipBuyingOffer' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, posterAgentId, offerId, shipId } = action;

    const sellerAgent = state.agents.get(agentId);
    if (!sellerAgent) {
        safePostMessage({
            type: 'shipBuyingOfferAcceptFailed',
            requestId,
            error: { code: 'agentNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const buyerAgent = state.agents.get(posterAgentId);
    if (!buyerAgent) {
        safePostMessage({
            type: 'shipBuyingOfferAcceptFailed',
            requestId,
            error: { code: 'shipBuyerNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const buyerAssets = buyerAgent.assets[planetId];
    if (!buyerAssets) {
        safePostMessage({
            type: 'shipBuyingOfferAcceptFailed',
            requestId,
            error: { code: 'shipOfferPlanetNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const offerIndex = buyerAssets.shipBuyingOffers.findIndex((o) => o.id === offerId);
    if (offerIndex === -1) {
        safePostMessage({
            type: 'shipBuyingOfferAcceptFailed',
            requestId,
            error: { code: 'shipOfferNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const offer = buyerAssets.shipBuyingOffers[offerIndex];
    if (offer.status !== 'open') {
        safePostMessage({
            type: 'shipBuyingOfferAcceptFailed',
            requestId,
            error: { code: 'shipOfferNotOpen', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const shipIndex = sellerAgent.ships.findIndex((s) => s.id === shipId);
    if (shipIndex === -1) {
        safePostMessage({
            type: 'shipBuyingOfferAcceptFailed',
            requestId,
            error: { code: 'shipNotFound', params: { shipId: shipId } },
            processedAtTick: state.tick,
        });
        return;
    }
    const ship = sellerAgent.ships[shipIndex];
    if (ship.state.type !== 'idle') {
        safePostMessage({
            type: 'shipBuyingOfferAcceptFailed',
            requestId,
            error: { code: 'shipNotIdle', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    if (ship.type.type !== 'transport') {
        safePostMessage({
            type: 'shipBuyingOfferAcceptFailed',
            requestId,
            error: { code: 'onlyTransportShipsSellable', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const shipTypesByKey = Object.fromEntries(Object.values(shiptypes).flatMap((cat) => Object.entries(cat))) as Record<
        string,
        { name: string }
    >;
    const expectedTypeName = shipTypesByKey[offer.shipType]?.name;
    if (!expectedTypeName || ship.type.name !== expectedTypeName) {
        safePostMessage({
            type: 'shipBuyingOfferAcceptFailed',
            requestId,
            error: { code: 'shipTypeMismatch', params: { shipType: ship.type.name, offerShipType: offer.shipType } },
            processedAtTick: state.tick,
        });
        return;
    }
    if (ship.state.planetId !== planetId) {
        safePostMessage({
            type: 'shipBuyingOfferAcceptFailed',
            requestId,
            error: { code: 'shipNotOnOfferPlanet', params: { planetId: planetId } },
            processedAtTick: state.tick,
        });
        return;
    }

    const sellerAssets = sellerAgent.assets[planetId] ?? sellerAgent.assets[sellerAgent.associatedPlanetId];
    if (!sellerAssets) {
        safePostMessage({
            type: 'shipBuyingOfferAcceptFailed',
            requestId,
            error: { code: 'shipSellerNoAssets', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    sellerAgent.ships.splice(shipIndex, 1);
    buyerAgent.ships.push(ship);

    buyerAssets.depositHold -= offer.price;
    sellerAssets.deposits += offer.price;

    buyerAssets.shipBuyingOffers.splice(offerIndex, 1);

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

    safePostMessage({ type: 'shipBuyingOfferAccepted', requestId, agentId, offerId, processedAtTick: state.tick });
}

export function handlePostShipListing(
    state: GameState,
    action: Extract<PendingAction, { type: 'postShipListing' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, shipId, askPrice } = action;

    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({
            type: 'shipListingPostFailed',
            requestId,
            error: { code: 'agentNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'shipListingPostFailed',
            requestId,
            error: { code: 'agentHasNoAssets', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const ship = agent.ships.find((s) => s.id === shipId);
    if (!ship) {
        safePostMessage({
            type: 'shipListingPostFailed',
            requestId,
            error: { code: 'shipNotFound', params: { shipId: shipId } },
            processedAtTick: state.tick,
        });
        return;
    }
    if (ship.state.type === 'derelict') {
        safePostMessage({
            type: 'shipListingPostFailed',
            requestId,
            error: { code: 'shipDerelictNotListable', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    if (ship.state.type !== 'idle') {
        safePostMessage({
            type: 'shipListingPostFailed',
            requestId,
            error: { code: 'shipMustBeIdleToList', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    if (ship.state.planetId !== planetId) {
        safePostMessage({
            type: 'shipListingPostFailed',
            requestId,
            error: { code: 'shipNotOnPlanet', params: { planetId: planetId } },
            processedAtTick: state.tick,
        });
        return;
    }
    if (assets.shipListings.some((l) => l.shipId === shipId)) {
        safePostMessage({
            type: 'shipListingPostFailed',
            requestId,
            error: { code: 'shipAlreadyListed', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const listingId = generateId('sl');
    const listing: ShipListing = {
        id: listingId,
        sellerAgentId: agentId,
        shipId,
        shipName: ship.name,
        shipTypeName: ship.type.name,
        askPrice,
        planetId,
        postedAtTick: state.tick,
    };
    createShipListing(ship, assets, listing);

    safePostMessage({ type: 'shipListingPosted', requestId, agentId, listingId, processedAtTick: state.tick });
}

export function handleCancelShipListing(
    state: GameState,
    action: Extract<PendingAction, { type: 'cancelShipListing' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, listingId } = action;

    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({
            type: 'shipListingCancelFailed',
            requestId,
            error: { code: 'agentNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'shipListingCancelFailed',
            requestId,
            error: { code: 'agentHasNoAssets', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const listingIndex = assets.shipListings.findIndex((l) => l.id === listingId);
    if (listingIndex === -1) {
        safePostMessage({
            type: 'shipListingCancelFailed',
            requestId,
            error: { code: 'shipListingNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const listing = assets.shipListings[listingIndex];
    if (listing.sellerAgentId !== agentId) {
        safePostMessage({
            type: 'shipListingCancelFailed',
            requestId,
            error: { code: 'shipListingNotOwned', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const ship = agent.ships.find((s) => s.id === listing.shipId);
    if (ship && ship.state.type === 'listed') {
        ship.state = { type: 'idle', planetId };
    }

    assets.shipListings.splice(listingIndex, 1);
    safePostMessage({ type: 'shipListingCancelled', requestId, agentId, listingId, processedAtTick: state.tick });
}

export function handleAcceptShipListing(
    state: GameState,
    action: Extract<PendingAction, { type: 'acceptShipListing' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, buyerAgentId, buyerPlanetId, sellerAgentId, listingId } = action;

    const buyerAgent = state.agents.get(buyerAgentId);
    if (!buyerAgent) {
        safePostMessage({
            type: 'shipListingAcceptFailed',
            requestId,
            error: { code: 'shipBuyerNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const sellerAgent = state.agents.get(sellerAgentId);
    if (!sellerAgent) {
        safePostMessage({
            type: 'shipListingAcceptFailed',
            requestId,
            error: { code: 'shipSellerNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const buyerAssets = buyerAgent.assets[buyerPlanetId];
    if (!buyerAssets) {
        safePostMessage({
            type: 'shipListingAcceptFailed',
            requestId,
            error: { code: 'shipBuyerNoAssets', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

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
        safePostMessage({
            type: 'shipListingAcceptFailed',
            requestId,
            error: { code: 'shipListingNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    if (listing.sellerAgentId !== sellerAgentId) {
        safePostMessage({
            type: 'shipListingAcceptFailed',
            requestId,
            error: { code: 'shipSellerMismatch', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const shipIndex = sellerAgent.ships.findIndex((s) => s.id === listing!.shipId);
    if (shipIndex === -1) {
        safePostMessage({
            type: 'shipListingAcceptFailed',
            requestId,
            error: { code: 'shipGone', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    const ship = sellerAgent.ships[shipIndex];
    if (ship.state.type !== 'listed') {
        safePostMessage({
            type: 'shipListingAcceptFailed',
            requestId,
            error: { code: 'shipListingGone', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    if (buyerAssets.deposits < listing.askPrice) {
        safePostMessage({
            type: 'shipListingAcceptFailed',
            requestId,
            error: { code: 'insufficientDeposits', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    sellerAgent.ships.splice(shipIndex, 1);
    ship.state = { type: 'idle', planetId: listing.planetId };
    buyerAgent.ships.push(ship);

    buyerAssets.deposits -= listing.askPrice;
    sellerAssets.deposits += listing.askPrice;

    const listingIndex = sellerAssets.shipListings.indexOf(listing);
    sellerAssets.shipListings.splice(listingIndex, 1);

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

    safePostMessage({ type: 'shipListingAccepted', requestId, buyerAgentId, listingId, processedAtTick: state.tick });
}

export function handleDispatchShip(
    state: GameState,
    action: Extract<PendingAction, { type: 'dispatchShip' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, fromPlanetId, toPlanetId, shipId, cargoGoal } = action;

    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({
            type: 'shipDispatchFailed',
            requestId,
            error: { code: 'agentNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    if (!state.planets.has(toPlanetId)) {
        safePostMessage({
            type: 'shipDispatchFailed',
            requestId,
            error: { code: 'planetNotFound', params: { planetId: toPlanetId } },
            processedAtTick: state.tick,
        });
        return;
    }

    const ship = agent.ships.find((s) => s.id === shipId);
    if (!ship) {
        safePostMessage({
            type: 'shipDispatchFailed',
            requestId,
            error: { code: 'shipNotFound', params: { shipId: shipId } },
            processedAtTick: state.tick,
        });
        return;
    }
    if (ship.state.type !== 'idle') {
        safePostMessage({
            type: 'shipDispatchFailed',
            requestId,
            error: { code: 'shipNotIdle', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    if (ship.state.planetId !== fromPlanetId) {
        safePostMessage({
            type: 'shipDispatchFailed',
            requestId,
            error: { code: 'shipNotOnPlanet', params: { planetId: fromPlanetId } },
            processedAtTick: state.tick,
        });
        return;
    }
    if (ship.type.type !== 'transport') {
        safePostMessage({
            type: 'shipDispatchFailed',
            requestId,
            error: { code: 'onlyTransportShipsSelfDispatch', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    if (cargoGoal) {
        const assets = agent.assets[fromPlanetId];
        if (!assets?.storage) {
            safePostMessage({
                type: 'shipDispatchFailed',
                requestId,
                error: { code: 'noStorageOnDeparturePlanet', params: {} },
                processedAtTick: state.tick,
            });
            return;
        }

        const targetAssets = agent.assets[toPlanetId];
        if (!targetAssets?.storage) {
            safePostMessage({
                type: 'shipDispatchFailed',
                requestId,
                error: { code: 'noStorageOnDestinationPlanet', params: {} },
                processedAtTick: state.tick,
            });
            return;
        }

        const storageTracked = getWholeStorage(assets.storage).some(
            ([resourceName]) => resourceName === cargoGoal.resource.name,
        );
        if (!storageTracked) {
            safePostMessage({
                type: 'shipDispatchFailed',
                requestId,
                error: { code: 'unknownResource', params: { resourceName: cargoGoal.resource.name } },
                processedAtTick: state.tick,
            });
            return;
        }
    }

    ship.state = {
        type: 'loading',
        planetId: fromPlanetId,
        to: toPlanetId,
        cargoGoal,
        currentCargo: cargoGoal ? { resource: cargoGoal.resource, quantity: 0 } : null,
        deadlineTick: state.tick + MAX_DISPATCH_TIMEOUT_TICKS,
    };

    safePostMessage({ type: 'shipDispatched', requestId, agentId, shipId: ship.id, processedAtTick: state.tick });
}

export function handleDispatchPassengerShip(
    state: GameState,
    action: Extract<PendingAction, { type: 'dispatchPassengerShip' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, fromPlanetId, toPlanetId, shipId, passengerCount } = action;

    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({
            type: 'passengerShipDispatchFailed',
            requestId,
            error: { code: 'agentNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    if (!state.planets.has(fromPlanetId)) {
        safePostMessage({
            type: 'passengerShipDispatchFailed',
            requestId,
            error: { code: 'sourcePlanetNotFound', params: { planetId: fromPlanetId } },
            processedAtTick: state.tick,
        });
        return;
    }

    if (!state.planets.has(toPlanetId)) {
        safePostMessage({
            type: 'passengerShipDispatchFailed',
            requestId,
            error: { code: 'planetNotFound', params: { planetId: toPlanetId } },
            processedAtTick: state.tick,
        });
        return;
    }

    const ship = agent.ships.find((s) => s.id === shipId);
    if (!ship) {
        safePostMessage({
            type: 'passengerShipDispatchFailed',
            requestId,
            error: { code: 'shipNotFound', params: { shipId: shipId } },
            processedAtTick: state.tick,
        });
        return;
    }
    if (ship.state.type !== 'idle') {
        safePostMessage({
            type: 'passengerShipDispatchFailed',
            requestId,
            error: { code: 'shipNotIdle', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    if (ship.state.planetId !== fromPlanetId) {
        safePostMessage({
            type: 'passengerShipDispatchFailed',
            requestId,
            error: { code: 'shipNotOnPlanet', params: { planetId: fromPlanetId } },
            processedAtTick: state.tick,
        });
        return;
    }
    if (ship.type.type !== 'passenger') {
        safePostMessage({
            type: 'passengerShipDispatchFailed',
            requestId,
            error: { code: 'onlyPassengerShips', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    if (!Number.isFinite(passengerCount)) {
        safePostMessage({
            type: 'passengerShipDispatchFailed',
            requestId,
            error: { code: 'passengerCountInvalid', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const targetAssets = agent.assets[toPlanetId];
    if (!targetAssets?.licenses?.commercial) {
        safePostMessage({
            type: 'passengerShipDispatchFailed',
            requestId,
            error: { code: 'noCommercialLicenseOnDestination', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const requestedPassengers = Math.floor(passengerCount);
    if (requestedPassengers < 0) {
        safePostMessage({
            type: 'passengerShipDispatchFailed',
            requestId,
            error: { code: 'passengerCountNegative', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const capacity = ship.type.passengerCapacity;
    const goal = Math.min(requestedPassengers, capacity);

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

    safePostMessage({
        type: 'passengerShipDispatched',
        requestId,
        agentId,
        shipId: ship.id,
        processedAtTick: state.tick,
    });
}

export function handleDispatchConstructionShip(
    state: GameState,
    action: Extract<PendingAction, { type: 'dispatchConstructionShip' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, fromPlanetId, toPlanetId, shipId, facilityName } = action;

    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({
            type: 'constructionShipDispatchFailed',
            requestId,
            error: { code: 'agentNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    if (!state.planets.has(toPlanetId)) {
        safePostMessage({
            type: 'constructionShipDispatchFailed',
            requestId,
            error: { code: 'planetNotFound', params: { planetId: toPlanetId } },
            processedAtTick: state.tick,
        });
        return;
    }

    const ship = agent.ships.find((s) => s.id === shipId);
    if (!ship) {
        safePostMessage({
            type: 'constructionShipDispatchFailed',
            requestId,
            error: { code: 'shipNotFound', params: { shipId: shipId } },
            processedAtTick: state.tick,
        });
        return;
    }
    if (ship.state.type !== 'idle') {
        safePostMessage({
            type: 'constructionShipDispatchFailed',
            requestId,
            error: { code: 'shipNotIdle', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }
    if (ship.state.planetId !== fromPlanetId) {
        safePostMessage({
            type: 'constructionShipDispatchFailed',
            requestId,
            error: { code: 'shipNotOnPlanet', params: { planetId: fromPlanetId } },
            processedAtTick: state.tick,
        });
        return;
    }
    if (ship.type.type !== 'construction') {
        safePostMessage({
            type: 'constructionShipDispatchFailed',
            requestId,
            error: { code: 'onlyConstructionShipsForConstruction', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const targetAssets = agent.assets[toPlanetId];
    if (!targetAssets?.licenses?.workforce) {
        safePostMessage({
            type: 'constructionShipDispatchFailed',
            requestId,
            error: { code: 'noWorkforceLicenseOnDestination', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const PLACEHOLDER = 'catalog';
    const facilityEntry = facilityName
        ? Object.values(ALL_PRODUCTION_FACILITY_ENTRIES).find(
              (e) => e.factory(PLACEHOLDER, PLACEHOLDER).name === facilityName,
          )
        : undefined;
    if (facilityName && !facilityEntry) {
        safePostMessage({
            type: 'constructionShipDispatchFailed',
            requestId,
            error: { code: 'unknownFacility', params: { facilityName: facilityName } },
            processedAtTick: state.tick,
        });
        return;
    }

    let facilityBlueprint: Facility | null = null;
    if (facilityEntry) {
        const facilityId = generateId('cf');
        facilityBlueprint = facilityEntry.factory(fromPlanetId, facilityId);
        facilityBlueprint.construction = {
            type: 'new',
            constructionTargetMaxScale: 1,
            totalConstructionServiceRequired: 100,
            maximumConstructionServiceConsumption: 10,
            progress: 0,
            lastTickInvestedConstructionServices: 0,
            suspended: false,
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

    safePostMessage({
        type: 'constructionShipDispatched',
        requestId,
        agentId,
        shipId: ship.id,
        processedAtTick: state.tick,
    });
}
