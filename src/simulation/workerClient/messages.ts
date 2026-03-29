import type { TransportShip } from '../planet/planet';
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
          offers: Record<
              string,
              { offerPrice?: number; offerQuantity?: number; offerRetainment?: number; automated?: boolean }
          >;
      }
    | {
          type: 'claimResources';
          requestId: string;
          agentId: string;
          planetId: string;
          arableLandQuantity: number;
          waterSourceQuantity: number;
      }
    | {
          type: 'buildFacility';
          requestId: string;
          agentId: string;
          planetId: string;
          facilityKey: string;
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
    | { type: 'shutdown' }
    | WorkerQueryMessage;

export type OutboundMessage =
    | { type: 'pong'; tick: number }
    | { type: 'tick'; tick: number; elapsedMs: number }
    | { type: 'shipArrived'; shipId: string; to: string; cargo: { metal: number; energy: number }; tick: number }
    | { type: 'shipCreated'; ship: TransportShip; tick: number }
    | {
          type: 'shipCreationFailed';
          reason: string;
          requested: { metal: number; energy: number };
          available?: { metal: number; energy: number };
          from?: string;
      }
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
          offers: Record<
              string,
              { offerPrice?: number; offerQuantity?: number; offerRetainment?: number; automated?: boolean }
          >;
      }
    | {
          type: 'claimResources';
          requestId: string;
          agentId: string;
          planetId: string;
          arableLandQuantity: number;
          waterSourceQuantity: number;
      }
    | {
          type: 'buildFacility';
          requestId: string;
          agentId: string;
          planetId: string;
          facilityKey: string;
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
      };
