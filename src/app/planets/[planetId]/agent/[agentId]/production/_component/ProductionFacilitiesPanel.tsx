'use client';

import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTRPC } from '@/lib/trpc';
import type { ResourceProcessLevel } from '@/simulation/planet/claims';
import { FACILITY_LEVELS, FACILITY_LEVEL_LABELS, facilitiesByLevel } from '@/simulation/planet/productionFacilities';
import { constructionServiceResourceType } from '@/simulation/planet/services';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import type { ProductionFacility, ShipConstructionFacility } from '@/simulation/planet/facility';
import { ActiveFacilityCard } from './ActiveFacilityCard';
import { ActiveShipyardCard } from './ActiveShipyardCard';
import { LevelBuildSection } from './LevelBuildSection';
import { ShipyardBuildSection } from './ShipyardBuildSection';
import { UnderConstructionCard } from './UnderConstructionCard';
import { UnderConstructionShipyardCard } from './UnderConstructionShipyardCard';

const PLACEHOLDER_PLANET = 'catalog';
const PLACEHOLDER_ID = 'preview';

export default function ProductionFacilitiesPanel({
    facilities,
    shipConstructionFacilities,
    shipMaintenanceFacilities: _shipMaintenanceFacilities,
    agentId,
    planetId,
}: {
    facilities: ProductionFacility[];
    shipConstructionFacilities: ShipConstructionFacility[];
    shipMaintenanceFacilities: ProductionFacility[];
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
    const activeShipConstructionFacilities = shipConstructionFacilities.filter((f) => f.construction === null).length;

    const defaultTab = useMemo(() => {
        return (
            FACILITY_LEVELS.find((level) =>
                facilitiesByLevel[level].some((e) =>
                    ownedByName.has(e.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID).name),
                ),
            ) ?? 'raw'
        );
    }, [ownedByName]);

    const [activeTab, setActiveTab] = useState<ResourceProcessLevel | 'ships'>(() => {
        if (typeof window === 'undefined') {
            return defaultTab;
        }
        const hash = window.location.hash.slice(1);
        return (FACILITY_LEVELS.includes(hash as ResourceProcessLevel) ? hash : defaultTab) as
            | ResourceProcessLevel
            | 'ships';
    });

    useEffect(() => {
        const hash = window.location.hash.slice(1);
        if (!hash) {
            return;
        }
        if (FACILITY_LEVELS.includes(hash as ResourceProcessLevel) || hash === 'ships') {
            setActiveTab(hash as ResourceProcessLevel | 'ships');
        }
    }, []);

    const handleTabChange = (value: string) => {
        setActiveTab(value as ResourceProcessLevel | 'ships');
        window.history.replaceState(null, '', `#${value}`);
    };

    return (
        <div className='space-y-4'>
            <Tabs value={activeTab} onValueChange={handleTabChange}>
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
                    <TabsTrigger
                        value='ships'
                        className='data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
                    >
                        Ships
                        {shipConstructionFacilities.length > 0 && (
                            <Badge variant='secondary' className='ml-1.5 text-[10px] px-1 py-0'>
                                {activeShipConstructionFacilities}/{shipConstructionFacilities.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                </TabsList>
                {FACILITY_LEVELS.map((level) => {
                    const unbuildableEntries = facilitiesByLevel[level].filter(
                        (e) => !ownedByName.has(e.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID).name),
                    );
                    return (
                        <TabsContent key={level} value={level} className='mt-3'>
                            <div className='flex flex-row gap-3 flex-wrap'>
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
                                    return null;
                                })}
                                {unbuildableEntries.length > 0 && (
                                    <LevelBuildSection
                                        entries={unbuildableEntries}
                                        agentId={agentId}
                                        planetId={planetId}
                                        constructionServicePrice={constructionServicePrice}
                                        onBuilt={refresh}
                                    />
                                )}
                            </div>
                        </TabsContent>
                    );
                })}
                <TabsContent value='ships' className='mt-3'>
                    <div className='flex flex-col gap-4'>
                        <ShipyardBuildSection
                            agentId={agentId}
                            planetId={planetId}
                            constructionServicePrice={constructionServicePrice}
                            onBuilt={refresh}
                        />
                        <div className='flex flex-row gap-3 flex-wrap'>
                            {shipConstructionFacilities.map((sy) => {
                                if (sy.construction !== null) {
                                    return <UnderConstructionShipyardCard key={sy.id} facility={sy} />;
                                }
                                return (
                                    <ActiveShipyardCard
                                        key={sy.id}
                                        facility={sy}
                                        agentId={agentId}
                                        planetId={planetId}
                                        constructionServicePrice={constructionServicePrice}
                                        onExpanded={refresh}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
