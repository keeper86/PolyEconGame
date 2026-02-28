'use client';

import React from 'react';
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Page } from '../../components/client/Page';
import type { LastTickResults, ProductionFacility } from '../../simulation/facilities';
import type { Agent, EducationLevelType } from '../../simulation/planet';
import { educationLevels } from '../../simulation/planet';
import WorkforceDemographyPanel from './WorkforceDemographyPanelNew2';

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

/** Human-readable label for an education level. */
const eduLabel = (edu: EducationLevelType): string => educationLevels[edu].name;

/** Colour class based on an efficiency fraction (0-1). */
const efficiencyColor = (frac: number): string => {
    if (frac >= 0.9) {
        return 'text-green-600';
    }
    if (frac >= 0.5) {
        return 'text-amber-500';
    }
    return 'text-red-500';
};

/** Format a 0-1 fraction as "XX%" */
const pctStr = (frac: number): string => `${Math.round(frac * 100)}%`;

/** Render the detailed last-tick results for a production facility. */
function FacilityEfficiencyDetails({ results }: { results: LastTickResults }): React.ReactElement {
    const workerEntries = Object.entries(results.workerEfficiency) as [EducationLevelType, number][];
    const resourceEntries = Object.entries(results.resourceEfficiency);
    const overqualifiedEntries = Object.entries(results.overqualifiedWorkers) as [
        EducationLevelType,
        { [workerEdu in EducationLevelType]?: number } | undefined,
    ][];
    const hasOverqualified = overqualifiedEntries.some(
        ([, breakdown]) => breakdown && Object.values(breakdown).some((v) => v && v > 0),
    );

    return (
        <div className='mt-1 space-y-1'>
            {/* Worker efficiency */}
            {workerEntries.length > 0 && (
                <div>
                    <span className='text-muted-foreground'>Workers</span>{' '}
                    <span className={`font-medium ${efficiencyColor(results.workerEfficiencyOverall)}`}>
                        {pctStr(results.workerEfficiencyOverall)}
                    </span>
                    <div className='ml-3 flex flex-wrap gap-x-3'>
                        {workerEntries.map(([edu, eff]) => (
                            <span key={edu}>
                                <span className='text-muted-foreground'>{eduLabel(edu)}:</span>{' '}
                                <span className={efficiencyColor(eff)}>{pctStr(eff)}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}
            {/* Resource efficiency */}
            {resourceEntries.length > 0 && (
                <div>
                    <span className='text-muted-foreground'>Resources</span>{' '}
                    <span className={`font-medium ${efficiencyColor(Math.min(...resourceEntries.map(([, v]) => v)))}`}>
                        {pctStr(Math.min(...resourceEntries.map(([, v]) => v)))}
                    </span>
                    <div className='ml-3 flex flex-wrap gap-x-3'>
                        {resourceEntries.map(([name, eff]) => (
                            <span key={name}>
                                <span className='text-muted-foreground'>{name}:</span>{' '}
                                <span className={efficiencyColor(eff)}>{pctStr(eff)}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}
            {/* Overqualified workers — per-job, per-worker-edu breakdown */}
            {hasOverqualified && (
                <div>
                    <span className='text-muted-foreground'>Overqualified:</span>
                    <div className='ml-3'>
                        {overqualifiedEntries.map(([jobEdu, breakdown]) => {
                            if (!breakdown) {
                                return null;
                            }
                            const parts = (
                                Object.entries(breakdown) as [EducationLevelType, number | undefined][]
                            ).filter(([, v]) => v && v > 0);
                            if (parts.length === 0) {
                                return null;
                            }
                            return (
                                <div key={jobEdu}>
                                    <span className='text-muted-foreground'>{eduLabel(jobEdu)} slots ←</span>{' '}
                                    {parts.map(([wEdu, count]) => (
                                        <span key={wEdu} className='mr-2 text-amber-500'>
                                            {eduLabel(wEdu)} ×{count}
                                        </span>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

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
        const rawRequirement: Record<string, number> = {} as Record<string, number>;
        const unusedWorkers: Record<string, number> = {} as Record<string, number>;
        const hiredThisTick: Record<string, number> = {} as Record<string, number>;
        const firedThisTick: Record<string, number> = {} as Record<string, number>;
        let unusedWorkerFraction = 0;
        type OQMatrix = { [jobEdu in EducationLevelType]?: { [workerEdu in EducationLevelType]?: number } };
        const overqualifiedMatrix: OQMatrix = {};
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
            // Sum raw (exact-match) worker requirements from facilities
            if (assetsEntry.productionFacilities) {
                for (const facility of assetsEntry.productionFacilities) {
                    for (const [edu, req] of Object.entries(facility.workerRequirement)) {
                        if (req && req > 0) {
                            rawRequirement[edu] = (rawRequirement[edu] || 0) + Math.ceil(req * facility.scale);
                        }
                    }
                }
            }
            if (assetsEntry.unusedWorkers) {
                for (const [k, v] of Object.entries(assetsEntry.unusedWorkers)) {
                    unusedWorkers[k] = (unusedWorkers[k] || 0) + (v || 0);
                }
            }
            if (assetsEntry.hiredThisTick) {
                for (const [k, v] of Object.entries(assetsEntry.hiredThisTick)) {
                    hiredThisTick[k] = (hiredThisTick[k] || 0) + (v || 0);
                }
            }
            if (assetsEntry.firedThisTick) {
                for (const [k, v] of Object.entries(assetsEntry.firedThisTick)) {
                    firedThisTick[k] = (firedThisTick[k] || 0) + (v || 0);
                }
            }
            unusedWorkerFraction = Math.max(unusedWorkerFraction, assetsEntry.unusedWorkerFraction ?? 0);
            // Merge overqualified matrix
            if (assetsEntry.overqualifiedMatrix) {
                for (const [jobEdu, breakdown] of Object.entries(assetsEntry.overqualifiedMatrix)) {
                    const je = jobEdu as EducationLevelType;
                    if (!breakdown) {
                        continue;
                    }
                    if (!overqualifiedMatrix[je]) {
                        overqualifiedMatrix[je] = {};
                    }
                    for (const [workerEdu, count] of Object.entries(breakdown)) {
                        const we = workerEdu as EducationLevelType;
                        overqualifiedMatrix[je]![we] = (overqualifiedMatrix[je]![we] ?? 0) + (count ?? 0);
                    }
                }
            }
            // Use the first non-undefined workforce demography found
            if (!mergedWorkforceDemography && assetsEntry.workforceDemography) {
                mergedWorkforceDemography = assetsEntry.workforceDemography;
            }
        }

        return {
            totalProductionFacilities,
            storageTotals,
            allocatedWorkers,
            rawRequirement,
            unusedWorkers,
            unusedWorkerFraction,
            hiredThisTick,
            firedThisTick,
            overqualifiedMatrix,
            facilities,
            mergedWorkforceDemography,
        };
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
                            <div className='mt-2 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2'>
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
                                                    Workers (per unit):{' '}
                                                    {Object.entries(f.workerRequirement || {})
                                                        .filter(([, v]) => v && v > 0)
                                                        .map(([k, v]) => `${k}: ${v}`)
                                                        .join(', ') || '—'}
                                                </div>
                                                {f.scale > 1 &&
                                                    Object.values(f.workerRequirement || {}).some(
                                                        (v) => v && v > 0,
                                                    ) && (
                                                        <div className='ml-3 text-muted-foreground'>
                                                            Required total:{' '}
                                                            {Object.entries(f.workerRequirement || {})
                                                                .filter(([, v]) => v && v > 0)
                                                                .map(
                                                                    ([k, v]) =>
                                                                        `${k}: ${(v! * f.scale).toLocaleString()}`,
                                                                )
                                                                .join(', ')}
                                                        </div>
                                                    )}
                                                <div className='mt-1'>
                                                    Efficiency:{' '}
                                                    <span
                                                        className={`font-medium ${f.lastTickResults ? efficiencyColor(f.lastTickResults.overallEfficiency) : ''}`}
                                                    >
                                                        {f.lastTickResults
                                                            ? pctStr(f.lastTickResults.overallEfficiency)
                                                            : typeof f.lastTickEfficiencyInPercent === 'number'
                                                              ? `${f.lastTickEfficiencyInPercent}%`
                                                              : '—'}
                                                    </span>
                                                </div>
                                                {f.lastTickResults && (
                                                    <FacilityEfficiencyDetails results={f.lastTickResults} />
                                                )}
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

                            {/* Workforce demography panel */}
                            <WorkforceDemographyPanel
                                allocatedWorkers={
                                    s.allocatedWorkers as Record<
                                        import('../../simulation/planet').EducationLevelType,
                                        number
                                    >
                                }
                                workforceDemography={s.mergedWorkforceDemography}
                                unusedWorkers={
                                    s.unusedWorkers as Record<
                                        import('../../simulation/planet').EducationLevelType,
                                        number
                                    >
                                }
                                unusedWorkerFraction={s.unusedWorkerFraction}
                                overqualifiedMatrix={s.overqualifiedMatrix}
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
