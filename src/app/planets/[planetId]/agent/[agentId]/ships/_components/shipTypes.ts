import type { AppRouter } from '@/server/router';
import type { inferRouterOutputs } from '@trpc/server';

type Outputs = inferRouterOutputs<AppRouter>;

export type ShipListing = Outputs['simulation']['listShipListings']['listings'][number];
export type TransportContract = Outputs['simulation']['listTransportContracts']['contracts'][number];
export type ShipBuyingOffer = Outputs['simulation']['listShipBuyingOffers']['offers'][number];
export type ShipPlanetSummary = Outputs['simulation']['getLatestPlanetSummaries']['planets'][number];
