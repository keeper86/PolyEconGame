'use client';

import React from 'react';
import type { EducationLevelType } from '../../simulation/planet';
import { educationLevelKeys } from '../../simulation/planet';
import { Badge } from '../../components/ui/badge';
import { eduLabel, fmt, sumByEdu, pct, EDU_COLORS } from './workforce-theme';

// ---------------------------------------------------------------------------
// Headcount table — one row per education level
// ---------------------------------------------------------------------------

export function HeadcountTable({
    allocatedWorkers,
    activeByEdu,
    departingByEdu,
    retiringByEdu,
    meanAgeByEdu,
    ageProductivityByEdu,
    unusedWorkers,
}: {
    allocatedWorkers: Record<EducationLevelType, number>;
    activeByEdu: Record<EducationLevelType, number>;
    departingByEdu: Record<EducationLevelType, number>;
    retiringByEdu: Record<EducationLevelType, number>;
    meanAgeByEdu: Record<EducationLevelType, number>;
    ageProductivityByEdu: Record<EducationLevelType, number>;
    unusedWorkers?: Record<EducationLevelType, number>;
}): React.ReactElement {
    const hasUnused = unusedWorkers !== undefined;

    return (
        <div className='overflow-x-auto rounded-lg border'>
            <table className='w-full text-xs border-collapse'>
                <thead>
                    <tr className='border-b text-left bg-muted/30'>
                        <th className='py-1.5 px-2 font-medium'>Education</th>
                        <th className='py-1.5 px-2 font-medium text-right'>Target</th>
                        <th className='py-1.5 px-2 font-medium text-right'>Active</th>
                        <th className='py-1.5 px-2 font-medium text-right'>Departing</th>
                        {hasUnused && <th className='py-1.5 px-2 font-medium text-right'>Unused</th>}
                        <th className='py-1.5 px-2 font-medium text-right'>Avg Age</th>
                        <th className='py-1.5 px-2 font-medium text-right'>Age Prod.</th>
                        <th className='py-1.5 px-2 font-medium text-right'>Δ</th>
                    </tr>
                </thead>
                <tbody>
                    {educationLevelKeys.map((edu) => {
                        const target = allocatedWorkers[edu] ?? 0;
                        const active = activeByEdu[edu];
                        const departing = departingByEdu[edu];
                        const retiring = retiringByEdu[edu];
                        const totalDep = departing + retiring;
                        const unused = unusedWorkers?.[edu] ?? 0;
                        const delta = active - target;
                        const hasWorkers = active > 0;
                        return (
                            <tr key={edu} className='border-b border-dashed hover:bg-muted/50 transition-colors'>
                                <td className='py-1.5 px-2'>
                                    <Badge
                                        variant='outline'
                                        className={`font-normal text-xs px-1.5 py-0 ${EDU_COLORS[edu].badge}`}
                                    >
                                        {eduLabel(edu)}
                                    </Badge>
                                </td>
                                <td className='py-1.5 px-2 text-right tabular-nums'>{fmt(target)}</td>
                                <td className='py-1.5 px-2 text-right tabular-nums font-medium'>{fmt(active)}</td>
                                <td className='py-1.5 px-2 text-right tabular-nums text-orange-500'>
                                    {totalDep > 0 ? (
                                        <>
                                            {fmt(totalDep)}
                                            <span className='text-violet-500 ml-0.5 text-[10px]'>
                                                ({pct(retiring, totalDep)}%)
                                            </span>
                                        </>
                                    ) : (
                                        <span className='text-muted-foreground'>·</span>
                                    )}
                                </td>
                                {hasUnused && (
                                    <td
                                        className={`py-1.5 px-2 text-right tabular-nums ${unused > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}
                                    >
                                        {unused > 0 ? fmt(unused) : '0'}
                                    </td>
                                )}
                                <td className='py-1.5 px-2 text-right tabular-nums'>
                                    {hasWorkers ? meanAgeByEdu[edu].toFixed(1) : '—'}
                                </td>
                                <td
                                    className={`py-1.5 px-2 text-right tabular-nums ${
                                        hasWorkers && ageProductivityByEdu[edu] < 0.95
                                            ? 'text-amber-600'
                                            : 'text-muted-foreground'
                                    }`}
                                >
                                    {hasWorkers ? `×${ageProductivityByEdu[edu].toFixed(2)}` : '—'}
                                </td>
                                <td
                                    className={`py-1.5 px-2 text-right tabular-nums font-medium ${
                                        delta > 0
                                            ? 'text-green-600'
                                            : delta < 0
                                              ? 'text-red-500'
                                              : 'text-muted-foreground'
                                    }`}
                                >
                                    {delta > 0 ? '+' : ''}
                                    {fmt(delta)}
                                </td>
                            </tr>
                        );
                    })}
                    {/* Totals row */}
                    <tr className='font-medium bg-muted/20'>
                        <td className='py-1.5 px-2'>Total</td>
                        <td className='py-1.5 px-2 text-right tabular-nums'>{fmt(sumByEdu(allocatedWorkers))}</td>
                        <td className='py-1.5 px-2 text-right tabular-nums'>{fmt(sumByEdu(activeByEdu))}</td>
                        <td className='py-1.5 px-2 text-right tabular-nums text-orange-500'>
                            {(() => {
                                const total = sumByEdu(departingByEdu) + sumByEdu(retiringByEdu);
                                if (total === 0) {
                                    return <span className='text-muted-foreground'>·</span>;
                                }
                                return (
                                    <>
                                        {fmt(total)}
                                        <span className='text-violet-500 ml-0.5 text-[10px]'>
                                            ({pct(sumByEdu(retiringByEdu), total)}%)
                                        </span>
                                    </>
                                );
                            })()}
                        </td>
                        {hasUnused && (
                            <td className='py-1.5 px-2 text-right tabular-nums text-amber-500'>
                                {unusedWorkers ? fmt(sumByEdu(unusedWorkers)) : '0'}
                            </td>
                        )}
                        <td className='py-1.5 px-2 text-right tabular-nums' colSpan={2} />
                        <td
                            className={`py-1.5 px-2 text-right tabular-nums font-medium ${
                                sumByEdu(activeByEdu) - sumByEdu(allocatedWorkers) >= 0
                                    ? 'text-green-600'
                                    : 'text-red-500'
                            }`}
                        >
                            {sumByEdu(activeByEdu) - sumByEdu(allocatedWorkers) > 0 ? '+' : ''}
                            {fmt(sumByEdu(activeByEdu) - sumByEdu(allocatedWorkers))}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}
