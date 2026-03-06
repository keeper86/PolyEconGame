'use client';

import React from 'react';
import type { Planet, ResourceQuantity, ResourceClaim } from '@/simulation/planet';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type ResourceEntry = ResourceQuantity & ResourceClaim;

type Props = {
    planet: Planet;
    populationTotal: number;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * PlanetOverviewPanel — compact summary of position, resources, infrastructure
 * and environment for the Overview tab.
 */
export default function PlanetOverviewPanel({ planet, populationTotal: _populationTotal }: Props): React.ReactElement {
    const p = planet;

    return (
        <div className='space-y-4'>
            {/* Position */}
            <div className='border rounded-md p-3'>
                <h4 className='text-sm font-semibold mb-2'>Position</h4>
                <div className='text-xs text-muted-foreground'>
                    {p.position ? `x: ${p.position.x}, y: ${p.position.y}, z: ${p.position.z}` : '—'}
                </div>
            </div>

            {/* Resources */}
            <div className='border rounded-md p-3'>
                <h4 className='text-sm font-semibold mb-2'>Resources</h4>
                {p.resources && Object.keys(p.resources).length > 0 ? (
                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
                        {Object.entries(p.resources).map(([resName, entries]) => {
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
                                            {entries.map((e: ResourceEntry) => (
                                                <div
                                                    key={e.id ?? Math.random()}
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
                {p.infrastructure ? (
                    <div className='grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs'>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Primary schools</span>
                            <span className='tabular-nums font-medium'>{p.infrastructure.primarySchools}</span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Secondary schools</span>
                            <span className='tabular-nums font-medium'>{p.infrastructure.secondarySchools}</span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Universities</span>
                            <span className='tabular-nums font-medium'>{p.infrastructure.universities}</span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Hospitals</span>
                            <span className='tabular-nums font-medium'>{p.infrastructure.hospitals}</span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Energy (MWh)</span>
                            <span className='tabular-nums font-medium'>
                                {p.infrastructure.energy.production.toLocaleString()}
                            </span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Spaceports</span>
                            <span className='tabular-nums font-medium'>{p.infrastructure.mobility.spaceports}</span>
                        </div>
                    </div>
                ) : (
                    <div className='text-xs text-muted-foreground'>—</div>
                )}
            </div>

            {/* Environment */}
            <div className='border rounded-md p-3'>
                <h4 className='text-sm font-semibold mb-2'>Environment</h4>
                {p.environment ? (
                    <div className='grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs'>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Air pollution</span>
                            <span className='tabular-nums font-medium'>{p.environment.pollution.air.toFixed(1)}</span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Water pollution</span>
                            <span className='tabular-nums font-medium'>{p.environment.pollution.water.toFixed(1)}</span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Soil pollution</span>
                            <span className='tabular-nums font-medium'>{p.environment.pollution.soil.toFixed(1)}</span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Earthquakes/yr</span>
                            <span className='tabular-nums font-medium'>
                                {p.environment.naturalDisasters.earthquakes}
                            </span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Floods/yr</span>
                            <span className='tabular-nums font-medium'>{p.environment.naturalDisasters.floods}</span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Storms/yr</span>
                            <span className='tabular-nums font-medium'>{p.environment.naturalDisasters.storms}</span>
                        </div>
                    </div>
                ) : (
                    <div className='text-xs text-muted-foreground'>—</div>
                )}
            </div>
        </div>
    );
}
