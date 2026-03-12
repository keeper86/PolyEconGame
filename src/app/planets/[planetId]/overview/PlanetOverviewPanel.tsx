'use client';

import React from 'react';
import PlanetPopulationHistoryChart from './PlanetPopulationHistoryChart';

type ResourceEntry = {
    id?: string;
    quantity?: number;
    claimAgentId?: string | null;
    tenantAgentId?: string | null;
};

type OverviewData = {
    id: string;
    name: string;
    position: { x: number; y: number; z: number };
    populationTotal: number;
    starvationLevel: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resources: Record<string, any[]>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    infrastructure: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    environment: any;
};

type Props = {
    overview: OverviewData;
    tick: number;
};

export default function PlanetOverviewPanel({ overview, tick }: Props): React.ReactElement {
    const live = {
        tick,
        population: overview.populationTotal,
        starvationLevel: overview.starvationLevel,
    };

    return (
        <div className='space-y-4'>
            {/* Population history chart */}
            <div className='border rounded-md p-3'>
                <h4 className='text-sm font-semibold mb-2'>Population History</h4>
                <PlanetPopulationHistoryChart planetId={overview.id} live={live} />
            </div>

            {/* Position */}
            <div className='border rounded-md p-3'>
                <h4 className='text-sm font-semibold mb-2'>Position</h4>
                <div className='text-xs text-muted-foreground'>
                    {overview.position
                        ? `x: ${overview.position.x}, y: ${overview.position.y}, z: ${overview.position.z}`
                        : '—'}
                </div>
            </div>

            {/* Resources */}
            <div className='border rounded-md p-3'>
                <h4 className='text-sm font-semibold mb-2'>Resources</h4>
                {overview.resources && Object.keys(overview.resources).length > 0 ? (
                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
                        {Object.entries(overview.resources).map(([resName, entries]) => {
                            const total = Array.isArray(entries)
                                ? entries.reduce((s, e: ResourceEntry) => s + (e.quantity || 0), 0)
                                : 0;
                            return (
                                <div key={resName} className='border rounded p-2'>
                                    <div className='flex justify-between items-baseline'>
                                        <span className='text-xs font-medium'>{resName}</span>
                                        <span className='text-xs tabular-nums text-muted-foreground'>
                                            {Math.round(total).toLocaleString()} total
                                        </span>
                                    </div>
                                    {Array.isArray(entries) && entries.length > 0 && (
                                        <div className='mt-1 space-y-0.5'>
                                            {entries.map((e: ResourceEntry, i: number) => (
                                                <div
                                                    key={e.id ?? i}
                                                    className='text-[11px] text-muted-foreground flex justify-between'
                                                >
                                                    <span>
                                                        {e.id ?? '—'}
                                                        {e.tenantAgentId ? ` (tenant: ${e.tenantAgentId})` : ''}
                                                        {e.claimAgentId ? ` (claimed: ${e.claimAgentId})` : ''}
                                                    </span>
                                                    <span className='tabular-nums'>{e.quantity}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className='text-xs text-muted-foreground'>No resources</div>
                )}
            </div>

            {/* Infrastructure */}
            <div className='border rounded-md p-3'>
                <h4 className='text-sm font-semibold mb-2'>Infrastructure</h4>
                {overview.infrastructure ? (
                    <div className='grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs'>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Primary schools</span>
                            <span className='tabular-nums font-medium'>{overview.infrastructure.primarySchools}</span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Secondary schools</span>
                            <span className='tabular-nums font-medium'>{overview.infrastructure.secondarySchools}</span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Universities</span>
                            <span className='tabular-nums font-medium'>{overview.infrastructure.universities}</span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Hospitals</span>
                            <span className='tabular-nums font-medium'>{overview.infrastructure.hospitals}</span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Energy (MWh)</span>
                            <span className='tabular-nums font-medium'>
                                {overview.infrastructure.energy?.production?.toLocaleString() ?? '—'}
                            </span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Spaceports</span>
                            <span className='tabular-nums font-medium'>
                                {overview.infrastructure.mobility?.spaceports ?? '—'}
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className='text-xs text-muted-foreground'>—</div>
                )}
            </div>

            {/* Environment */}
            <div className='border rounded-md p-3'>
                <h4 className='text-sm font-semibold mb-2'>Environment</h4>
                {overview.environment ? (
                    <div className='grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs'>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Air pollution</span>
                            <span className='tabular-nums font-medium'>
                                {overview.environment.pollution?.air?.toFixed(1) ?? '—'}
                            </span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Water pollution</span>
                            <span className='tabular-nums font-medium'>
                                {overview.environment.pollution?.water?.toFixed(1) ?? '—'}
                            </span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Soil pollution</span>
                            <span className='tabular-nums font-medium'>
                                {overview.environment.pollution?.soil?.toFixed(1) ?? '—'}
                            </span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Earthquakes/yr</span>
                            <span className='tabular-nums font-medium'>
                                {overview.environment.naturalDisasters?.earthquakes ?? '—'}
                            </span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Floods/yr</span>
                            <span className='tabular-nums font-medium'>
                                {overview.environment.naturalDisasters?.floods ?? '—'}
                            </span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Storms/yr</span>
                            <span className='tabular-nums font-medium'>
                                {overview.environment.naturalDisasters?.storms ?? '—'}
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className='text-xs text-muted-foreground'>—</div>
                )}
            </div>
        </div>
    );
}
