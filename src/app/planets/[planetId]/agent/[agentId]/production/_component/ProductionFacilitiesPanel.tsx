'use client';

import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTRPC } from '@/lib/trpc';
import type { ResourceProcessLevel } from '@/simulation/planet/claims';
import type { ProductionFacility } from '@/simulation/planet/facility';
import { FACILITY_LEVELS, FACILITY_LEVEL_LABELS, facilitiesByLevel } from '@/simulation/planet/productionFacilities';
import { constructionServiceResourceType } from '@/simulation/planet/services';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { ActiveFacilityCard } from './ActiveFacilityCard';
import { LevelBuildSection, type Mode as BuildMode } from './LevelBuildSection';
import { UnderConstructionCard } from './UnderConstructionCard';

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

    const defaultTab = useMemo(() => {
        return (
            FACILITY_LEVELS.find((level) =>
                facilitiesByLevel[level].some((e) =>
                    ownedByName.has(e.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID).name),
                ),
            ) ?? 'raw'
        );
    }, [ownedByName]);

    const [buildMode, setBuildMode] = useState<BuildMode>({ type: 'idle' });

    const [activeTab, setActiveTab] = useState<ResourceProcessLevel>(() => {
        if (typeof window === 'undefined') {
            return defaultTab;
        }
        const hash = window.location.hash.slice(1);
        return (FACILITY_LEVELS.includes(hash as ResourceProcessLevel) ? hash : defaultTab) as ResourceProcessLevel;
    });

    useEffect(() => {
        const hash = window.location.hash.slice(1);
        if (!hash) {
            return;
        }
        if (FACILITY_LEVELS.includes(hash as ResourceProcessLevel)) {
            setActiveTab(hash as ResourceProcessLevel);
        }
    }, []);

    const handleTabChange = (value: string) => {
        setActiveTab(value as ResourceProcessLevel);
        window.history.replaceState(null, '', `#${value}`);
    };

    return (
        <div className='space-y-4'>
            <Tabs value={activeTab} onValueChange={handleTabChange}>
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
                                className='bg-muted/50 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
                            >
                                {FACILITY_LEVEL_LABELS[level]}
                                {ownedTotal > 0 && (
                                    <Badge variant='secondary' className='ml-1.5 text-[10px] px-1 py-0'>
                                        {ownedActive}
                                    </Badge>
                                )}
                            </TabsTrigger>
                        );
                    })}
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
                                        if (owned.construction !== null && owned.construction.type === 'new') {
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
                                        // onBuilt is a no-op — the LevelBuildSection handles the overlay
                                        // internally via onSuccess. Query invalidation is done by the
                                        // tick poller when the snapshot arrives.
                                        onBuilt={() => {}}
                                        mode={buildMode}
                                        onModeChange={setBuildMode}
                                    />
                                )}
                            </div>
                        </TabsContent>
                    );
                })}
            </Tabs>
        </div>
    );
}
