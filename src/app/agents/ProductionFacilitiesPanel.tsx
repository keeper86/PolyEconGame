'use client';

import React from 'react';
import type { ProductionFacility, LastTickResults } from '../../simulation/facilities';
import type { EducationLevelType } from '../../simulation/planet';
import { educationLevels } from '../../simulation/planet';

// (colours reserved if we later make a chart here)

const eduLabel = (edu: EducationLevelType): string => educationLevels[edu].name;

const efficiencyColor = (frac: number): string => {
    if (frac >= 0.9) {
        return 'text-green-600';
    }
    if (frac >= 0.5) {
        return 'text-amber-500';
    }
    return 'text-red-500';
};

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

export default function ProductionFacilitiesPanel({
    facilities,
    totalProductionFacilities,
}: {
    facilities: ProductionFacility[];
    totalProductionFacilities?: number;
}): React.ReactElement {
    return (
        <div>
            <div className='mt-3 text-sm'>
                <div>Production facilities: {totalProductionFacilities ?? facilities.length}</div>
                <div className='mt-2 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2'>
                    {facilities && facilities.length > 0 ? (
                        facilities.map((f, idx) => (
                            <div key={f.id ?? idx} className='p-2 border rounded bg-white'>
                                <div className='flex justify-between items-baseline'>
                                    <div className='font-medium'>{f.name}</div>
                                    <div className='text-xs text-muted-foreground'>scale: {f.scale}</div>
                                </div>
                                <div className='text-xs mt-1'>
                                    <div>
                                        Produces:{' '}
                                        {f.produces?.map((p) => `${p.resource.name} (${p.quantity})`).join(', ') || '—'}
                                    </div>
                                    <div>
                                        Needs:{' '}
                                        {f.needs?.map((n) => `${n.resource.name} (${n.quantity})`).join(', ') || '—'}
                                    </div>
                                    <div className='mt-1'>
                                        Workers (per unit):{' '}
                                        {Object.entries(f.workerRequirement || {})
                                            .filter(([, v]) => v && v > 0)
                                            .map(([k, v]) => `${k}: ${v}`)
                                            .join(', ') || '—'}
                                    </div>
                                    {f.scale > 1 &&
                                        Object.values(f.workerRequirement || {}).some((v) => v && v > 0) && (
                                            <div className='ml-3 text-muted-foreground'>
                                                Required total:{' '}
                                                {Object.entries(f.workerRequirement || {})
                                                    .filter(([, v]) => v && v > 0)
                                                    .map(([k, v]) => `${k}: ${(v! * f.scale).toLocaleString()}`)
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
                                    {f.lastTickResults && <FacilityEfficiencyDetails results={f.lastTickResults} />}
                                    <div className='mt-1 text-xs'>
                                        Pollution: air {f.pollutionPerTick.air}, water {f.pollutionPerTick.water}, soil{' '}
                                        {f.pollutionPerTick.soil}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className='text-xs text-muted-foreground'>No facilities</div>
                    )}
                </div>
            </div>
        </div>
    );
}
