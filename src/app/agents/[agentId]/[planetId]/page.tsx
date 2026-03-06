'use client';

import type { AgentResourceSnapshot } from '@/app/agents/AgentOverview';
import AgentFinancialPanel from '@/app/agents/AgentFinancialPanel';
import ProductionFacilitiesPanel from '@/app/agents/ProductionFacilitiesPanel';
import WorkforceDemographyPanel from '@/app/agents/WorkforceDemographyPanel';
import { Page } from '@/components/client/Page';
import TickDisplay from '@/components/client/TickDisplay';
import { useAgentHistory } from '@/hooks/useAgentData';
import { useTRPC } from '@/lib/trpc';
import type { ProductionFacility, StorageFacility } from '@/simulation/facilities';
import type { EducationLevelType } from '@/simulation/planet';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { route } from 'nextjs-routes';
import React from 'react';
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const REFETCH_INTERVAL_MS = 1000;

const COLORS = [
    '#60a5fa',
    '#34d399',
    '#f59e0b',
    '#f97316',
    '#ef4444',
    '#8b5cf6',
    '#ec4899',
    '#14b8a6',
    '#a3e635',
    '#f43f5e',
];

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
/*  Resource time-series chart (reused from AgentOverview pattern)     */
/* ------------------------------------------------------------------ */

function ResourceTimeSeriesChart({
    title,
    snapshots,
}: {
    title: string;
    snapshots: AgentResourceSnapshot[];
}): React.ReactElement {
    if (!snapshots || snapshots.length === 0) {
        return <div className='text-xs text-muted-foreground'>No {title.toLowerCase()} data yet</div>;
    }

    const resourceNames = Array.from(
        snapshots.reduce<Set<string>>((set, s) => {
            for (const rName of Object.keys(s.resources)) {
                set.add(rName);
            }
            return set;
        }, new Set()),
    ).sort();

    if (resourceNames.length === 0) {
        return <div className='text-xs text-muted-foreground'>No {title.toLowerCase()} data yet</div>;
    }

    const chartData = snapshots
        .slice()
        .reverse()
        .map((s) => {
            const row: Record<string, number | string> = { tick: s.tick };
            for (const rName of resourceNames) {
                row[rName] = s.resources[rName] ?? 0;
            }
            return row;
        });

    return (
        <div>
            <h5 className='text-xs font-medium mb-1'>{title}</h5>
            <div style={{ width: '100%', height: 160 }}>
                <ResponsiveContainer width='100%' height='100%'>
                    <BarChart data={chartData} margin={{ top: 6, right: 6, left: 6, bottom: 6 }}>
                        <XAxis dataKey='tick' tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Legend verticalAlign='top' height={20} wrapperStyle={{ fontSize: 10 }} />
                        {resourceNames.map((rName, idx) => (
                            <Bar
                                key={rName}
                                dataKey={rName}
                                stackId='a'
                                fill={COLORS[idx % COLORS.length]}
                                name={rName}
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  History charts wrapper                                             */
/* ------------------------------------------------------------------ */

function AgentStorageHistoryCharts({ agentId }: { agentId: string }): React.ReactElement {
    const { series } = useAgentHistory();

    if (series.storage.length === 0) {
        return <div className='text-xs text-muted-foreground'>No history data for agent {agentId} yet</div>;
    }

    return (
        <div className='mt-4 space-y-3'>
            <ResourceTimeSeriesChart title='Storage over time' snapshots={series.storage} />
            <ResourceTimeSeriesChart title='Production over time' snapshots={series.production} />
            <ResourceTimeSeriesChart title='Consumption over time' snapshots={series.consumption} />
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
    unusedWorkers?: Record<EducationLevelType, number>;
    unusedWorkerFraction?: number;
    overqualifiedMatrix?: { [jobEdu in EducationLevelType]?: { [workerEdu in EducationLevelType]?: number } };
    hiredThisTick?: Record<EducationLevelType, number>;
    firedThisTick?: Record<EducationLevelType, number>;
    deathsThisMonth?: Record<EducationLevelType, number>;
    deathsPrevMonth?: Record<EducationLevelType, number>;
    availableOnMarket?: Record<EducationLevelType, number>;
    workforceDemography?: import('@/simulation/planet').WorkforceDemography;
};

export default function AgentPlanetDetailPage() {
    const params = useParams<'/agents/[agentId]/[planetId]'>();
    const agentId = params.agentId;
    const planetId = params.planetId;
    const trpc = useTRPC();

    const { data, isLoading } = useQuery({
        ...trpc.simulation.getAgentPlanetDetail.queryOptions({ agentId, planetId }),
        refetchInterval: REFETCH_INTERVAL_MS,
    });

    const tick = data?.tick ?? 0;
    const detail = data?.detail as {
        agentId: string;
        agentName: string;
        planetId: string;
        deposits: number;
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
            <div className='mb-4'>
                <TickDisplay tick={tick} />
            </div>

            {!isLoading && tick > 0 && assets ? (
                <div className='space-y-6'>
                    {/* Production facilities */}
                    <ProductionFacilitiesPanel facilities={assets.productionFacilities ?? []} />

                    {/* Workforce demography */}
                    <WorkforceDemographyPanel
                        allocatedWorkers={assets.allocatedWorkers}
                        workforceDemography={assets.workforceDemography}
                        unusedWorkers={assets.unusedWorkers}
                        unusedWorkerFraction={assets.unusedWorkerFraction}
                        overqualifiedMatrix={assets.overqualifiedMatrix}
                        deathsThisMonth={assets.deathsThisMonth}
                        deathsPrevMonth={assets.deathsPrevMonth}
                        availableOnMarket={assets.availableOnMarket}
                    />

                    {/* Storage */}
                    {assets.storageFacility && <StorageOverview storage={assets.storageFacility} />}
                    <AgentStorageHistoryCharts agentId={agentId} />

                    {/* Financial position */}
                    <AgentFinancialPanel
                        deposits={detail?.deposits ?? 0}
                        workforceDemography={assets.workforceDemography}
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
