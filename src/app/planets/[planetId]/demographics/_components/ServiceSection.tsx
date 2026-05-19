'use client';

import { Card, CardContent } from '@/components/ui/card';
import { useIsSmallScreen } from '@/hooks/useMobile';
import { SERVICE_DEFINITIONS } from '@/simulation/market/populationDemand';
import type { ServiceName } from '@/simulation/population/population';
import NutritionHeatmapChart from './NutritionHeatmapChart';
import ServiceBufferChart from './ServiceBufferChart';
import type { AggRow, GroupMode } from './demographicsTypes';
import { GV_FOOD, GV_POP, GV_STARV } from './demographicsTypes';

type Props = {
    serviceKey: ServiceName;
    rows: AggRow[];
    groupMode: GroupMode;
    groupKeys: readonly string[];
    groupColors: Record<string, string>;
    groupLabels: Record<string, string>;
};

export default function ServiceSection({ serviceKey, rows, groupMode, groupKeys, groupColors, groupLabels }: Props) {
    const isSmallScreen = useIsSmallScreen();
    const targetPerPerson =
        SERVICE_DEFINITIONS[serviceKey].bufferTargetTicks *
        SERVICE_DEFINITIONS[serviceKey].consumptionRatePerPersonPerTick;

    // ── Aggregate buffer and starvation per group ─────────────────────────
    const groupPop = [0, 0, 0, 0];
    const bufferSum = [0, 0, 0, 0];
    const starvSum = [0, 0, 0, 0];

    for (const row of rows) {
        for (let gi = 0; gi < 4; gi++) {
            const pop = row.groupValues[gi][GV_POP];
            let totalBuffer: number;
            let weightedStarv: number;
            if (serviceKey === 'grocery') {
                totalBuffer = row.groupValues[gi][GV_FOOD];
                weightedStarv = row.groupValues[gi][GV_STARV];
            } else {
                const entry = row.serviceBuffers[serviceKey][gi];
                totalBuffer = entry[0];
                weightedStarv = entry[1];
            }
            groupPop[gi] += pop;
            bufferSum[gi] += totalBuffer;
            starvSum[gi] += weightedStarv;
        }
    }

    const bufferRatio = groupPop.map((pop, i) =>
        pop > 0 && targetPerPerson > 0 ? bufferSum[i] / pop / targetPerPerson : 0,
    );
    const avgStarv = groupPop.map((pop, i) => (pop > 0 ? starvSum[i] / pop : 0));

    // ── Buffer cards ──────────────────────────────────────────────────────
    const bufferCards = isSmallScreen ? (
        <div className='flex gap-1 mb-2'>
            {groupKeys.map((key, i) => {
                const ratio = bufferRatio[i];
                const pct = (ratio * 100).toFixed(1);
                const valueColor =
                    ratio >= 0.95
                        ? 'text-green-600'
                        : ratio >= 0.75
                          ? 'text-green-500'
                          : ratio >= 0.5
                            ? 'text-yellow-500'
                            : ratio >= 0.25
                              ? 'text-orange-500'
                              : ratio >= 0.1
                                ? 'text-red-500'
                                : 'text-red-700';
                return (
                    <div
                        key={key}
                        className='flex-1 px-1.5 py-1 border rounded text-xs'
                        style={{ borderLeftColor: groupColors[key], borderLeftWidth: 3 }}
                    >
                        <div className='text-muted-foreground text-[9px] leading-tight truncate'>
                            {groupLabels[key]}
                        </div>
                        <div className={`font-semibold text-[11px] leading-tight tabular-nums ${valueColor}`}>
                            {pct}%
                        </div>
                        <div className='text-[9px] text-muted-foreground leading-tight'>of target</div>
                    </div>
                );
            })}
        </div>
    ) : (
        <div className='flex gap-2 mb-3'>
            {groupKeys.map((key, i) => {
                const ratio = bufferRatio[i];
                const pct = (ratio * 100).toFixed(1);
                const valueColor =
                    ratio >= 0.95
                        ? 'text-green-600'
                        : ratio >= 0.75
                          ? 'text-green-500'
                          : ratio >= 0.5
                            ? 'text-yellow-500'
                            : ratio >= 0.25
                              ? 'text-orange-500'
                              : ratio >= 0.1
                                ? 'text-red-500'
                                : 'text-red-700';
                const label =
                    ratio >= 0.95
                        ? 'fully stocked'
                        : ratio >= 0.75
                          ? 'well stocked'
                          : ratio >= 0.5
                            ? 'below target'
                            : ratio >= 0.25
                              ? 'low supply'
                              : ratio >= 0.1
                                ? 'very low'
                                : 'critically empty';
                return (
                    <Card
                        key={key}
                        className='flex-1 overflow-hidden'
                        style={{ borderLeftColor: groupColors[key], borderLeftWidth: 3 }}
                    >
                        <CardContent className='px-3 py-2.5 space-y-0.5'>
                            <p className='text-[11px] text-muted-foreground font-medium'>{groupLabels[key]}</p>
                            <p className={`text-lg font-semibold leading-tight tabular-nums ${valueColor}`}>{pct}%</p>
                            <p className='text-xs text-muted-foreground'>{label}</p>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );

    // ── Starvation cards ──────────────────────────────────────────────────
    const starvationCards = isSmallScreen ? (
        <div className='flex gap-1 mb-2'>
            {groupKeys.map((key, i) => {
                const s = avgStarv[i];
                const pct = (s * 100).toFixed(1);
                const valueColor = s < 0.05 ? 'text-green-600' : s < 0.25 ? 'text-amber-500' : 'text-red-500';
                return (
                    <div
                        key={key}
                        className='flex-1 px-1.5 py-1 border rounded text-xs'
                        style={{ borderLeftColor: groupColors[key], borderLeftWidth: 3 }}
                    >
                        <div className='text-muted-foreground text-[9px] leading-tight truncate'>
                            {groupLabels[key]}
                        </div>
                        <div className={`font-semibold text-[11px] leading-tight tabular-nums ${valueColor}`}>
                            {pct}%
                        </div>
                        <div className='text-[9px] text-muted-foreground leading-tight'>deprivation</div>
                    </div>
                );
            })}
        </div>
    ) : (
        <div className='flex gap-2 mb-3'>
            {groupKeys.map((key, i) => {
                const s = avgStarv[i];
                const pct = (s * 100).toFixed(1);
                const valueColor = s < 0.05 ? 'text-green-600' : s < 0.25 ? 'text-amber-500' : 'text-red-500';
                const label =
                    s < 0.05
                        ? 'well-supplied'
                        : s < 0.25
                          ? 'light deprivation'
                          : s < 0.5
                            ? 'moderate deprivation'
                            : 'severe deprivation';
                return (
                    <Card
                        key={key}
                        className='flex-1 overflow-hidden'
                        style={{ borderLeftColor: groupColors[key], borderLeftWidth: 3 }}
                    >
                        <CardContent className='px-3 py-2.5 space-y-0.5'>
                            <p className='text-[11px] text-muted-foreground font-medium'>{groupLabels[key]}</p>
                            <p className={`text-lg font-semibold leading-tight tabular-nums ${valueColor}`}>{pct}%</p>
                            <p className='text-xs text-muted-foreground'>{label}</p>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );

    return (
        <>
            {bufferCards}
            <ServiceBufferChart rows={rows} groupMode={groupMode} serviceKey={serviceKey} />
            <p className='py-4 text-sm font-medium'>Deprivation map</p>
            {starvationCards}
            <NutritionHeatmapChart rows={rows} groupMode={groupMode} serviceKey={serviceKey} />
        </>
    );
}
