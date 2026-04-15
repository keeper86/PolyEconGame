import type { WorkerQueryMessage, WorkerSuccessResponse, WorkerErrorResponse } from '../queries';

export type InboundMessage =
    | { type: 'ping' }
    | { type: 'createShip'; from: string; to: string; cargo: { metal: number; energy: number }; eta?: number }
    | { type: 'createAgent'; requestId: string; agentId: string; agentName: string; planetId: string }
    | { type: 'requestLoan'; requestId: string; agentId: string; planetId: string; amount: number }
    | {
          type: 'setAutomation';
          requestId: string;
          agentId: string;
          automateWorkerAllocation: boolean;
      }
    | {
          type: 'setWorkerAllocationTargets';
          requestId: string;
          agentId: string;
          planetId: string;
          targets: Partial<Record<string, number>>;
      }
    | {
          type: 'setSellOffers';
          requestId: string;
          agentId: string;
          planetId: string;
          offers: Record<string, { offerPrice?: number; offerRetainment?: number; automated?: boolean }>;
      }
    | {
          type: 'buildFacility';
          requestId: string;
          agentId: string;
          planetId: string;
          facilityKey: string;
          targetScale: number;
      }
    | {
          type: 'expandFacility';
          requestId: string;
          agentId: string;
          planetId: string;
          facilityId: string;
          targetScale: number;
      }
    | {
          type: 'setFacilityScale';
          requestId: string;
          agentId: string;
          planetId: string;
          facilityId: string;
          scaleFraction: number;
      }
    | {
          type: 'setBuyBids';
          requestId: string;
          agentId: string;
          planetId: string;
          bids: Record<string, { bidPrice?: number; bidStorageTarget?: number; automated?: boolean }>;
      }
    | {
          type: 'cancelSellOffer';
          requestId: string;
          agentId: string;
          planetId: string;
          resourceName: string;
      }
    | {
          type: 'cancelBuyBid';
          requestId: string;
          agentId: string;
          planetId: string;
          resourceName: string;
      }
    | {
          type: 'leaseClaim';
          requestId: string;
          agentId: string;
          planetId: string;
          resourceName: string;
          quantity: number;
      }
    | {
          type: 'quitClaim';
          requestId: string;
          agentId: string;
          planetId: string;
          claimId: string;
      }
    | { type: 'shutdown' }
    | WorkerQueryMessage;

export type OutboundMessage =
    | { type: 'pong'; tick: number }
    | { type: 'tick'; tick: number; elapsedMs: number }
    | { type: 'agentCreated'; requestId: string; agentId: string }
    | { type: 'agentCreationFailed'; requestId: string; reason: string }
    | { type: 'loanGranted'; requestId: string; agentId: string; amount: number }
    | { type: 'loanDenied'; requestId: string; reason: string }
    | { type: 'automationSet'; requestId: string; agentId: string }
    | { type: 'automationFailed'; requestId: string; reason: string }
    | { type: 'workerAllocationSet'; requestId: string; agentId: string }
    | { type: 'workerAllocationFailed'; requestId: string; reason: string }
    | { type: 'sellOffersSet'; requestId: string; agentId: string }
    | { type: 'sellOffersFailed'; requestId: string; reason: string }
    | { type: 'buyBidsSet'; requestId: string; agentId: string }
    | { type: 'buyBidsFailed'; requestId: string; reason: string }
    | { type: 'sellOfferCancelled'; requestId: string; agentId: string }
    | { type: 'sellOfferCancelFailed'; requestId: string; reason: string }
    | { type: 'buyBidCancelled'; requestId: string; agentId: string }
    | { type: 'buyBidCancelFailed'; requestId: string; reason: string }
    | { type: 'resourcesClaimed'; requestId: string; agentId: string; arableClaimId: string; waterClaimId: string }
    | { type: 'resourcesClaimFailed'; requestId: string; reason: string }
    | { type: 'facilityBuilt'; requestId: string; agentId: string; facilityId: string }
    | { type: 'facilityBuildFailed'; requestId: string; reason: string }
    | { type: 'facilityExpanded'; requestId: string; agentId: string; facilityId: string }
    | { type: 'facilityExpandFailed'; requestId: string; reason: string }
    | { type: 'facilityScaleSet'; requestId: string; agentId: string; facilityId: string }
    | { type: 'facilityScaleSetFailed'; requestId: string; reason: string }
    | { type: 'claimLeased'; requestId: string; agentId: string; claimId: string }
    | { type: 'claimLeaseFailed'; requestId: string; reason: string }
    | { type: 'claimQuit'; requestId: string; agentId: string; claimId: string }
    | { type: 'claimQuitFailed'; requestId: string; reason: string }
    | { type: 'workerRestarted'; reason?: string }
    | WorkerSuccessResponse
    | WorkerErrorResponse;

export type PendingAction =
    | {
          type: 'createAgent';
          requestId: string;
          agentId: string;
          agentName: string;
          planetId: string;
      }
    | {
          type: 'requestLoan';
          requestId: string;
          agentId: string;
          planetId: string;
          amount: number;
      }
    | {
          type: 'setAutomation';
          requestId: string;
          agentId: string;
          automateWorkerAllocation: boolean;
      }
    | {
          type: 'setWorkerAllocationTargets';
          requestId: string;
          agentId: string;
          planetId: string;
          targets: Partial<Record<string, number>>;
      }
    | {
          type: 'setSellOffers';
          requestId: string;
          agentId: string;
          planetId: string;
          offers: Record<string, { offerPrice?: number; offerRetainment?: number; automated?: boolean }>;
      }
    | {
          type: 'buildFacility';
          requestId: string;
          agentId: string;
          planetId: string;
          facilityKey: string;
          targetScale: number;
      }
    | {
          type: 'expandFacility';
          requestId: string;
          agentId: string;
          planetId: string;
          facilityId: string;
          targetScale: number;
      }
    | {
          type: 'setFacilityScale';
          requestId: string;
          agentId: string;
          planetId: string;
          facilityId: string;
          scaleFraction: number;
      }
    | {
          type: 'setBuyBids';
          requestId: string;
          agentId: string;
          planetId: string;
          bids: Record<string, { bidPrice?: number; bidStorageTarget?: number; automated?: boolean }>;
      }
    | {
          type: 'cancelSellOffer';
          requestId: string;
          agentId: string;
          planetId: string;
          resourceName: string;
      }
    | {
          type: 'cancelBuyBid';
          requestId: string;
          agentId: string;
          planetId: string;
          resourceName: string;
      }
    | {
          type: 'leaseClaim';
          requestId: string;
          agentId: string;
          planetId: string;
          resourceName: string;
          quantity: number;
      }
    | {
          type: 'quitClaim';
          requestId: string;
          agentId: string;
          planetId: string;
          claimId: string;
      };
