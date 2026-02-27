'use client';

import PlanetDemography from '@/app/planets/PlanetDemography';
import PlanetPopulationChartRecharts from '@/app/planets/PlanetPopulationChartRecharts';
import React from 'react';
import type { Planet, Population, ResourceClaim, ResourceQuantity } from '../../simulation/planet';

type ResourceEntry = ResourceQuantity & ResourceClaim;

type Props = {
    planet: Planet;
    history: { tick: number; value: number }[];
    latestPopulation?: Population | undefined;
};

export default function PlanetDetails({ planet, history, latestPopulation }: Props): React.ReactElement {
    const latestValue = history?.[0]?.value ?? '—';
    const p = planet;
    const name = p.name;
    const position = p.position;
    const resources = p.resources;
    const infrastructure = p.infrastructure;
    const environment = p.environment;
    // derived values

    return (
        <div className='p-4 border rounded mt-4'>
            <div className='flex items-center justify-between mb-1'>
                <h2 className='font-medium text-sm'>{name}</h2>
                <div className='text-xs text-gray-500'>Latest: {latestValue}</div>
            </div>

            <div className='space-y-4'>
                <div>
                    <PlanetPopulationChartRecharts data={history ?? []} />
                </div>

                <div>
                    <PlanetDemography population={latestPopulation} />
                </div>

                <div className='text-sm'>
                    <div className='mb-2 font-semibold'>Details</div>
                    <div className='text-xs text-gray-600'>
                        <div className='mb-1'>
                            <strong>Position:</strong>{' '}
                            {position &&
                            typeof position.x !== 'undefined' &&
                            typeof position.y !== 'undefined' &&
                            typeof position.z !== 'undefined'
                                ? `${String(position.x)}, ${String(position.y)}, ${String(position.z)}`
                                : '—'}
                        </div>

                        <div className='mb-1'>
                            <strong>Resources:</strong>
                            {resources && typeof resources === 'object' && Object.keys(resources).length > 0 ? (
                                <ul className='list-disc ml-5 text-xs'>
                                    {Object.entries(resources).map(([resName, entries]) => {
                                        // entries is an array of resource claims / quantities
                                        const total = Array.isArray(entries)
                                            ? entries.reduce((s, e: ResourceEntry) => s + (e.quantity || 0), 0)
                                            : 0;
                                        return (
                                            <li key={resName}>
                                                {resName} — {total}
                                                {Array.isArray(entries) && entries.length > 0 ? (
                                                    <ul className='ml-4 list-disc'>
                                                        {entries.map((e: ResourceEntry) => (
                                                            <li
                                                                key={e.id ?? e.type?.name ?? Math.random()}
                                                                className='text-xs'
                                                            >
                                                                id: {e.id ?? '—'} — qty: {e.quantity}{' '}
                                                                {e.tenant ? (
                                                                    <span>
                                                                        (tenant: {e.tenant.name ?? e.tenant.id})
                                                                    </span>
                                                                ) : null}
                                                                {e.claim ? (
                                                                    <span>
                                                                        {' '}
                                                                        (claimed by {e.claim.name ?? e.claim.id})
                                                                    </span>
                                                                ) : null}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : null}
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <div className='text-xs text-gray-500'>—</div>
                            )}
                        </div>

                        <div className='mb-1'>
                            <strong>Infrastructure:</strong>
                            <div className='text-xs text-gray-500'>
                                {infrastructure ? JSON.stringify(infrastructure) : '—'}
                            </div>
                        </div>

                        <div className='mb-1'>
                            <strong>Environment:</strong>
                            <div className='text-xs text-gray-500'>
                                {environment ? JSON.stringify(environment) : '—'}
                            </div>
                        </div>
                        <div className='mb-1'>
                            <strong>Starvation:</strong>
                            <div className='text-xs text-gray-500'>
                                {(() => {
                                    const pop = latestPopulation ?? p.population;
                                    const lvl = pop?.starvationLevel;
                                    if (typeof lvl === 'number') {
                                        return `${(lvl * 100).toFixed(2)} %`;
                                    }
                                    return '—';
                                })()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
