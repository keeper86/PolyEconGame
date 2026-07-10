'use client';

import { useIsSmallScreen } from '@/hooks/useMobile';
import { formatNumberWithUnit } from '@/lib/utils';
import { SERVICE_DEFINITIONS } from '@/simulation/market/populationDemand';
import { educationLevelKeys } from '@/simulation/population/education';
import type { ServiceName } from '@/simulation/population/population';
import { OCCUPATIONS } from '@/simulation/population/population';
import React, { useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EDU_COLORS, EDU_LABELS, OCC_COLORS, OCC_LABELS } from './CohortFilter';
import type { AggRow, GroupMode } from './demographicsTypes';
import { GV_FOOD, GV_POP } from './demographicsTypes';

type ChartRow = Record<string, number>;

interface BufferBarProps {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    payload?: ChartRow;
    groupKey: string;
    color: string;
}

function BufferBar({ x = 0, y = 0, width = 0, height = 0, payload, groupKey, color }: BufferBarProps) {
    if (!payload || !width || !height || height <= 0) {
        return <g />;
    }
    const clampedRatio = Math.min(1, Math.max(0, payload[`${groupKey}_bufferRatio`] ?? 0));
    const filledH = height * clampedRatio;
    const emptyH = height - filledH;
    return (
        <g>
            {emptyH > 0 && (
                <>
                    <rect x={x} y={y} width={width} height={emptyH} fill={color} fillOpacity={0.2} />
                    {clampedRatio < 0.95 && <line x1={x} x2={x + width} y1={y} y2={y} stroke='#000' strokeWidth={1} />}
                </>
            )}
            {filledH > 0 && <rect x={x} y={y + emptyH} width={width} height={filledH} fill={color} fillOpacity={0.9} />}
        </g>
    );
}

function makeTooltip(
    keys: readonly string[],
    labels: Record<string, string>,
    colors: Record<string, string>,
    bufferTargetTicks: number,
) {
    return function TooltipContent({
        active,
        payload,
        label,
    }: {
        active?: boolean;
        payload?: { payload: ChartRow }[];
        label?: number;
    }) {
        if (!active || !payload || payload.length === 0) {
            return null;
        }
        const row = payload[0].payload;
        const age = label ?? 0;
        return (
            <div className='rounded-lg border bg-card p-2 text-xs shadow-md min-w-[160px]'>
                <div className='font-medium mb-1'>Age {age}</div>
                {keys.map((key) => {
                    const pop = row[`${key}_pop`] ?? 0;
                    if (pop === 0) {
                        return null;
                    }
                    const ratio = row[`${key}_bufferRatio`] ?? 0;
                    return (
                        <div key={key} className='flex items-center gap-1 mt-0.5'>
                            <span
                                className='inline-block w-2 h-2 rounded-sm flex-shrink-0'
                                style={{ background: colors[key] }}
                            />
                            <span style={{ color: colors[key] }} className='font-medium'>
                                {labels[key]}
                            </span>
                            <span className='ml-auto pl-2 text-muted-foreground'>
                                {(ratio * 100).toFixed(0)}%{' · '}
                                {formatNumberWithUnit(ratio * bufferTargetTicks, 'days')}
                            </span>
                        </div>
                    );
                })}
            </div>
        );
    };
}

function mergePairs(rows: ChartRow[], rowKeys: readonly string[], serviceKey: ServiceName): ChartRow[] {
    const def = SERVICE_DEFINITIONS[serviceKey];
    const targetPerPerson = def.bufferTargetTicks;
    const result: ChartRow[] = [];
    for (let i = 0; i < rows.length; i += 2) {
        const a = rows[i];
        const b = rows[i + 1];
        if (!b) {
            result.push(a);
            continue;
        }
        const merged: ChartRow = { age: a.age };
        for (const key of rowKeys) {
            const aPop = a[`${key}_pop`] ?? 0;
            const bPop = b[`${key}_pop`] ?? 0;
            const totalPop = aPop + bPop;
            const aAvgStock = a[`${key}_avgStock`] ?? 0;
            const bAvgStock = b[`${key}_avgStock`] ?? 0;
            const avgStock = totalPop > 0 ? (aAvgStock * aPop + bAvgStock * bPop) / totalPop : 0;
            const aEffPop = a[`${key}_effectivePop`] ?? 0;
            const bEffPop = b[`${key}_effectivePop`] ?? 0;

            // Average the multiplier: effPop / pop
            const aMult = aPop > 0 ? aEffPop / aPop : 0;
            const bMult = bPop > 0 ? bEffPop / bPop : 0;
            const avgMult = totalPop > 0 ? (aMult * aPop + bMult * bPop) / totalPop : 0;

            const ratio = targetPerPerson > 0 ? avgStock / targetPerPerson : 0;

            merged[`${key}_pop`] = totalPop;
            merged[`${key}_effectivePop`] = avgMult * totalPop;
            merged[`${key}_avgStock`] = avgStock;
            merged[`${key}_bufferRatio`] = ratio;
        }
        result.push(merged);
    }
    return result;
}

/** Compute the effective age multiplier for a given service, age, and group mode.
 *  For occupation mode, we use the occupation directly.
 *  For education mode, we weight by the actual occupation distribution at that age. */
function computeEffectiveMultiplier(
    serviceKey: ServiceName,
    age: number,
    groupMode: GroupMode,
    groupIndex: number,
    occCounts: [number, number, number, number],
): number {
    const rateFn = SERVICE_DEFINITIONS[serviceKey].consumptionRatePerPersonPerTick;
    if (groupMode === 'occupation') {
        const occ = OCCUPATIONS[groupIndex];
        return rateFn(age, occ);
    } else {
        // education mode: weighted average over occupations
        let weightedRate = 0;
        let totalOccPop = 0;
        for (let oi = 0; oi < OCCUPATIONS.length; oi++) {
            const occPop = occCounts[oi];
            if (occPop > 0) {
                weightedRate += occPop * rateFn(age, OCCUPATIONS[oi]);
                totalOccPop += occPop;
            }
        }
        return totalOccPop > 0 ? weightedRate / totalOccPop : 0;
    }
}

type Props = {
    rows: AggRow[];
    groupMode: GroupMode;
    serviceKey: ServiceName;
};

function EmptyChart({ height = 180 }: { height?: number }) {
    return (
        <div
            className='w-full rounded border border-dashed border-muted flex items-center justify-center text-xs text-muted-foreground'
            style={{ height }}
        >
            No data
        </div>
    );
}

export default function ServiceBufferChart({ rows, groupMode, serviceKey }: Props): React.ReactElement {
    const isVerySmall = useIsSmallScreen();

    const keys: readonly string[] = groupMode === 'occupation' ? OCCUPATIONS : educationLevelKeys;
    const labels: Record<string, string> = groupMode === 'occupation' ? OCC_LABELS : EDU_LABELS;
    const colors: Record<string, string> = groupMode === 'occupation' ? OCC_COLORS : EDU_COLORS;
    const targetPerPerson = SERVICE_DEFINITIONS[serviceKey].bufferTargetTicks;

    const { data, yDomain } = useMemo(() => {
        const rawData: ChartRow[] = rows
            .map((r) => {
                const row: ChartRow = { age: r.age };
                let ageHasData = false;
                for (let gi = 0; gi < keys.length; gi++) {
                    const key = keys[gi];
                    const pop = r.groupValues[gi][GV_POP];

                    const totalBuffer =
                        serviceKey === 'grocery'
                            ? r.groupValues[gi][GV_FOOD]
                            : r.serviceBuffers[serviceKey as Exclude<ServiceName, 'grocery'>][gi][0];
                    const avgStock = pop > 0 ? totalBuffer / pop : 0;
                    const ratio = targetPerPerson > 0 ? avgStock / targetPerPerson : 0;

                    // Age-dependent effective population
                    const multiplier = computeEffectiveMultiplier(serviceKey, r.age, groupMode, gi, r.occ);
                    const effectivePop = pop * multiplier;

                    row[`${key}_pop`] = pop;
                    row[`${key}_effectivePop`] = effectivePop;
                    row[`${key}_avgStock`] = avgStock;
                    row[`${key}_bufferRatio`] = ratio;
                    if (pop > 0) {
                        ageHasData = true;
                    }
                }
                return ageHasData ? row : null;
            })
            .filter((r): r is ChartRow => r !== null);

        const built = isVerySmall ? mergePairs(rawData, keys, serviceKey) : rawData;

        let maxY = 0;
        for (const row of built) {
            for (const key of keys) {
                const effPop = row[`${key}_effectivePop`] ?? 0;
                if (effPop > maxY) {
                    maxY = effPop;
                }
            }
        }

        return { data: built, yDomain: [0, maxY > 0 ? maxY : 1] as [number, number] };
    }, [rows, keys, serviceKey, targetPerPerson, isVerySmall, groupMode]);

    const tooltip = useMemo(
        () => makeTooltip(keys, labels, colors, SERVICE_DEFINITIONS[serviceKey].bufferTargetTicks),
        [keys, labels, colors, serviceKey],
    );

    if (data.length === 0) {
        return <EmptyChart />;
    }

    return (
        <ResponsiveContainer width='100%' minHeight={180} minWidth={290}>
            <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap='5%'>
                <XAxis dataKey='age' tick={{ fontSize: 10 }} domain={[0, 100]} />
                <YAxis
                    width={40}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => formatNumberWithUnit(v as number, 'persons')}
                    domain={yDomain}
                />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {isVerySmall ? null : <Tooltip content={tooltip as any} />}
                {keys.map((key) => (
                    <Bar
                        key={key}
                        dataKey={`${key}_effectivePop`}
                        stackId='a'
                        name={labels[key]}
                        isAnimationActive={false}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        shape={(props: any) => <BufferBar {...props} groupKey={key} color={colors[key]} />}
                    />
                ))}
            </BarChart>
        </ResponsiveContainer>
    );
}
