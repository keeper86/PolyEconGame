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

type CancelSellOfferSuccess = Extract<OutboundMessage, { type: 'sellOfferCancelled' }>;
type CancelSellOfferFailure = Extract<OutboundMessage, { type: 'sellOfferCancelFailed' }>;
export const cancelSellOfferSpec: CommandSpec<
    Extract<InboundMessage, { type: 'cancelSellOffer' }>,
    CancelSellOfferSuccess,
    CancelSellOfferFailure,
    void
> = {
    successType: 'sellOfferCancelled',
    failureType: 'sellOfferCancelFailed',
    extract: () => undefined,
};

type CancelBuyBidSuccess = Extract<OutboundMessage, { type: 'buyBidCancelled' }>;
type CancelBuyBidFailure = Extract<OutboundMessage, { type: 'buyBidCancelFailed' }>;
export const cancelBuyBidSpec: CommandSpec<
    Extract<InboundMessage, { type: 'cancelBuyBid' }>,
    CancelBuyBidSuccess,
    CancelBuyBidFailure,
    void
> = {
    successType: 'buyBidCancelled',
    failureType: 'buyBidCancelFailed',
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

type ExpandFacilitySuccess = Extract<OutboundMessage, { type: 'facilityExpanded' }>;
type ExpandFacilityFailure = Extract<OutboundMessage, { type: 'facilityExpandFailed' }>;
export const expandFacilitySpec: CommandSpec<
    Extract<InboundMessage, { type: 'expandFacility' }>,
    ExpandFacilitySuccess,
    ExpandFacilityFailure,
    string
> = {
    successType: 'facilityExpanded',
    failureType: 'facilityExpandFailed',
    extract: (msg) => msg.facilityId,
};

type SetFacilityScaleSuccess = Extract<OutboundMessage, { type: 'facilityScaleSet' }>;
type SetFacilityScaleFailure = Extract<OutboundMessage, { type: 'facilityScaleSetFailed' }>;
export const setFacilityScaleSpec: CommandSpec<
    Extract<InboundMessage, { type: 'setFacilityScale' }>,
    SetFacilityScaleSuccess,
    SetFacilityScaleFailure,
    string
> = {
    successType: 'facilityScaleSet',
    failureType: 'facilityScaleSetFailed',
    extract: (msg) => msg.facilityId,
};

type LeaseClaimSuccess = Extract<OutboundMessage, { type: 'claimLeased' }>;
type LeaseClaimFailure = Extract<OutboundMessage, { type: 'claimLeaseFailed' }>;
export const leaseClaimSpec: CommandSpec<
    Extract<InboundMessage, { type: 'leaseClaim' }>,
    LeaseClaimSuccess,
    LeaseClaimFailure,
    string
> = {
    successType: 'claimLeased',
    failureType: 'claimLeaseFailed',
    extract: (msg) => msg.claimId,
};

type QuitClaimSuccess = Extract<OutboundMessage, { type: 'claimQuit' }>;
type QuitClaimFailure = Extract<OutboundMessage, { type: 'claimQuitFailed' }>;
export const quitClaimSpec: CommandSpec<
    Extract<InboundMessage, { type: 'quitClaim' }>,
    QuitClaimSuccess,
    QuitClaimFailure,
    string
> = {
    successType: 'claimQuit',
    failureType: 'claimQuitFailed',
    extract: (msg) => msg.claimId,
};

// --- Ship contract specs ---

type PostTransportContractSuccess = Extract<OutboundMessage, { type: 'transportContractPosted' }>;
type PostTransportContractFailure = Extract<OutboundMessage, { type: 'transportContractPostFailed' }>;
export const postTransportContractSpec: CommandSpec<
    Extract<InboundMessage, { type: 'postTransportContract' }>,
    PostTransportContractSuccess,
    PostTransportContractFailure,
    string
> = {
    successType: 'transportContractPosted',
    failureType: 'transportContractPostFailed',
    extract: (msg) => msg.contractId,
};

type AcceptTransportContractSuccess = Extract<OutboundMessage, { type: 'transportContractAccepted' }>;
type AcceptTransportContractFailure = Extract<OutboundMessage, { type: 'transportContractAcceptFailed' }>;
export const acceptTransportContractSpec: CommandSpec<
    Extract<InboundMessage, { type: 'acceptTransportContract' }>,
    AcceptTransportContractSuccess,
    AcceptTransportContractFailure,
    string
> = {
    successType: 'transportContractAccepted',
    failureType: 'transportContractAcceptFailed',
    extract: (msg) => msg.contractId,
};

type CancelTransportContractSuccess = Extract<OutboundMessage, { type: 'transportContractCancelled' }>;
type CancelTransportContractFailure = Extract<OutboundMessage, { type: 'transportContractCancelFailed' }>;
export const cancelTransportContractSpec: CommandSpec<
    Extract<InboundMessage, { type: 'cancelTransportContract' }>,
    CancelTransportContractSuccess,
    CancelTransportContractFailure,
    string
> = {
    successType: 'transportContractCancelled',
    failureType: 'transportContractCancelFailed',
    extract: (msg) => msg.contractId,
};

type PostShipBuyingOfferSuccess = Extract<OutboundMessage, { type: 'shipBuyingOfferPosted' }>;
type PostShipBuyingOfferFailure = Extract<OutboundMessage, { type: 'shipBuyingOfferPostFailed' }>;
export const postShipBuyingOfferSpec: CommandSpec<
    Extract<InboundMessage, { type: 'postShipBuyingOffer' }>,
    PostShipBuyingOfferSuccess,
    PostShipBuyingOfferFailure,
    string
> = {
    successType: 'shipBuyingOfferPosted',
    failureType: 'shipBuyingOfferPostFailed',
    extract: (msg) => msg.offerId,
};

type AcceptShipBuyingOfferSuccess = Extract<OutboundMessage, { type: 'shipBuyingOfferAccepted' }>;
type AcceptShipBuyingOfferFailure = Extract<OutboundMessage, { type: 'shipBuyingOfferAcceptFailed' }>;
export const acceptShipBuyingOfferSpec: CommandSpec<
    Extract<InboundMessage, { type: 'acceptShipBuyingOffer' }>,
    AcceptShipBuyingOfferSuccess,
    AcceptShipBuyingOfferFailure,
    string
> = {
    successType: 'shipBuyingOfferAccepted',
    failureType: 'shipBuyingOfferAcceptFailed',
    extract: (msg) => msg.offerId,
};

type PostShipMaintenanceOfferSuccess = Extract<OutboundMessage, { type: 'shipMaintenanceOfferPosted' }>;
type PostShipMaintenanceOfferFailure = Extract<OutboundMessage, { type: 'shipMaintenanceOfferPostFailed' }>;
export const postShipMaintenanceOfferSpec: CommandSpec<
    Extract<InboundMessage, { type: 'postShipMaintenanceOffer' }>,
    PostShipMaintenanceOfferSuccess,
    PostShipMaintenanceOfferFailure,
    string
> = {
    successType: 'shipMaintenanceOfferPosted',
    failureType: 'shipMaintenanceOfferPostFailed',
    extract: (msg) => msg.offerId,
};

type AcceptShipMaintenanceOfferSuccess = Extract<OutboundMessage, { type: 'shipMaintenanceOfferAccepted' }>;
type AcceptShipMaintenanceOfferFailure = Extract<OutboundMessage, { type: 'shipMaintenanceOfferAcceptFailed' }>;
export const acceptShipMaintenanceOfferSpec: CommandSpec<
    Extract<InboundMessage, { type: 'acceptShipMaintenanceOffer' }>,
    AcceptShipMaintenanceOfferSuccess,
    AcceptShipMaintenanceOfferFailure,
    string
> = {
    successType: 'shipMaintenanceOfferAccepted',
    failureType: 'shipMaintenanceOfferAcceptFailed',
    extract: (msg) => msg.offerId,
};

// --- Shipyard management specs ---

type BuildShipyardSuccess = Extract<OutboundMessage, { type: 'shipyardBuilt' }>;
type BuildShipyardFailure = Extract<OutboundMessage, { type: 'shipyardBuildFailed' }>;
export const buildShipyardSpec: CommandSpec<
    Extract<InboundMessage, { type: 'buildShipyard' }>,
    BuildShipyardSuccess,
    BuildShipyardFailure,
    string
> = {
    successType: 'shipyardBuilt',
    failureType: 'shipyardBuildFailed',
    extract: (msg) => msg.facilityId,
};

type ExpandShipyardSuccess = Extract<OutboundMessage, { type: 'shipyardExpanded' }>;
type ExpandShipyardFailure = Extract<OutboundMessage, { type: 'shipyardExpandFailed' }>;
export const expandShipyardSpec: CommandSpec<
    Extract<InboundMessage, { type: 'expandShipyard' }>,
    ExpandShipyardSuccess,
    ExpandShipyardFailure,
    string
> = {
    successType: 'shipyardExpanded',
    failureType: 'shipyardExpandFailed',
    extract: (msg) => msg.facilityId,
};

type SetShipyardModeSuccess = Extract<OutboundMessage, { type: 'shipyardModeSet' }>;
type SetShipyardModeFailure = Extract<OutboundMessage, { type: 'shipyardModeSetFailed' }>;
export const setShipyardModeSpec: CommandSpec<
    Extract<InboundMessage, { type: 'setShipyardMode' }>,
    SetShipyardModeSuccess,
    SetShipyardModeFailure,
    string
> = {
    successType: 'shipyardModeSet',
    failureType: 'shipyardModeSetFailed',
    extract: (msg) => msg.facilityId,
};
