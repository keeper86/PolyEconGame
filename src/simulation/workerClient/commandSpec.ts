import type { InboundMessage, OutboundMessage } from './messages';

/**
 * Binds a command's inbound message, success response, failure response, and
 * result extractor into a single cohesive unit.
 *
 * Having all four pieces co-located makes it impossible to accidentally wire
 * an inbound message to the wrong response types.
 */
export interface CommandSpec<
    _TInbound extends InboundMessage & { requestId: string },
    TSuccess extends OutboundMessage & { requestId: string },
    TFailure extends OutboundMessage & { requestId: string; reason: string },
    TResult,
> {
    readonly successType: TSuccess['type'];
    readonly failureType: TFailure['type'];
    readonly extract: (msg: TSuccess) => TResult;
}

type CreateAgentSuccess = Extract<OutboundMessage, { type: 'agentCreated' }>;
type CreateAgentFailure = Extract<OutboundMessage, { type: 'agentCreationFailed' }>;
export const createAgentSpec: CommandSpec<
    Extract<InboundMessage, { type: 'createAgent' }>,
    CreateAgentSuccess,
    CreateAgentFailure,
    string
> = {
    successType: 'agentCreated',
    failureType: 'agentCreationFailed',
    extract: (msg) => msg.agentId,
};

type RequestLoanSuccess = Extract<OutboundMessage, { type: 'loanGranted' }>;
type RequestLoanFailure = Extract<OutboundMessage, { type: 'loanDenied' }>;
export const requestLoanSpec: CommandSpec<
    Extract<InboundMessage, { type: 'requestLoan' }>,
    RequestLoanSuccess,
    RequestLoanFailure,
    number
> = {
    successType: 'loanGranted',
    failureType: 'loanDenied',
    extract: (msg) => msg.amount,
};

type SetAutomationSuccess = Extract<OutboundMessage, { type: 'automationSet' }>;
type SetAutomationFailure = Extract<OutboundMessage, { type: 'automationFailed' }>;
export const setAutomationSpec: CommandSpec<
    Extract<InboundMessage, { type: 'setAutomation' }>,
    SetAutomationSuccess,
    SetAutomationFailure,
    void
> = {
    successType: 'automationSet',
    failureType: 'automationFailed',
    extract: () => undefined,
};

type SetWorkerAllocationSuccess = Extract<OutboundMessage, { type: 'workerAllocationSet' }>;
type SetWorkerAllocationFailure = Extract<OutboundMessage, { type: 'workerAllocationFailed' }>;
export const setWorkerAllocationTargetsSpec: CommandSpec<
    Extract<InboundMessage, { type: 'setWorkerAllocationTargets' }>,
    SetWorkerAllocationSuccess,
    SetWorkerAllocationFailure,
    void
> = {
    successType: 'workerAllocationSet',
    failureType: 'workerAllocationFailed',
    extract: () => undefined,
};

type SetSellOffersSuccess = Extract<OutboundMessage, { type: 'sellOffersSet' }>;
type SetSellOffersFailure = Extract<OutboundMessage, { type: 'sellOffersFailed' }>;
export const setSellOffersSpec: CommandSpec<
    Extract<InboundMessage, { type: 'setSellOffers' }>,
    SetSellOffersSuccess,
    SetSellOffersFailure,
    void
> = {
    successType: 'sellOffersSet',
    failureType: 'sellOffersFailed',
    extract: () => undefined,
};

type SetBuyBidsSuccess = Extract<OutboundMessage, { type: 'buyBidsSet' }>;
type SetBuyBidsFailure = Extract<OutboundMessage, { type: 'buyBidsFailed' }>;
export const setBuyBidsSpec: CommandSpec<
    Extract<InboundMessage, { type: 'setBuyBids' }>,
    SetBuyBidsSuccess,
    SetBuyBidsFailure,
    void
> = {
    successType: 'buyBidsSet',
    failureType: 'buyBidsFailed',
    extract: () => undefined,
};

type ClaimResourcesSuccess = Extract<OutboundMessage, { type: 'resourcesClaimed' }>;
type ClaimResourcesFailure = Extract<OutboundMessage, { type: 'resourcesClaimFailed' }>;
export const claimResourcesSpec: CommandSpec<
    Extract<InboundMessage, { type: 'claimResources' }>,
    ClaimResourcesSuccess,
    ClaimResourcesFailure,
    { arableClaimId: string; waterClaimId: string }
> = {
    successType: 'resourcesClaimed',
    failureType: 'resourcesClaimFailed',
    extract: (msg) => ({ arableClaimId: msg.arableClaimId, waterClaimId: msg.waterClaimId }),
};

type BuildFacilitySuccess = Extract<OutboundMessage, { type: 'facilityBuilt' }>;
type BuildFacilityFailure = Extract<OutboundMessage, { type: 'facilityBuildFailed' }>;
export const buildFacilitySpec: CommandSpec<
    Extract<InboundMessage, { type: 'buildFacility' }>,
    BuildFacilitySuccess,
    BuildFacilityFailure,
    string
> = {
    successType: 'facilityBuilt',
    failureType: 'facilityBuildFailed',
    extract: (msg) => msg.facilityId,
};
