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
    claimResourcesSpec,
    buildFacilitySpec,
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

export function workerClaimResources(opts: {
    agentId: string;
    planetId: string;
    arableLandQuantity: number;
    waterSourceQuantity: number;
    timeoutMs?: number;
}): Promise<{ arableClaimId: string; waterClaimId: string }> {
    const { agentId, planetId, arableLandQuantity, waterSourceQuantity, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'claimResources', requestId: randomUUID(), agentId, planetId, arableLandQuantity, waterSourceQuantity },
        claimResourcesSpec,
        timeoutMs,
    );
}

export function workerBuildFacility(opts: {
    agentId: string;
    planetId: string;
    facilityKey: string;
    timeoutMs?: number;
}): Promise<string> {
    const { agentId, planetId, facilityKey, timeoutMs } = opts;
    return sendCommandSpec(
        { type: 'buildFacility', requestId: randomUUID(), agentId, planetId, facilityKey },
        buildFacilitySpec,
        timeoutMs,
    );
}
