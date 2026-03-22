'use client';

import AgentFinancialPanel from '@/app/planets/[planetId]/agent/_component/AgentFinancialPanel';
import AutomationPanel from '@/app/planets/[planetId]/agent/_component/AutomationPanel';
import LoanPanel from '@/app/planets/[planetId]/agent/_component/LoanPanel';
import ProductionFacilitiesPanel from '@/app/planets/[planetId]/agent/_component/ProductionFacilitiesPanel';
import SellOffersPanel from '@/app/planets/[planetId]/agent/_component/SellOffersPanel';
import WorkerAllocationPanel from '@/app/planets/[planetId]/agent/_component/WorkerAllocationPanel';
import WorkforceDemographyPanel from '@/app/planets/[planetId]/agent/_component/WorkforceDemographyPanel';
import BuildFacilityDialog from '@/app/planets/[planetId]/agent/_component/BuildFacilityDialog';
import type { WorkforceDemography } from '@/app/planets/[planetId]/agent/_component/workforce-summary';
import { Page } from '@/components/client/Page';
import { useTRPC } from '@/lib/trpc';
import { type ProductionFacility, type StorageFacility } from '@/simulation/planet/storage';
import type { EducationLevelType } from '@/simulation/population/education';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useAgentId } from '@/hooks/useAgentId';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { route } from 'nextjs-routes';
import React from 'react';
import { agriculturalProductResourceType } from '@/simulation/planet/resources';

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
    deaths?: { thisMonth: Record<EducationLevelType, number>; prevMonth: Record<EducationLevelType, number> };
    disabilities?: { thisMonth: Record<EducationLevelType, number>; prevMonth: Record<EducationLevelType, number> };
    retirements?: { thisMonth: Record<EducationLevelType, number>; prevMonth: Record<EducationLevelType, number> };
    workforceDemography?: WorkforceDemography;
    deposits: number;
    loans?: number;
    lastWageBill?: number;
    market?: {
        sell: {
            [resourceName: string]: {
                offerPrice?: number;
                offerQuantity?: number;
                lastSold?: number;
                lastRevenue?: number;
                priceDirection?: number;
            };
        };
    };
};

export default function AgentPlanetDetailPage() {
    const params = useParams<'/agents/[agentId]/[planetId]'>();
    const agentId = params.agentId;
    const planetId = params.planetId;
    const trpc = useTRPC();
    const myAgentId = useAgentId();

    const { data, isLoading } = useSimulationQuery(
        trpc.simulation.getAgentPlanetDetail.queryOptions({ agentId, planetId }),
    );

    const tick = data?.tick ?? 0;
    const detail = data?.detail as {
        agentId: string;
        agentName: string;
        planetId: string;
        automateWorkerAllocation: boolean;
        automatePricing: boolean;
        assets: PlanetAssets;
    } | null;
    const assets = detail?.assets;

    // Wait until agentId has resolved before checking ownership
    const isOwnAgent = myAgentId.agentId === agentId;

    // Access denied – show an in-game style message once the session and user data have loaded
    if (!myAgentId.isLoading && !isOwnAgent) {
        return (
            <Page
                title='Restricted Area'
                headerComponent={
                    <Link
                        href={route({ pathname: '/agents/[agentId]', query: { agentId } })}
                        className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors'
                    >
                        <ArrowLeft className='h-4 w-4' />
                        Back
                    </Link>
                }
            >
                <div className='flex flex-col items-center justify-center gap-4 py-16 text-center'>
                    <ShieldAlert className='h-12 w-12 text-muted-foreground' />
                    <h2 className='text-xl font-semibold'>Classified Operations</h2>
                    <p className='text-sm text-muted-foreground max-w-sm'>
                        You do not have clearance to view the internal operations of this company. Only the
                        company&apos;s owner can access these facilities.
                    </p>
                    <Link
                        href={route({ pathname: '/agents/[agentId]', query: { agentId } })}
                        className='text-sm underline underline-offset-4 text-muted-foreground hover:text-foreground transition-colors'
                    >
                        View public company profile
                    </Link>
                </div>
            </Page>
        );
    }

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
                    <div className='space-y-2'>
                        <ProductionFacilitiesPanel facilities={assets.productionFacilities ?? []} />
                        {isOwnAgent && <BuildFacilityDialog />}
                    </div>

                    {/* Workforce demography */}
                    <WorkforceDemographyPanel
                        allocatedWorkers={assets.allocatedWorkers}
                        workforceDemography={assets.workforceDemography}
                        unusedWorkers={undefined}
                        unusedWorkerFraction={undefined}
                        overqualifiedMatrix={undefined}
                        deathsThisMonth={assets.deaths?.thisMonth}
                        deathsPrevMonth={assets.deaths?.prevMonth}
                        disabilitiesThisMonth={assets.disabilities?.thisMonth}
                        disabilitiesPrevMonth={assets.disabilities?.prevMonth}
                        retirementsThisMonth={assets.retirements?.thisMonth}
                        retirementsPrevMonth={assets.retirements?.prevMonth}
                    />

                    {/* Manual workforce allocation — only visible to the agent's owner */}
                    {isOwnAgent && (
                        <WorkerAllocationPanel
                            agentId={agentId}
                            planetId={planetId}
                            allocatedWorkers={assets.allocatedWorkers ?? {}}
                            automateWorkerAllocation={detail?.automateWorkerAllocation ?? false}
                        />
                    )}

                    {/* Manual sell offers — only visible to the agent's owner */}
                    {isOwnAgent && (
                        <SellOffersPanel
                            agentId={agentId}
                            planetId={planetId}
                            sellOffers={assets.market?.sell ?? {}}
                            automatePricing={detail?.automatePricing ?? false}
                        />
                    )}

                    {/* Storage */}
                    {assets.storageFacility && <StorageOverview storage={assets.storageFacility} />}

                    {/* Financial position */}
                    <AgentFinancialPanel
                        deposits={assets.deposits ?? 0}
                        loans={assets.loans ?? 0}
                        lastWageBill={assets.lastWageBill ?? 0}
                        foodMarket={assets.market?.sell[agriculturalProductResourceType.name]}
                    />

                    {/* Borrowing panel — only visible to the agent's owner */}
                    {isOwnAgent && <LoanPanel agentId={agentId} planetId={planetId} />}

                    {/* Automation controls — only visible to the agent's owner */}
                    {isOwnAgent && (
                        <AutomationPanel
                            agentId={agentId}
                            automateWorkerAllocation={detail?.automateWorkerAllocation ?? false}
                            automatePricing={detail?.automatePricing ?? false}
                        />
                    )}
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
