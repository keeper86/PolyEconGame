'use client';

import AgentFinancialPanel from '@/app/agents/AgentFinancialPanel';
import ProductionFacilitiesPanel from '@/app/agents/ProductionFacilitiesPanel';
import WorkforceDemographyPanel from '@/app/agents/WorkforceDemographyPanel';
import type { WorkforceDemography } from '@/app/agents/workforce-summary';
import { Page } from '@/components/client/Page';
import { useTRPC } from '@/lib/trpc';
import type { ProductionFacility, StorageFacility } from '@/simulation/planet/facilities';
import type { EducationLevelType } from '@/simulation/population/education';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { route } from 'nextjs-routes';
import React from 'react';

/* ------------------------------------------------------------------ */
/*  Storage table                                                      */
/* ------------------------------------------------------------------ */

function StorageOverview({ storage }: { storage: StorageFacility }): React.ReactElement {
    const entries = Object.entries(storage.currentInStorage ?? {})
        .filter(([, e]) => e && e.quantity > 0)
        .sort(([, a], [, b]) => (b?.quantity ?? 0) - (a?.quantity ?? 0));

    const usedVol = storage.current.volume;
    const capVol = storage.capacity.volume * storage.scale;
    const usedMass = storage.current.mass;
    const capMass = storage.capacity.mass * storage.scale;

    return (
        <div className='mt-4'>
            <h3 className='text-sm font-medium mb-2'>Storage</h3>
            <div className='text-xs text-muted-foreground mb-2'>
                Volume: {Math.round(usedVol).toLocaleString()} / {Math.round(capVol).toLocaleString()} m³
                {' · '}
                Mass: {Math.round(usedMass).toLocaleString()} / {Math.round(capMass).toLocaleString()} t
            </div>
            {entries.length > 0 ? (
                <div className='grid grid-cols-2 sm:grid-cols-3 gap-1 text-xs'>
                    {entries.map(([name, entry]) => (
                        <div key={name} className='flex justify-between gap-2 px-1'>
                            <span className='truncate text-muted-foreground'>{name}</span>
                            <span className='tabular-nums font-medium'>
                                {Math.round(entry!.quantity).toLocaleString()}
                            </span>
                        </div>
                    ))}
                </div>
            ) : (
                <div className='text-xs text-muted-foreground'>Storage empty</div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

type PlanetAssets = {
    productionFacilities: ProductionFacility[];
    storageFacility: StorageFacility;
    allocatedWorkers: Record<EducationLevelType, number>;
    workerFeedback?: {
        unusedWorkers: Record<EducationLevelType, number>;
        unusedWorkerFraction: number;
        overqualifiedMatrix?: { [jobEdu in EducationLevelType]?: { [workerEdu in EducationLevelType]?: number } };
    };
    deaths?: { thisMonth: Record<EducationLevelType, number>; prevMonth: Record<EducationLevelType, number> };
    disabilities?: { thisMonth: Record<EducationLevelType, number>; prevMonth: Record<EducationLevelType, number> };
    retirements?: { thisMonth: Record<EducationLevelType, number>; prevMonth: Record<EducationLevelType, number> };
    workforceDemography?: WorkforceDemography;
    deposits: number;
    loans?: number;
    lastWageBill?: number;
    foodMarket?: {
        offerPrice?: number;
        offerQuantity?: number;
        lastSold?: number;
        lastRevenue?: number;
        priceDirection?: number;
    };
};

export default function AgentPlanetDetailPage() {
    const params = useParams<'/agents/[agentId]/[planetId]'>();
    const agentId = params.agentId;
    const planetId = params.planetId;
    const trpc = useTRPC();

    const { data, isLoading } = useSimulationQuery(
        trpc.simulation.getAgentPlanetDetail.queryOptions({ agentId, planetId }),
    );

    const tick = data?.tick ?? 0;
    const detail = data?.detail as {
        agentId: string;
        agentName: string;
        planetId: string;
        assets: PlanetAssets;
    } | null;
    const assets = detail?.assets;

    return (
        <Page
            title={detail ? `${detail.agentName} · ${detail.planetId}` : 'Planet Assets'}
            headerComponent={
                <Link
                    href={route({ pathname: '/agents/[agentId]', query: { agentId } })}
                    className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors'
                >
                    <ArrowLeft className='h-4 w-4' />
                    {detail?.agentName ?? 'Agent'}
                </Link>
            }
        >
            {!isLoading && tick > 0 && assets ? (
                <div className='space-y-6'>
                    {/* Production facilities */}
                    <ProductionFacilitiesPanel facilities={assets.productionFacilities ?? []} />

                    {/* Workforce demography */}
                    <WorkforceDemographyPanel
                        allocatedWorkers={assets.allocatedWorkers}
                        workforceDemography={assets.workforceDemography}
                        unusedWorkers={assets.workerFeedback?.unusedWorkers}
                        unusedWorkerFraction={assets.workerFeedback?.unusedWorkerFraction}
                        overqualifiedMatrix={assets.workerFeedback?.overqualifiedMatrix}
                        deathsThisMonth={assets.deaths?.thisMonth}
                        deathsPrevMonth={assets.deaths?.prevMonth}
                        disabilitiesThisMonth={assets.disabilities?.thisMonth}
                        disabilitiesPrevMonth={assets.disabilities?.prevMonth}
                        retirementsThisMonth={assets.retirements?.thisMonth}
                        retirementsPrevMonth={assets.retirements?.prevMonth}
                    />

                    {/* Storage */}
                    {assets.storageFacility && <StorageOverview storage={assets.storageFacility} />}

                    {/* Financial position */}
                    <AgentFinancialPanel
                        deposits={assets.deposits ?? 0}
                        loans={assets.loans ?? 0}
                        lastWageBill={assets.lastWageBill ?? 0}
                        foodMarket={assets.foodMarket}
                    />
                </div>
            ) : isLoading ? (
                <div className='text-sm text-muted-foreground'>Loading planet assets…</div>
            ) : (
                <div className='text-sm text-muted-foreground'>
                    Planet assets not found.{' '}
                    <Link href={route({ pathname: '/agents/[agentId]', query: { agentId } })} className='underline'>
                        Back to agent
                    </Link>
                </div>
            )}
        </Page>
    );
}
