import { randomUUID } from 'node:crypto';
import type { ResourceQuantity } from '../planet/claims';
import {
    acceptConstructionContractSpec,
    acceptShipBuyingOfferSpec,
    acceptShipListingSpec,
    acceptTransportContractSpec,
    acquireLicenseSpec,
    buildFacilitySpec,
    buildShipConstructionFacilitySpec,
    cancelBuyBidSpec,
    cancelConstructionContractSpec,
    cancelConstructionSpec,
    cancelSellOfferSpec,
    cancelShipListingSpec,
    cancelTransportContractSpec,
    createAgentSpec,
    dispatchConstructionShipSpec,
    dispatchPassengerShipSpec,
    dispatchShipSpec,
    expandFacilitySpec,
    expandShipConstructionFacilitySpec,
    leaseClaimSpec,
    postConstructionContractSpec,
    postShipBuyingOfferSpec,
    postShipListingSpec,
    postTransportContractSpec,
    quitClaimSpec,
    repayLoanSpec,
    requestLoanSpec,
    setAutomationSpec,
    setBuyBidsSpec,
    setFacilityScaleSpec,
    setSellOffersSpec,
    setShipConstructionTargetSpec,
    setWorkerAllocationTargetsSpec,
} from './commandSpec';
import { sendCommandSpec } from './transport';

export function workerCreateAgent(opts: {
    agentId: string;
    agentName: string;
    planetId: string;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, agentName, planetId, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'createAgent', requestId: randomUUID(), agentId, agentName, planetId },
        createAgentSpec,
        timeoutMs,
    );
}

export function workerRequestLoan(opts: {
    agentId: string;
    planetId: string;
    amount: number;
    timeoutMs?: number;
}): Promise<number> {
    const { agentId, planetId, amount, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'requestLoan', requestId: randomUUID(), agentId, planetId, amount },
        requestLoanSpec,
        timeoutMs,
    );
}

export function workerRepayLoan(opts: {
    agentId: string;
    planetId: string;
    loanId: string;
    fraction: 0.25 | 0.5 | 1;
    timeoutMs?: number;
}): Promise<number> {
    const { agentId, planetId, loanId, fraction, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'repayLoan', requestId: randomUUID(), agentId, planetId, loanId, fraction },
        repayLoanSpec,
        timeoutMs,
    );
}

export function workerSetAutomation(opts: {
    agentId: string;
    automateWorkerAllocation: boolean;
    timeoutMs?: number;
}): Promise<void> {
    const { agentId, automateWorkerAllocation, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'setAutomation', requestId: randomUUID(), agentId, automateWorkerAllocation },
        setAutomationSpec,
        timeoutMs,
    );
}

export function workerSetWorkerAllocationTargets(opts: {
    agentId: string;
    planetId: string;
    targets: Partial<Record<string, number>>;
    timeoutMs?: number;
}): Promise<void> {
    const { agentId, planetId, targets, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'setWorkerAllocationTargets', requestId: randomUUID(), agentId, planetId, targets },
        setWorkerAllocationTargetsSpec,
        timeoutMs,
    );
}

export function workerSetSellOffers(opts: {
    agentId: string;
    planetId: string;
    offers: Record<string, { offerPrice?: number; offerRetainment?: number; automated?: boolean }>;
    timeoutMs?: number;
}): Promise<void> {
    const { agentId, planetId, offers, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'setSellOffers', requestId: randomUUID(), agentId, planetId, offers },
        setSellOffersSpec,
        timeoutMs,
    );
}

export function workerCancelSellOffer(opts: {
    agentId: string;
    planetId: string;
    resourceName: string;
    timeoutMs?: number;
}): Promise<void> {
    const { agentId, planetId, resourceName, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'cancelSellOffer', requestId: randomUUID(), agentId, planetId, resourceName },
        cancelSellOfferSpec,
        timeoutMs,
    );
}

export function workerCancelBuyBid(opts: {
    agentId: string;
    planetId: string;
    resourceName: string;
    timeoutMs?: number;
}): Promise<void> {
    const { agentId, planetId, resourceName, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'cancelBuyBid', requestId: randomUUID(), agentId, planetId, resourceName },
        cancelBuyBidSpec,
        timeoutMs,
    );
}

export function workerSetBuyBids(opts: {
    agentId: string;
    planetId: string;
    bids: Record<string, { bidPrice?: number; bidStorageTarget?: number; automated?: boolean }>;
    timeoutMs?: number;
}): Promise<void> {
    const { agentId, planetId, bids, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'setBuyBids', requestId: randomUUID(), agentId, planetId, bids },
        setBuyBidsSpec,
        timeoutMs,
    );
}

export function workerBuildFacility(opts: {
    agentId: string;
    planetId: string;
    facilityKey: string;
    targetScale: number;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, facilityKey, targetScale, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'buildFacility', requestId: randomUUID(), agentId, planetId, facilityKey, targetScale },
        buildFacilitySpec,
        timeoutMs,
    );
}

export function workerExpandFacility(opts: {
    agentId: string;
    planetId: string;
    facilityId: string;
    targetScale: number;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, facilityId, targetScale, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'expandFacility', requestId: randomUUID(), agentId, planetId, facilityId, targetScale },
        expandFacilitySpec,
        timeoutMs,
    );
}

export function workerSetFacilityScale(opts: {
    agentId: string;
    planetId: string;
    facilityId: string;
    scaleFraction: number;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, facilityId, scaleFraction, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'setFacilityScale', requestId: randomUUID(), agentId, planetId, facilityId, scaleFraction },
        setFacilityScaleSpec,
        timeoutMs,
    );
}

export function workerLeaseClaim(opts: {
    agentId: string;
    planetId: string;
    resourceName: string;
    quantity: number;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, resourceName, quantity, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'leaseClaim', requestId: randomUUID(), agentId, planetId, resourceName, quantity },
        leaseClaimSpec,
        timeoutMs,
    );
}

export function workerQuitClaim(opts: {
    agentId: string;
    planetId: string;
    claimId: string;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, claimId, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'quitClaim', requestId: randomUUID(), agentId, planetId, claimId },
        quitClaimSpec,
        timeoutMs,
    );
}

export function workerPostTransportContract(opts: {
    agentId: string;
    planetId: string;
    toPlanetId: string;
    cargo: ResourceQuantity;
    maxDurationInTicks: number;
    offeredReward: number;
    expiresAtTick: number;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, toPlanetId, cargo, maxDurationInTicks, offeredReward, expiresAtTick, timeoutMs } = opts;
    return sendCommandSpec(
        {
            type: 'postTransportContract',
            requestId: randomUUID(),
            agentId,
            planetId,
            toPlanetId,
            cargo,
            maxDurationInTicks,
            offeredReward,
            expiresAtTick,
        },
        postTransportContractSpec,
        timeoutMs,
    );
}

export function workerAcceptTransportContract(opts: {
    agentId: string;
    planetId: string;
    posterAgentId: string;
    contractId: string;
    shipId: string;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, posterAgentId, contractId, shipId, timeoutMs } = opts;
    return sendCommandSpec(
        {
            type: 'acceptTransportContract',
            requestId: randomUUID(),
            agentId,
            planetId,
            posterAgentId,
            contractId,
            shipId,
        },
        acceptTransportContractSpec,
        timeoutMs,
    );
}

export function workerCancelTransportContract(opts: {
    agentId: string;
    planetId: string;
    contractId: string;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, contractId, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'cancelTransportContract', requestId: randomUUID(), agentId, planetId, contractId },
        cancelTransportContractSpec,
        timeoutMs,
    );
}

export function workerPostConstructionContract(opts: {
    agentId: string;
    planetId: string;
    toPlanetId: string;
    facilityName: string;
    commissioningAgentId: string;
    offeredReward: number;
    expiresAtTick: number;
    timeoutMs?: number;
}): Promise<string> {
    const {
        agentId,
        planetId,
        toPlanetId,
        facilityName,
        commissioningAgentId,
        offeredReward,
        expiresAtTick,
        timeoutMs,
    } = opts;
    return sendCommandSpec(
        {
            type: 'postConstructionContract',
            requestId: randomUUID(),
            agentId,
            planetId,
            toPlanetId,
            facilityName,
            commissioningAgentId,
            offeredReward,
            expiresAtTick,
        },
        postConstructionContractSpec,
        timeoutMs,
    );
}

export function workerAcceptConstructionContract(opts: {
    agentId: string;
    planetId: string;
    posterAgentId: string;
    contractId: string;
    shipId: string;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, posterAgentId, contractId, shipId, timeoutMs } = opts;
    return sendCommandSpec(
        {
            type: 'acceptConstructionContract',
            requestId: randomUUID(),
            agentId,
            planetId,
            posterAgentId,
            contractId,
            shipId,
        },
        acceptConstructionContractSpec,
        timeoutMs,
    );
}

export function workerCancelConstructionContract(opts: {
    agentId: string;
    planetId: string;
    contractId: string;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, contractId, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'cancelConstructionContract', requestId: randomUUID(), agentId, planetId, contractId },
        cancelConstructionContractSpec,
        timeoutMs,
    );
}

export function workerPostShipBuyingOffer(opts: {
    agentId: string;
    planetId: string;
    shipType: string;
    price: number;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, shipType, price, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'postShipBuyingOffer', requestId: randomUUID(), agentId, planetId, shipType, price },
        postShipBuyingOfferSpec,
        timeoutMs,
    );
}

export function workerAcceptShipBuyingOffer(opts: {
    agentId: string;
    planetId: string;
    posterAgentId: string;
    offerId: string;
    shipId: string;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, posterAgentId, offerId, shipId, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'acceptShipBuyingOffer', requestId: randomUUID(), agentId, planetId, posterAgentId, offerId, shipId },
        acceptShipBuyingOfferSpec,
        timeoutMs,
    );
}

export function workerBuildShipConstructionFacility(opts: {
    agentId: string;
    planetId: string;
    facilityName: string;
    targetScale: number;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, facilityName, targetScale, timeoutMs } = opts;
    return sendCommandSpec(
        {
            type: 'buildShipConstructionFacility',
            requestId: randomUUID(),
            agentId,
            planetId,
            facilityName,
            targetScale,
        },
        buildShipConstructionFacilitySpec,
        timeoutMs,
    );
}

export function workerExpandShipConstructionFacility(opts: {
    agentId: string;
    planetId: string;
    facilityId: string;
    targetScale: number;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, facilityId, targetScale, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'expandShipConstructionFacility', requestId: randomUUID(), agentId, planetId, facilityId, targetScale },
        expandShipConstructionFacilitySpec,
        timeoutMs,
    );
}

export function workerSetShipConstructionTarget(opts: {
    agentId: string;
    planetId: string;
    facilityId: string;
    shipTypeName: string | null;
    shipName: string;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, facilityId, shipTypeName, shipName, timeoutMs } = opts;
    return sendCommandSpec(
        {
            type: 'setShipConstructionTarget',
            requestId: randomUUID(),
            agentId,
            planetId,
            facilityId,
            shipTypeName,
            shipName,
        },
        setShipConstructionTargetSpec,
        timeoutMs,
    );
}

export function workerPostShipListing(opts: {
    agentId: string;
    planetId: string;
    shipId: string;
    askPrice: number;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, shipId, askPrice, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'postShipListing', requestId: randomUUID(), agentId, planetId, shipId, askPrice },
        postShipListingSpec,
        timeoutMs,
    );
}

export function workerCancelShipListing(opts: {
    agentId: string;
    planetId: string;
    listingId: string;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, listingId, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'cancelShipListing', requestId: randomUUID(), agentId, planetId, listingId },
        cancelShipListingSpec,
        timeoutMs,
    );
}

export function workerAcceptShipListing(opts: {
    buyerAgentId: string;
    buyerPlanetId: string;
    sellerAgentId: string;
    listingId: string;
    timeoutMs?: number;
}): Promise<string> {
    const { buyerAgentId, buyerPlanetId, sellerAgentId, listingId, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'acceptShipListing', requestId: randomUUID(), buyerAgentId, buyerPlanetId, sellerAgentId, listingId },
        acceptShipListingSpec,
        timeoutMs,
    );
}

export function workerDispatchShip(opts: {
    agentId: string;
    fromPlanetId: string;
    toPlanetId: string;
    shipId: string;
    cargoGoal: ResourceQuantity | null;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, fromPlanetId, toPlanetId, shipId, cargoGoal, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'dispatchShip', requestId: randomUUID(), agentId, fromPlanetId, toPlanetId, shipId, cargoGoal },
        dispatchShipSpec,
        timeoutMs,
    );
}

export function workerDispatchConstructionShip(opts: {
    agentId: string;
    fromPlanetId: string;
    toPlanetId: string;
    shipId: string;
    facilityName?: string;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, fromPlanetId, toPlanetId, shipId, facilityName, timeoutMs } = opts;
    return sendCommandSpec(
        {
            type: 'dispatchConstructionShip',
            requestId: randomUUID(),
            agentId,
            fromPlanetId,
            toPlanetId,
            shipId,
            facilityName,
        },
        dispatchConstructionShipSpec,
        timeoutMs,
    );
}

export function workerDispatchPassengerShip(opts: {
    agentId: string;
    fromPlanetId: string;
    toPlanetId: string;
    shipId: string;
    passengerCount: number;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, fromPlanetId, toPlanetId, shipId, passengerCount, timeoutMs } = opts;
    return sendCommandSpec(
        {
            type: 'dispatchPassengerShip',
            requestId: randomUUID(),
            agentId,
            fromPlanetId,
            toPlanetId,
            shipId,
            passengerCount,
        },
        dispatchPassengerShipSpec,
        timeoutMs,
    );
}

export function workerAcquireLicense(opts: {
    agentId: string;
    planetId: string;
    licenseType: 'commercial' | 'workforce';
    timeoutMs?: number;
}): Promise<{ agentId: string; planetId: string; licenseType: 'commercial' | 'workforce' }> {
    const { agentId, planetId, licenseType, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'acquireLicense', requestId: randomUUID(), agentId, planetId, licenseType },
        acquireLicenseSpec,
        timeoutMs,
    );
}

export function workerCancelConstruction(opts: {
    agentId: string;
    planetId: string;
    facilityId: string;
    timeoutMs?: number;
}): Promise<void> {
    const { agentId, planetId, facilityId, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'cancelConstruction', requestId: randomUUID(), agentId, planetId, facilityId },
        cancelConstructionSpec,
        timeoutMs,
    );
}
