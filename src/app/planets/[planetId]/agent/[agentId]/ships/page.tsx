'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShipyardsTab } from './_components/ShipyardsTab';
import { MyShipsTab } from './_components/MyShipsTab';
import { ShipMarketTab } from './_components/ShipMarketTab';
import { Page } from '@/components/client/Page';

export default function AgentShipsPage() {
    const { agentId, planetId, isOwnAgent, isOwnAgentUnknown, myAgentId, tick, assets } = useAgentPlanetDetail();

    return (
        <Page title={`Ship Management`}>
            <AgentAccessGuard
                isLoading={myAgentId.isLoading}
                isOwnAgent={isOwnAgent}
                isOwnAgentUnknown={isOwnAgentUnknown}
            >
                <div data-tour='ships-tabs'>
                    <Tabs defaultValue='my-ships'>
                        <TabsList className='w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0 border-b border-border pb-2'>
                            <TabsTrigger
                                value='shipyards'
                                className='data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
                            >
                                Shipyards
                            </TabsTrigger>
                            <TabsTrigger
                                value='my-ships'
                                className='data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
                            >
                                My Ships
                            </TabsTrigger>
                            <TabsTrigger
                                value='marketplace'
                                className='data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
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
