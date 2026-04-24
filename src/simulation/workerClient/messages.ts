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
    | {
          type: 'postTransportContract';
          requestId: string;
          agentId: string;
          planetId: string; // fromPlanetId — contract lives in poster's assets on this planet
          toPlanetId: string;
          cargo: { resourceName: string; quantity: number };
          maxDurationInTicks: number;
          offeredReward: number;
          expiresAtTick: number;
      }
    | {
          type: 'acceptTransportContract';
          requestId: string;
          agentId: string;
          planetId: string; // planet where contract was posted
          posterAgentId: string;
          contractId: string;
          shipName: string;
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
          shipName: string;
          cargoGoal: { resourceName: string; quantity: number } | null;
      }
    | {
          type: 'postConstructionContract';
          requestId: string;
          agentId: string;
          planetId: string; // fromPlanetId — contract lives in poster's assets on this planet
          toPlanetId: string;
          facilityName: string; // name of the facility to construct
          commissioningAgentId: string; // agent who will receive the completed facility
          offeredReward: number;
          expiresAtTick: number;
      }
    | {
          type: 'acceptConstructionContract';
          requestId: string;
          agentId: string;
          planetId: string; // planet where contract was posted
          posterAgentId: string;
          contractId: string;
          shipName: string; // idle construction ship to assign
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
          shipName: string;
          facilityName?: string;
      }
    | {
          type: 'postShipBuyingOffer';
          requestId: string;
          agentId: string;
          planetId: string;
          shipType: string; // ShipTypeKey
          price: number;
      }
    | {
          type: 'acceptShipBuyingOffer';
          requestId: string;
          agentId: string;
          planetId: string; // planet where offer was posted
          posterAgentId: string;
          offerId: string;
          shipName: string; // idle ship to transfer
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
          type: 'buildShipMaintenanceFacility';
          requestId: string;
          agentId: string;
          planetId: string;
          facilityName: string;
          targetScale: number;
      }
    | {
          type: 'expandShipMaintenanceFacility';
          requestId: string;
          agentId: string;
          planetId: string;
          facilityId: string;
          targetScale: number;
      }
    | {
          type: 'postShipListing';
          requestId: string;
          agentId: string;
          planetId: string;
          shipName: string;
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
    | { type: 'transportContractPosted'; requestId: string; agentId: string; contractId: string }
    | { type: 'transportContractPostFailed'; requestId: string; reason: string }
    | { type: 'transportContractAccepted'; requestId: string; agentId: string; contractId: string }
    | { type: 'transportContractAcceptFailed'; requestId: string; reason: string }
    | { type: 'transportContractCancelled'; requestId: string; agentId: string; contractId: string }
    | { type: 'transportContractCancelFailed'; requestId: string; reason: string }
    | { type: 'shipDispatched'; requestId: string; agentId: string; shipName: string }
    | { type: 'shipDispatchFailed'; requestId: string; reason: string }
    | { type: 'constructionShipDispatched'; requestId: string; agentId: string; shipName: string }
    | { type: 'constructionShipDispatchFailed'; requestId: string; reason: string }
    | { type: 'constructionContractPosted'; requestId: string; agentId: string; contractId: string }
    | { type: 'constructionContractPostFailed'; requestId: string; reason: string }
    | { type: 'constructionContractAccepted'; requestId: string; agentId: string; contractId: string }
    | { type: 'constructionContractAcceptFailed'; requestId: string; reason: string }
    | { type: 'constructionContractCancelled'; requestId: string; agentId: string; contractId: string }
    | { type: 'constructionContractCancelFailed'; requestId: string; reason: string }
    | { type: 'shipBuyingOfferPosted'; requestId: string; agentId: string; offerId: string }
    | { type: 'shipBuyingOfferPostFailed'; requestId: string; reason: string }
    | { type: 'shipBuyingOfferAccepted'; requestId: string; agentId: string; offerId: string }
    | { type: 'shipBuyingOfferAcceptFailed'; requestId: string; reason: string }
    | { type: 'shipListingPosted'; requestId: string; agentId: string; listingId: string }
    | { type: 'shipListingPostFailed'; requestId: string; reason: string }
    | { type: 'shipListingCancelled'; requestId: string; agentId: string; listingId: string }
    | { type: 'shipListingCancelFailed'; requestId: string; reason: string }
    | { type: 'shipListingAccepted'; requestId: string; buyerAgentId: string; listingId: string }
    | { type: 'shipListingAcceptFailed'; requestId: string; reason: string }
    | { type: 'shipConstructionFacilityBuilt'; requestId: string; agentId: string; facilityId: string }
    | { type: 'shipConstructionFacilityBuildFailed'; requestId: string; reason: string }
    | { type: 'shipConstructionFacilityExpanded'; requestId: string; agentId: string; facilityId: string }
    | { type: 'shipConstructionFacilityExpandFailed'; requestId: string; reason: string }
    | { type: 'shipConstructionTargetSet'; requestId: string; agentId: string; facilityId: string }
    | { type: 'shipConstructionTargetSetFailed'; requestId: string; reason: string }
    | { type: 'shipMaintenanceFacilityBuilt'; requestId: string; agentId: string; facilityId: string }
    | { type: 'shipMaintenanceFacilityBuildFailed'; requestId: string; reason: string }
    | { type: 'shipMaintenanceFacilityExpanded'; requestId: string; agentId: string; facilityId: string }
    | { type: 'shipMaintenanceFacilityExpandFailed'; requestId: string; reason: string }
    | {
          type: 'licenseAcquired';
          requestId: string;
          agentId: string;
          planetId: string;
          licenseType: 'commercial' | 'workforce';
      }
    | { type: 'licenseAcquisitionFailed'; requestId: string; reason: string }
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
    | {
          type: 'postTransportContract';
          requestId: string;
          agentId: string;
          planetId: string;
          toPlanetId: string;
          cargo: { resourceName: string; quantity: number };
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
          shipName: string;
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
          shipName: string;
          cargoGoal: { resourceName: string; quantity: number } | null;
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
          shipName: string;
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
          shipName: string;
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
          shipName: string;
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
          type: 'buildShipMaintenanceFacility';
          requestId: string;
          agentId: string;
          planetId: string;
          facilityName: string;
          targetScale: number;
      }
    | {
          type: 'expandShipMaintenanceFacility';
          requestId: string;
          agentId: string;
          planetId: string;
          facilityId: string;
          targetScale: number;
      }
    | {
          type: 'postShipListing';
          requestId: string;
          agentId: string;
          planetId: string;
          shipName: string;
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
      };
