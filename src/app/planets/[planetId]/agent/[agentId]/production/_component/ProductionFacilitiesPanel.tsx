'use client';

import React, { useMemo } from 'react';
import type { ProductionFacility } from '../../../../../../../simulation/planet/facility';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTRPC } from '@/lib/trpc';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FACILITY_LEVELS, FACILITY_LEVEL_LABELS, facilitiesByLevel } from '@/simulation/planet/productionFacilities';
import { HardHat } from 'lucide-react';
import { UnderConstructionCard } from './UnderConstructionCard';
import { ActiveFacilityCard } from './ActiveFacilityCard';
import { CatalogCard } from './CatalogCard';
import { constructionServiceResourceType } from '@/simulation/planet/services';

const PLACEHOLDER_PLANET = 'catalog';
const PLACEHOLDER_ID = 'preview';

export default function ProductionFacilitiesPanel({
    facilities,
    agentId,
    planetId,
}: {
    facilities: ProductionFacility[];
    agentId: string;
    planetId: string;
}): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const { data: constructionMarket } = useQuery(
        trpc.simulation.getPlanetMarket.queryOptions({ planetId, resourceName: constructionServiceResourceType.name }),
    );
    const constructionServicePrice = constructionMarket?.market?.clearingPrice;

    const refresh = () =>
        void queryClient.invalidateQueries({
            queryKey: trpc.simulation.getAgentPlanetDetail.queryKey({ agentId, planetId }),
        });

    const ownedByName = useMemo(() => {
        const m = new Map<string, ProductionFacility>();
        for (const f of facilities) {
            m.set(f.name, f);
        }
        return m;
    }, [facilities]);

    const activeCount = facilities.filter((f) => f.construction === null).length;
    const constructionCount = facilities.filter((f) => f.construction !== null).length;

    return (
        <div className='space-y-4'>
            {constructionCount > 0 && (
                <div>
                    <div className='flex items-center gap-2 mb-2'>
                        <HardHat className='h-4 w-4 text-amber-500' />
                        <h2 className='text-sm font-semibold'>Under Construction</h2>
                        <Badge variant='secondary' className='text-[10px] px-1.5 py-0'>
                            {constructionCount}
                        </Badge>
                    </div>
                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                        {facilities
                            .filter((f) => f.construction !== null)
                            .map((f) => (
                                <UnderConstructionCard key={f.id} facility={f} />
                            ))}
                    </div>
                </div>
            )}

            <Tabs defaultValue='raw'>
                <div className='flex items-center justify-between mb-1'>
                    <h2 className='text-sm font-semibold'>
                        Facilities
                        {activeCount > 0 && (
                            <Badge variant='secondary' className='ml-2 text-[10px] px-1.5 py-0'>
                                {activeCount} active
                            </Badge>
                        )}
                    </h2>
                </div>
                <TabsList className='w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0 border-b border-border pb-2'>
                    {FACILITY_LEVELS.map((level) => {
                        const levelFacilities = facilitiesByLevel[level];
                        const ownedActive = levelFacilities.filter((e) => {
                            const f = ownedByName.get(e.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID).name);
                            return f && f.construction === null;
                        }).length;
                        const ownedTotal = levelFacilities.filter((e) =>
                            ownedByName.has(e.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID).name),
                        ).length;
                        return (
                            <TabsTrigger
                                key={level}
                                value={level}
                                className='data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
                            >
                                {FACILITY_LEVEL_LABELS[level]}
                                {ownedTotal > 0 && (
                                    <Badge variant='secondary' className='ml-1.5 text-[10px] px-1 py-0'>
                                        {ownedActive}/{levelFacilities.length}
                                    </Badge>
                                )}
                            </TabsTrigger>
                        );
                    })}
                </TabsList>
                {FACILITY_LEVELS.map((level) => (
                    <TabsContent key={level} value={level} className='mt-3'>
                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                            {facilitiesByLevel[level].map((entry) => {
                                const previewName = entry.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID).name;
                                const owned = ownedByName.get(previewName);
                                if (owned) {
                                    if (owned.construction !== null) {
                                        return <UnderConstructionCard key={owned.id} facility={owned} />;
                                    }
                                    return (
                                        <ActiveFacilityCard
                                            key={owned.id}
                                            facility={owned}
                                            agentId={agentId}
                                            planetId={planetId}
                                            constructionServicePrice={constructionServicePrice}
                                            onExpanded={refresh}
                                        />
                                    );
                                }
                                return (
                                    <CatalogCard
                                        key={previewName}
                                        entry={entry}
                                        agentId={agentId}
                                        planetId={planetId}
                                        constructionServicePrice={constructionServicePrice}
                                        onBuilt={refresh}
                                    />
                                );
                            })}
                        </div>
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
