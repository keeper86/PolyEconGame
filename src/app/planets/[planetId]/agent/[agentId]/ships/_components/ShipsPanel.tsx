'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { PRICE_FLOOR } from '@/simulation/constants';
import { initialMarketPrices } from '@/simulation/initialUniverse/initialMarketPrices';
import type { AgentPlanetAssets } from '@/simulation/planet/planet';
import { constructionServiceResourceType } from '@/simulation/planet/services';
import React, { useEffect, useState } from 'react';
import { MyShipsTab } from './MyShipsTab';
import { ShipMarketTab } from './ShipMarketTab';
import { ShipyardsTab } from './ShipyardsTab';

const SHIP_TABS = ['shipyards', 'my-ships', 'marketplace'] as const;
type ShipTab = (typeof SHIP_TABS)[number];
const DEFAULT_TAB: ShipTab = 'my-ships';

function readTabFromHash(): ShipTab {
    if (typeof window === 'undefined') {
        return DEFAULT_TAB;
    }
    const hash = window.location.hash.slice(1);
    return (SHIP_TABS as readonly string[]).includes(hash) ? (hash as ShipTab) : DEFAULT_TAB;
}

export function ShipsPanel({
    agentId,
    planetId,
    assets,
    tick,
}: {
    agentId: string;
    planetId: string;
    assets: AgentPlanetAssets;
    tick: number;
}): React.ReactElement {
    const trpc = useTRPC();
    const [activeTab, setActiveTab] = useState<ShipTab>(readTabFromHash);

    useEffect(() => {
        setActiveTab(readTabFromHash());
    }, []);

    const handleTabChange = (value: string) => {
        const tab = (SHIP_TABS as readonly string[]).includes(value) ? (value as ShipTab) : DEFAULT_TAB;
        setActiveTab(tab);
        window.history.replaceState(null, '', `#${tab}`);
    };

    const { data: constructionMarket } = useSimulationQuery(
        trpc.simulation.getPlanetMarket.queryOptions({ planetId, resourceName: constructionServiceResourceType.name }),
    );
    const constructionServicePrice =
        constructionMarket?.market?.clearingPrice ??
        initialMarketPrices[constructionServiceResourceType.name] ??
        PRICE_FLOOR;

    const { data: shipsData, isLoading: shipsLoading } = useSimulationQuery(
        trpc.simulation.listAgentShips.queryOptions({ agentId }),
    );
    const { data: listingsData, isLoading: listingsLoading } = useSimulationQuery(
        trpc.simulation.listShipListings.queryOptions({ planetId }),
    );
    const { data: contractsData, isLoading: contractsLoading } = useSimulationQuery(
        trpc.simulation.listTransportContracts.queryOptions({ planetId }),
    );
    const { data: buyingData, isLoading: offersLoading } = useSimulationQuery(
        trpc.simulation.listShipBuyingOffers.queryOptions({ planetId }),
    );
    const { data: planetSummariesData } = useSimulationQuery(trpc.simulation.getLatestPlanetSummaries.queryOptions());

    return (
        <div data-tour='ships-tabs'>
            <Tabs value={activeTab} onValueChange={handleTabChange}>
                <TabsList className='w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0 border-b border-border pb-2'>
                    <TabsTrigger
                        value='shipyards'
                        className='data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
                        data-tour='ships-shipyards'
                    >
                        Shipyards
                    </TabsTrigger>
                    <TabsTrigger
                        value='my-ships'
                        className='data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
                        data-tour='ships-my-ships'
                    >
                        My Ships
                    </TabsTrigger>
                    <TabsTrigger
                        value='marketplace'
                        className='data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
                        data-tour='ships-marketplace'
                    >
                        Marketplace
                    </TabsTrigger>
                </TabsList>
                <TabsContent value='shipyards'>
                    <ShipyardsTab
                        agentId={agentId}
                        planetId={planetId}
                        shipConstructionFacilities={assets.shipConstructionFacilities}
                        constructionServicePrice={constructionServicePrice}
                    />
                </TabsContent>
                <TabsContent value='my-ships'>
                    <MyShipsTab
                        agentId={agentId}
                        planetId={planetId}
                        tick={tick}
                        ships={shipsData?.ships ?? []}
                        shipsLoading={shipsLoading}
                        listings={listingsData?.listings ?? []}
                        planetSummaries={planetSummariesData?.planets ?? []}
                    />
                </TabsContent>
                <TabsContent value='marketplace'>
                    <ShipMarketTab
                        agentId={agentId}
                        planetId={planetId}
                        tick={tick}
                        ships={shipsData?.ships ?? []}
                        listings={listingsData?.listings ?? []}
                        contracts={contractsData?.contracts ?? []}
                        offers={buyingData?.offers ?? []}
                        planetSummaries={planetSummariesData?.planets ?? []}
                        contractsLoading={contractsLoading}
                        offersLoading={offersLoading}
                        listingsLoading={listingsLoading}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}
