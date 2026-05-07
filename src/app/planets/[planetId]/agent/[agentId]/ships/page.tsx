'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShipyardsTab } from './_components/ShipyardsTab';
import { MyShipsTab } from './_components/MyShipsTab';
import { ShipMarketTab } from './_components/ShipMarketTab';
import { Page } from '@/components/client/Page';

export default function AgentShipsPage() {
    const { agentId, planetId, isOwnAgent, myAgentId, tick, assets } = useAgentPlanetDetail();

    return (
        <Page title={`Ship Management`}>
            <AgentAccessGuard isLoading={myAgentId.isLoading} isOwnAgent={isOwnAgent}>
                <Tabs defaultValue='my-ships'>
                    <TabsList>
                        <TabsTrigger value='shipyards'>Shipyards</TabsTrigger>
                        <TabsTrigger value='my-ships'>My Ships</TabsTrigger>
                        <TabsTrigger value='marketplace'>Marketplace</TabsTrigger>
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
            </AgentAccessGuard>
        </Page>
    );
}
