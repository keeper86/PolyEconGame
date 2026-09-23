'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { Page } from '@/components/client/Page';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEffect, useState } from 'react';
import { MyShipsTab } from './_components/MyShipsTab';
import { ShipMarketTab } from './_components/ShipMarketTab';
import { ShipyardsTab } from './_components/ShipyardsTab';

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

export default function AgentShipsPage() {
    const {
        agentId,
        planetId,
        isOwnAgent,
        isOwnAgentUnknown,
        isAuthenticatedWithoutAgentId,
        myAgentId,
        tick,
        assets,
        isLoading,
        hasNoAssets,
    } = useAgentPlanetDetail();

    const [activeTab, setActiveTab] = useState<ShipTab>(readTabFromHash);

    useEffect(() => {
        setActiveTab(readTabFromHash());
    }, []);

    const handleTabChange = (value: string) => {
        const tab = (SHIP_TABS as readonly string[]).includes(value) ? (value as ShipTab) : DEFAULT_TAB;
        setActiveTab(tab);
        window.history.replaceState(null, '', `#${tab}`);
    };

    return (
        <Page title={`Ship Management`}>
            <AgentAccessGuard
                isLoading={myAgentId.isLoading}
                isOwnAgent={isOwnAgent}
                isOwnAgentUnknown={isOwnAgentUnknown}
                isAuthenticatedWithoutAgentId={isAuthenticatedWithoutAgentId}
                hasNoAssets={hasNoAssets}
                detailLoading={isLoading}
                agentId={agentId}
                planetId={planetId}
            >
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
                                shipConstructionFacilities={assets?.shipConstructionFacilities ?? []}
                            />
                        </TabsContent>
                        <TabsContent value='my-ships'>
                            <MyShipsTab agentId={agentId} planetId={planetId} tick={tick} />
                        </TabsContent>
                        <TabsContent value='marketplace'>
                            <ShipMarketTab agentId={agentId} planetId={planetId} tick={tick} />
                        </TabsContent>
                    </Tabs>
                </div>
            </AgentAccessGuard>
        </Page>
    );
}
