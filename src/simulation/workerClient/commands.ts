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
    leaseClaimSpec,
    quitClaimSpec,
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
