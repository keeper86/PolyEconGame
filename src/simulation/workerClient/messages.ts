import type { TickerEvent } from 'src/server/controller/simulation';
import type { WorkerQueryMessage, WorkerSuccessResponse, WorkerErrorResponse } from '../queries';
import type { ResourceQuantity } from '../planet/claims';
import type { WireGameState } from '../snapshotCompression';
import type { AutomatedPricingConfig } from '../planet/planet';

export type InboundMessage =
    | { type: 'ping' }
    | { type: 'createShip'; from: string; to: string; cargo: { metal: number; energy: number }; eta?: number }
    | { type: 'createAgent'; requestId: string; agentId: string; agentName: string; planetId: string }
    | { type: 'requestLoan'; requestId: string; agentId: string; planetId: string; amount: number }
    | {
          type: 'repayLoan';
          requestId: string;
          agentId: string;
          planetId: string;
          loanId: string;
          fraction: 0.25 | 0.5 | 1;
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
              {
                  offerPrice?: number;
                  offerRetainment?: number;
                  automated?: boolean;
                  autoConfig?: AutomatedPricingConfig;
              }
          >;
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
          type: 'contractFacility';
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
          bids: Record<
              string,
              { bidPrice?: number; bidStorageTarget?: number; automated?: boolean; autoConfig?: AutomatedPricingConfig }
          >;
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
    | {
          type: 'postTransportContract';
          requestId: string;
          agentId: string;
          planetId: string;
          toPlanetId: string;
          cargo: ResourceQuantity;
          maxDurationInTicks: number;
          offeredReward: number;
          expiresAtTick: number;
      }
    | {
          type: 'acceptTransportContract';
          requestId: string;
          agentId: string;
          planetId: string;
          posterAgentId: string;
          contractId: string;
          shipId: string;
      }
    | {
          type: 'cancelTransportContract';
          requestId: string;
          agentId: string;
          planetId: string;
          contractId: string;
      }
    | {
          type: 'dispatchShip';
          requestId: string;
          agentId: string;
          fromPlanetId: string;
          toPlanetId: string;
          shipId: string;
          cargoGoal: ResourceQuantity | null;
      }
    | {
          type: 'dispatchPassengerShip';
          requestId: string;
          agentId: string;
          fromPlanetId: string;
          toPlanetId: string;
          shipId: string;
          passengerCount: number;
      }
    | {
          type: 'postConstructionContract';
          requestId: string;
          agentId: string;
          planetId: string;
          toPlanetId: string;
          facilityName: string;
          commissioningAgentId: string;
          offeredReward: number;
          expiresAtTick: number;
      }
    | {
          type: 'acceptConstructionContract';
          requestId: string;
          agentId: string;
          planetId: string;
          posterAgentId: string;
          contractId: string;
          shipId: string;
      }
    | {
          type: 'cancelConstructionContract';
          requestId: string;
          agentId: string;
          planetId: string;
          contractId: string;
      }
    | {
          type: 'dispatchConstructionShip';
          requestId: string;
          agentId: string;
          fromPlanetId: string;
          toPlanetId: string;
          shipId: string;
          facilityName?: string;
      }
    | {
          type: 'postShipBuyingOffer';
          requestId: string;
          agentId: string;
          planetId: string;
          shipType: string;
          price: number;
      }
    | {
          type: 'acceptShipBuyingOffer';
          requestId: string;
          agentId: string;
          planetId: string;
          posterAgentId: string;
          offerId: string;
          shipId: string;
      }
    | {
          type: 'buildShipConstructionFacility';
          requestId: string;
          agentId: string;
          planetId: string;
          facilityName: string;
          targetScale: number;
      }
    | {
          type: 'expandShipConstructionFacility';
          requestId: string;
          agentId: string;
          planetId: string;
          facilityId: string;
          targetScale: number;
      }
    | {
          type: 'setShipConstructionTarget';
          requestId: string;
          agentId: string;
          planetId: string;
          facilityId: string;
          shipTypeName: string | null;
          shipName: string;
      }
    | {
          type: 'postShipListing';
          requestId: string;
          agentId: string;
          planetId: string;
          shipId: string;
          askPrice: number;
      }
    | {
          type: 'cancelShipListing';
          requestId: string;
          agentId: string;
          planetId: string;
          listingId: string;
      }
    | {
          type: 'acceptShipListing';
          requestId: string;
          buyerAgentId: string;
          buyerPlanetId: string;
          sellerAgentId: string;
          listingId: string;
      }
    | { type: 'shutdown' }
    | {
          type: 'acquireLicense';
          requestId: string;
          agentId: string;
          planetId: string;
          licenseType: 'commercial' | 'workforce';
      }
    | {
          type: 'cancelConstruction';
          requestId: string;
          agentId: string;
          planetId: string;
          facilityId: string;
      }
    | WorkerQueryMessage;

export type OutboundMessage =
    | { type: 'pong'; tick: number }
    | { type: 'tick'; tick: number; elapsedMs: number; tickerEvents?: TickerEvent[] }
    | { type: 'snapshot'; tick: number; elapsedMs: number; tickerEvents?: TickerEvent[]; data: WireGameState }
    | { type: 'agentCreated'; requestId: string; agentId: string; processedAtTick: number }
    | { type: 'agentCreationFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'loanGranted'; requestId: string; agentId: string; amount: number; processedAtTick: number }
    | { type: 'loanDenied'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'loanRepaid'; requestId: string; agentId: string; loanId: string; amount: number; processedAtTick: number }
    | { type: 'repayDenied'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'automationSet'; requestId: string; agentId: string; processedAtTick: number }
    | { type: 'automationFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'workerAllocationSet'; requestId: string; agentId: string; processedAtTick: number }
    | { type: 'workerAllocationFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'sellOffersSet'; requestId: string; agentId: string; processedAtTick: number }
    | { type: 'sellOffersFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'buyBidsSet'; requestId: string; agentId: string; processedAtTick: number }
    | { type: 'buyBidsFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'sellOfferCancelled'; requestId: string; agentId: string; processedAtTick: number }
    | { type: 'sellOfferCancelFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'buyBidCancelled'; requestId: string; agentId: string; processedAtTick: number }
    | { type: 'buyBidCancelFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'resourcesClaimed'; requestId: string; agentId: string; arableClaimId: string; waterClaimId: string; processedAtTick: number }
    | { type: 'resourcesClaimFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'facilityBuilt'; requestId: string; agentId: string; facilityId: string; processedAtTick: number }
    | { type: 'facilityBuildFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'facilityExpanded'; requestId: string; agentId: string; facilityId: string; processedAtTick: number }
    | { type: 'facilityExpandFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'facilityContracted'; requestId: string; agentId: string; facilityId: string; processedAtTick: number }
    | { type: 'facilityContractFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'facilityScaleSet'; requestId: string; agentId: string; facilityId: string; processedAtTick: number }
    | { type: 'facilityScaleSetFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'constructionCancelled'; requestId: string; agentId: string; facilityId: string; processedAtTick: number }
    | { type: 'constructionCancelFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'claimLeased'; requestId: string; agentId: string; claimId: string; processedAtTick: number }
    | { type: 'claimLeaseFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'claimQuit'; requestId: string; agentId: string; claimId: string; processedAtTick: number }
    | { type: 'claimQuitFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'transportContractPosted'; requestId: string; agentId: string; contractId: string; processedAtTick: number }
    | { type: 'transportContractPostFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'transportContractAccepted'; requestId: string; agentId: string; contractId: string; processedAtTick: number }
    | { type: 'transportContractAcceptFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'transportContractCancelled'; requestId: string; agentId: string; contractId: string; processedAtTick: number }
    | { type: 'transportContractCancelFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'shipDispatched'; requestId: string; agentId: string; shipId: string; processedAtTick: number }
    | { type: 'shipDispatchFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'passengerShipDispatched'; requestId: string; agentId: string; shipId: string; processedAtTick: number }
    | { type: 'passengerShipDispatchFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'constructionShipDispatched'; requestId: string; agentId: string; shipId: string; processedAtTick: number }
    | { type: 'constructionShipDispatchFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'constructionContractPosted'; requestId: string; agentId: string; contractId: string; processedAtTick: number }
    | { type: 'constructionContractPostFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'constructionContractAccepted'; requestId: string; agentId: string; contractId: string; processedAtTick: number }
    | { type: 'constructionContractAcceptFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'constructionContractCancelled'; requestId: string; agentId: string; contractId: string; processedAtTick: number }
    | { type: 'constructionContractCancelFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'shipBuyingOfferPosted'; requestId: string; agentId: string; offerId: string; processedAtTick: number }
    | { type: 'shipBuyingOfferPostFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'shipBuyingOfferAccepted'; requestId: string; agentId: string; offerId: string; processedAtTick: number }
    | { type: 'shipBuyingOfferAcceptFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'shipListingPosted'; requestId: string; agentId: string; listingId: string; processedAtTick: number }
    | { type: 'shipListingPostFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'shipListingCancelled'; requestId: string; agentId: string; listingId: string; processedAtTick: number }
    | { type: 'shipListingCancelFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'shipListingAccepted'; requestId: string; buyerAgentId: string; listingId: string; processedAtTick: number }
    | { type: 'shipListingAcceptFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'shipConstructionFacilityBuilt'; requestId: string; agentId: string; facilityId: string; processedAtTick: number }
    | { type: 'shipConstructionFacilityBuildFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'shipConstructionFacilityExpanded'; requestId: string; agentId: string; facilityId: string; processedAtTick: number }
    | { type: 'shipConstructionFacilityExpandFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'shipConstructionTargetSet'; requestId: string; agentId: string; facilityId: string; processedAtTick: number }
    | { type: 'shipConstructionTargetSetFailed'; requestId: string; reason: string; processedAtTick: number }
    | {
          type: 'licenseAcquired';
          requestId: string;
          agentId: string;
          planetId: string;
          licenseType: 'commercial' | 'workforce';
          processedAtTick: number;
      }
    | { type: 'licenseAcquisitionFailed'; requestId: string; reason: string; processedAtTick: number }
    | { type: 'workerRestarted'; reason?: string }
    | { type: 'workerLog'; level: 'log' | 'warn' | 'error'; message: string }
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
          type: 'repayLoan';
          requestId: string;
          agentId: string;
          planetId: string;
          loanId: string;
          fraction: 0.25 | 0.5 | 1;
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
              {
                  offerPrice?: number;
                  offerRetainment?: number;
                  automated?: boolean;
                  autoConfig?: AutomatedPricingConfig;
              }
          >;
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
          type: 'contractFacility';
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
          bids: Record<
              string,
              { bidPrice?: number; bidStorageTarget?: number; automated?: boolean; autoConfig?: AutomatedPricingConfig }
          >;
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
    | {
          type: 'postTransportContract';
          requestId: string;
          agentId: string;
          planetId: string;
          toPlanetId: string;
          cargo: ResourceQuantity;
          maxDurationInTicks: number;
          offeredReward: number;
          expiresAtTick: number;
      }
    | {
          type: 'acceptTransportContract';
          requestId: string;
          agentId: string;
          planetId: string;
          posterAgentId: string;
          contractId: string;
          shipId: string;
      }
    | {
          type: 'cancelTransportContract';
          requestId: string;
          agentId: string;
          planetId: string;
          contractId: string;
      }
    | {
          type: 'dispatchShip';
          requestId: string;
          agentId: string;
          fromPlanetId: string;
          toPlanetId: string;
          shipId: string;
          cargoGoal: ResourceQuantity | null;
      }
    | {
          type: 'dispatchPassengerShip';
          requestId: string;
          agentId: string;
          fromPlanetId: string;
          toPlanetId: string;
          shipId: string;
          passengerCount: number;
      }
    | {
          type: 'postConstructionContract';
          requestId: string;
          agentId: string;
          planetId: string;
          toPlanetId: string;
          facilityName: string;
          commissioningAgentId: string;
          offeredReward: number;
          expiresAtTick: number;
      }
    | {
          type: 'acceptConstructionContract';
          requestId: string;
          agentId: string;
          planetId: string;
          posterAgentId: string;
          contractId: string;
          shipId: string;
      }
    | {
          type: 'cancelConstructionContract';
          requestId: string;
          agentId: string;
          planetId: string;
          contractId: string;
      }
    | {
          type: 'dispatchConstructionShip';
          requestId: string;
          agentId: string;
          fromPlanetId: string;
          toPlanetId: string;
          shipId: string;
          facilityName?: string;
      }
    | {
          type: 'postShipBuyingOffer';
          requestId: string;
          agentId: string;
          planetId: string;
          shipType: string;
          price: number;
      }
    | {
          type: 'acceptShipBuyingOffer';
          requestId: string;
          agentId: string;
          planetId: string;
          posterAgentId: string;
          offerId: string;
          shipId: string;
      }
    | {
          type: 'buildShipConstructionFacility';
          requestId: string;
          agentId: string;
          planetId: string;
          facilityName: string;
          targetScale: number;
      }
    | {
          type: 'expandShipConstructionFacility';
          requestId: string;
          agentId: string;
          planetId: string;
          facilityId: string;
          targetScale: number;
      }
    | {
          type: 'setShipConstructionTarget';
          requestId: string;
          agentId: string;
          planetId: string;
          facilityId: string;
          shipTypeName: string | null;
          shipName: string;
      }
    | {
          type: 'postShipListing';
          requestId: string;
          agentId: string;
          planetId: string;
          shipId: string;
          askPrice: number;
      }
    | {
          type: 'cancelShipListing';
          requestId: string;
          agentId: string;
          planetId: string;
          listingId: string;
      }
    | {
          type: 'acceptShipListing';
          requestId: string;
          buyerAgentId: string;
          buyerPlanetId: string;
          sellerAgentId: string;
          listingId: string;
      }
    | {
          type: 'acquireLicense';
          requestId: string;
          agentId: string;
          planetId: string;
          licenseType: 'commercial' | 'workforce';
      }
    | {
          type: 'cancelConstruction';
          requestId: string;
          agentId: string;
          planetId: string;
          facilityId: string;
      };
