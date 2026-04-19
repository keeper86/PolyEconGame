import { randomUUID } from 'node:crypto';
import { sendCommandSpec } from './transport';
import {
    createAgentSpec,
    requestLoanSpec,
    setAutomationSpec,
    setWorkerAllocationTargetsSpec,
    setSellOffersSpec,
    cancelSellOfferSpec,
    cancelBuyBidSpec,
    setBuyBidsSpec,
    buildFacilitySpec,
    expandFacilitySpec,
    setFacilityScaleSpec,
    leaseClaimSpec,
    quitClaimSpec,
    postTransportContractSpec,
    acceptTransportContractSpec,
    cancelTransportContractSpec,
    postShipBuyingOfferSpec,
    acceptShipBuyingOfferSpec,
    setShipMaintenanceSpec,
    cancelShipMaintenanceSpec,
    buildShipyardSpec,
    expandShipyardSpec,
    setShipyardModeSpec,
} from './commandSpec';

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
    cargo: { resourceName: string; quantity: number };
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
    shipName: string;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, posterAgentId, contractId, shipName, timeoutMs } = opts;
    return sendCommandSpec(
        {
            type: 'acceptTransportContract',
            requestId: randomUUID(),
            agentId,
            planetId,
            posterAgentId,
            contractId,
            shipName,
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
    shipName: string;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, posterAgentId, offerId, shipName, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'acceptShipBuyingOffer', requestId: randomUUID(), agentId, planetId, posterAgentId, offerId, shipName },
        acceptShipBuyingOfferSpec,
        timeoutMs,
    );
}

export function workerSetShipMaintenance(opts: {
    agentId: string;
    planetId: string;
    shipName: string;
    timeoutMs?: number;
}): Promise<void> {
    const { agentId, planetId, shipName, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'setShipMaintenance', requestId: randomUUID(), agentId, planetId, shipName },
        setShipMaintenanceSpec,
        timeoutMs,
    );
}

export function workerCancelShipMaintenance(opts: {
    agentId: string;
    planetId: string;
    shipName: string;
    timeoutMs?: number;
}): Promise<void> {
    const { agentId, planetId, shipName, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'cancelShipMaintenance', requestId: randomUUID(), agentId, planetId, shipName },
        cancelShipMaintenanceSpec,
        timeoutMs,
    );
}

export function workerBuildShipyard(opts: {
    agentId: string;
    planetId: string;
    shipyardName: string;
    targetScale: number;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, shipyardName, targetScale, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'buildShipyard', requestId: randomUUID(), agentId, planetId, shipyardName, targetScale },
        buildShipyardSpec,
        timeoutMs,
    );
}

export function workerExpandShipyard(opts: {
    agentId: string;
    planetId: string;
    facilityId: string;
    targetScale: number;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, facilityId, targetScale, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'expandShipyard', requestId: randomUUID(), agentId, planetId, facilityId, targetScale },
        expandShipyardSpec,
        timeoutMs,
    );
}

export function workerSetShipyardMode(
    opts: {
        agentId: string;
        planetId: string;
        facilityId: string;
        timeoutMs?: number;
    } & (
        | { mode: 'building'; shipTypeName: string; shipName: string }
        | { mode: 'maintenance'; shipTypeName: string }
        | { mode: 'idle' }
    ),
): Promise<string> {
    const { agentId, planetId, facilityId, timeoutMs } = opts;
    const modePayload =
        opts.mode === 'building'
            ? ({ mode: 'building', shipTypeName: opts.shipTypeName, shipName: opts.shipName } as const)
            : opts.mode === 'maintenance'
              ? ({ mode: 'maintenance', shipTypeName: opts.shipTypeName } as const)
              : ({ mode: 'idle' } as const);
    return sendCommandSpec(
        { type: 'setShipyardMode', requestId: randomUUID(), agentId, planetId, facilityId, ...modePayload },
        setShipyardModeSpec,
        timeoutMs,
    );
}
