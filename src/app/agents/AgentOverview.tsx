'use client';

import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import type { Agent } from '../../simulation/planet';
import type { ProductionFacility } from '../../simulation/facilities';
import { Page } from '../../components/client/Page';
import WorkforceDemographyPanel from './WorkforceDemographyPanel';

/** One snapshot per tick, keyed by resource name → quantity. */
export type AgentResourceSnapshot = {
    tick: number;
    resources: Record<string, number>;
};

/** Time-series data passed in from SimulationPanel for each agent. */
export type AgentTimeSeries = {
    storage: AgentResourceSnapshot[];
    production: AgentResourceSnapshot[];
    consumption: AgentResourceSnapshot[];
};

type Props = {
    agents: Agent[];
    /** Keyed by agent id */
    timeSeries: Record<string, AgentTimeSeries>;
};

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

/** Stacked bar chart for a resource time-series (storage / production / consumption). */
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

    // Collect all resource names that appear in any snapshot
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

    // Build chart data: oldest → newest (snapshots are stored newest-first)
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
                        <XAxis
                            dataKey='tick'
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v) => (typeof v === 'number' ? String(v) : String(v))}
                        />
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

export default function AgentOverview({ agents, timeSeries }: Props): React.ReactElement {
    const summarize = (agent: Agent) => {
        let totalProductionFacilities = 0;
        const facilities: ProductionFacility[] = [];
        const storageTotals: Record<string, number> = {};
        const allocatedWorkers: Record<string, number> = {} as Record<string, number>;
        let mergedWorkforceDemography = undefined as Agent['assets'][string]['workforceDemography'];

        for (const assetsEntry of Object.values(agent.assets)) {
            totalProductionFacilities += assetsEntry.productionFacilities?.length ?? 0;
            if (assetsEntry.productionFacilities && assetsEntry.productionFacilities.length > 0) {
                facilities.push(...assetsEntry.productionFacilities);
            }
            const storage = assetsEntry.storageFacility;
            if (storage && storage.currentInStorage) {
                for (const [rname, entry] of Object.entries(storage.currentInStorage)) {
                    storageTotals[rname] = (storageTotals[rname] || 0) + (entry?.quantity || 0);
                }
            }
            if (assetsEntry.allocatedWorkers) {
                for (const [k, v] of Object.entries(assetsEntry.allocatedWorkers)) {
                    allocatedWorkers[k] = (allocatedWorkers[k] || 0) + (v || 0);
                }
            }
            // Use the first non-undefined workforce demography found
            if (!mergedWorkforceDemography && assetsEntry.workforceDemography) {
                mergedWorkforceDemography = assetsEntry.workforceDemography;
            }
        }

        return { totalProductionFacilities, storageTotals, allocatedWorkers, facilities, mergedWorkforceDemography };
    };

    return (
        <Page title='Agents'>
            {agents.map((a) => {
                const s = summarize(a);
                const series = timeSeries[a.id];
                return (
                    <div key={a.id} className='p-3 border rounded-md bg-surface-50'>
                        <div className='flex items-center justify-between'>
                            <div>
                                <div className='text-sm font-medium'>{a.name}</div>
                                <div className='text-xs text-muted-foreground'>Home: {a.associatedPlanetId}</div>
                            </div>
                            <div className='text-right'>
                                <div className='text-sm'>Wealth: {a.wealth}</div>
                                <div className='text-xs text-muted-foreground'>
                                    Ships: {a.transportShips?.length ?? 0}
                                </div>
                            </div>
                        </div>

                        <div className='mt-3 text-sm'>
                            <div>Production facilities: {s.totalProductionFacilities}</div>
                            {/* facility cards */}
                            <div className='mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2'>
                                {s.facilities && s.facilities.length > 0 ? (
                                    s.facilities.map((f, idx) => (
                                        <div key={f.id ?? idx} className='p-2 border rounded bg-white'>
                                            <div className='flex justify-between items-baseline'>
                                                <div className='font-medium'>{f.name}</div>
                                                <div className='text-xs text-muted-foreground'>scale: {f.scale}</div>
                                            </div>
                                            <div className='text-xs mt-1'>
                                                <div>
                                                    Produces:{' '}
                                                    {f.produces
                                                        ?.map((p) => `${p.resource.name} (${p.quantity})`)
                                                        .join(', ') || '—'}
                                                </div>
                                                <div>
                                                    Needs:{' '}
                                                    {f.needs
                                                        ?.map((n) => `${n.resource.name} (${n.quantity})`)
                                                        .join(', ') || '—'}
                                                </div>
                                                <div className='mt-1'>
                                                    Workers:{' '}
                                                    {Object.entries(f.workerRequirement || {})
                                                        .map(([k, v]) => `${k}: ${v}`)
                                                        .join(', ') || '—'}
                                                </div>
                                                <div className='mt-1'>
                                                    Efficiency:{' '}
                                                    <span className='font-medium'>
                                                        {typeof f.lastTickEfficiencyInPercent === 'number'
                                                            ? `${f.lastTickEfficiencyInPercent}%`
                                                            : '—'}
                                                    </span>
                                                </div>
                                                <div className='mt-1 text-xs'>
                                                    Pollution: air {f.pollutionPerTick.air}, water{' '}
                                                    {f.pollutionPerTick.water}, soil {f.pollutionPerTick.soil}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className='text-xs text-muted-foreground'>No facilities</div>
                                )}
                            </div>
                            <div className='mt-2'>Storage:</div>
                            <ul className='list-disc list-inside text-xs'>
                                {Object.keys(s.storageTotals).length === 0 ? (
                                    <li>— none —</li>
                                ) : (
                                    Object.entries(s.storageTotals).map(([k, v]) => (
                                        <li key={k}>
                                            {k}: {v}
                                        </li>
                                    ))
                                )}
                            </ul>

                            <div className='mt-2'>Allocated workers:</div>
                            <div className='text-xs'>
                                {Object.keys(s.allocatedWorkers).length === 0
                                    ? '— none —'
                                    : Object.entries(s.allocatedWorkers).map(([k, v]) => (
                                          <div key={k} className='inline-block mr-3'>
                                              {k}: {v}
                                          </div>
                                      ))}
                            </div>

                            {/* Workforce demography panel */}
                            <WorkforceDemographyPanel
                                allocatedWorkers={
                                    s.allocatedWorkers as Record<
                                        import('../../simulation/planet').EducationLevelType,
                                        number
                                    >
                                }
                                workforceDemography={s.mergedWorkforceDemography}
                            />

                            {/* Time-series charts */}
                            {series && (
                                <div className='mt-4 space-y-3'>
                                    <ResourceTimeSeriesChart title='Storage over time' snapshots={series.storage} />
                                    <ResourceTimeSeriesChart
                                        title='Production over time'
                                        snapshots={series.production}
                                    />
                                    <ResourceTimeSeriesChart
                                        title='Consumption over time'
                                        snapshots={series.consumption}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </Page>
    );
}
