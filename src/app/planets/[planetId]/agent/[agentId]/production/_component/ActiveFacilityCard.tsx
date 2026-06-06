'use client';

import { defaultHeight, FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import type { ProductionFacility } from '@/simulation/planet/facility';
import { getFacilityType } from '@/simulation/planet/facility';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { FacilityCardShell } from './FacilityCardShell';
import { FacilityConstructionPanel } from './FacilityConstructionPanel';
import { FacilityProductionIORow } from './FacilityProductionIORow';
import { UnderConstructionCompactRow } from './UnderConstructionCard';
import { WorkerBars } from './WorkerBars';

export function ActiveFacilityCard({
    facility,
    agentId,
    planetId,
    constructionServicePrice,
    onExpanded,
}: {
    facility: ProductionFacility;
    agentId: string;
    planetId: string;
    constructionServicePrice?: number;
    onExpanded: () => void;
}): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [previewScale, setPreviewScale] = useState(facility.maxScale + 1);
    const [showExpand, setShowExpand] = useState(false);
    const [showSetScale, setShowSetScale] = useState(false);

    const SCALE_FRACTIONS = [0, 0.25, 0.5, 0.75, 1] as const;
    const computeScaleFractionIndex = (scale: number, maxScale: number) => {
        const fraction = maxScale > 0 ? Math.round((scale / maxScale) * 4) / 4 : 1;
        const idx = SCALE_FRACTIONS.indexOf(fraction as (typeof SCALE_FRACTIONS)[number]);
        return idx >= 0 ? idx : 4;
    };
    const [scaleFractionIndex, setScaleFractionIndex] = useState(() =>
        computeScaleFractionIndex(facility.scale, facility.maxScale),
    );
    useEffect(() => {
        setScaleFractionIndex(computeScaleFractionIndex(facility.scale, facility.maxScale));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [facility.scale, facility.maxScale]);

    const expandMutation = useMutation(
        trpc.expandFacility.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getAgentPlanetDetail.queryKey({ agentId, planetId }),
                });
                setShowExpand(false);
                onExpanded();
            },
        }),
    );

    const setScaleMutation = useMutation(
        trpc.setFacilityScale.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getAgentPlanetDetail.queryKey({ agentId, planetId }),
                });
                setShowSetScale(false);
            },
        }),
    );

    const facilityType = useMemo(() => getFacilityType(facility), [facility]);

    const results = facility.lastTickResults;
    const eff = results?.overallEfficiency ?? 0;

    const globalMin = results
        ? Math.min(
              ...Object.values(results.resourceEfficiency),
              ...Object.values(results.workerEfficiency).filter((v): v is number => v !== undefined),
          )
        : 0;

    return (
        <FacilityCardShell
            contentClassName='flex flex-col flex-1 gap-2'
            icon={<FacilityOrShipIcon facilityOrShipName={facility.name} />}
            headerContent={
                <span className='flex flex-col space-between gap-2' style={{ minHeight: `${defaultHeight}px` }}>
                    <div className='flex items-center gap-1 flex-col mb-1'>
                        <h3 className='font-semibold leading-tight '>{facility.name}</h3>
                        <span className='flex flex-col items-center gap-1'>
                            <Badge variant='outline' className='text-[10px] px-1.5 py-0'>
                                Scale {facility.scale} {facility.scale === facility.maxScale ? 'max' : ''}
                            </Badge>
                        </span>
                    </div>
                    <span className='flex flex-col text-muted-foreground text-xs gap-1'>
                        Worker efficiency
                        <WorkerBars
                            workerRequirement={facility.workerRequirement}
                            scale={facility.scale}
                            workerEfficiency={results?.workerEfficiency ?? {}}
                            globalMin={globalMin}
                        />
                    </span>
                </span>
            }
        >
            <div className='flex flex-row items-center justify-center gap-3 text-[14px] text-muted-foreground'>
                {'revenue' in facility.lastTickResults && (
                    <>
                        <div className='flex flex-col items-center'>
                            {' '}
                            revenue{' '}
                            <span className='tabular-nums text-green-600 dark:text-green-400'>
                                {formatNumberWithUnit(facility.lastTickResults.revenue, 'currency', planetId)}
                            </span>
                        </div>
                        <span className='shrink-0'>−</span>
                    </>
                )}

                <div className='flex flex-col items-center'>
                    {' '}
                    inputs{' '}
                    <span className='tabular-nums text-red-600 dark:text-red-400'>
                        {formatNumberWithUnit(facility.lastTickResults.inputCosts, 'currency', planetId)}
                    </span>
                </div>

                <span className='shrink-0'>−</span>

                <div className='flex flex-col items-center'>
                    {' '}
                    wages{' '}
                    <span className='tabular-nums text-red-600 dark:text-red-400'>
                        {formatNumberWithUnit(facility.lastTickResults.wageCosts, 'currency', planetId)}
                    </span>
                </div>

                <span className='shrink-0'>=</span>

                <div className='flex flex-col items-center text-foreground'>
                    {' '}
                    net/day{' '}
                    <span
                        className={`tabular-nums text-md ${
                            results.costBalance >= 0
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400'
                        }`}
                    >
                        {formatNumberWithUnit(facility.lastTickResults.costBalance, 'currency', planetId)}
                    </span>
                </div>
            </div>
            <div className='flex-1 space-y-2'>
                <FacilityProductionIORow
                    needs={facility.needs}
                    produces={facility.produces}
                    scale={!showExpand ? facility.scale : previewScale}
                    resourceEfficiency={results?.resourceEfficiency ?? {}}
                    overallEfficiency={eff}
                    limitingEfficiency={globalMin}
                />
            </div>

            <div className='mt-auto space-y-2'>
                <Separator />

                {showExpand && !facility.construction ? (
                    <FacilityConstructionPanel
                        facilityType={facilityType}
                        fromScale={facility.maxScale}
                        constructionServicePrice={constructionServicePrice}
                        planetId={planetId}
                        label='Expand to scale'
                        confirmLabel='Confirm Expand'
                        pendingLabel='Expanding…'
                        isPending={expandMutation.isPending}
                        onCancel={() => setShowExpand(false)}
                        onConfirm={(targetScale) =>
                            expandMutation.mutate({ agentId, planetId, facilityId: facility.id, targetScale })
                        }
                        onScaleChange={setPreviewScale}
                    />
                ) : (
                    <div className='flex gap-2'>
                        <Button
                            variant='outline'
                            size='sm'
                            className='flex-1 text-xs gap-1'
                            disabled={facility.construction !== null}
                            onClick={() => {
                                setPreviewScale(facility.maxScale + 1);
                                setShowExpand(true);
                            }}
                        >
                            Expand facility
                        </Button>
                        <Button
                            variant='outline'
                            size='sm'
                            className='flex-1 text-xs gap-1'
                            disabled={facility.construction !== null}
                            onClick={() => setShowSetScale(true)}
                        >
                            Set scale
                        </Button>
                    </div>
                )}

                {showSetScale && !facility.construction && (
                    <>
                        <Separator />
                        <p className='text-xs font-medium'>Operating scale</p>
                        <Slider
                            min={0}
                            max={SCALE_FRACTIONS.length - 1}
                            step={1}
                            value={[scaleFractionIndex]}
                            onValueChange={([v]) => setScaleFractionIndex(v ?? 0)}
                            disabled={setScaleMutation.isPending}
                        />
                        <div className='relative h-4 text-[10px] text-muted-foreground'>
                            {SCALE_FRACTIONS.map((f, i) => {
                                const pct = (i / (SCALE_FRACTIONS.length - 1)) * 100;
                                const translate = i === 0 ? '0%' : i === SCALE_FRACTIONS.length - 1 ? '-100%' : '-50%';
                                return (
                                    <span
                                        key={f}
                                        className='absolute'
                                        style={{ left: `${pct}%`, transform: `translateX(${translate})` }}
                                    >
                                        {f * 100}%
                                    </span>
                                );
                            })}
                        </div>
                        <div className='flex justify-between text-xs'>
                            <span className='text-muted-foreground'>Resulting scale</span>
                            <span className='font-medium tabular-nums'>
                                {formatNumberWithUnit(
                                    facility.maxScale * (SCALE_FRACTIONS[scaleFractionIndex] ?? 1),
                                    'units',
                                )}
                            </span>
                        </div>
                        <div className='flex gap-2'>
                            <Button
                                size='sm'
                                variant='outline'
                                className='flex-1 text-xs'
                                onClick={() => setShowSetScale(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                size='sm'
                                className='flex-1 text-xs'
                                disabled={setScaleMutation.isPending}
                                onClick={() =>
                                    setScaleMutation.mutate({
                                        agentId,
                                        planetId,
                                        facilityId: facility.id,
                                        scaleFraction: SCALE_FRACTIONS[scaleFractionIndex] ?? 1,
                                    })
                                }
                            >
                                {setScaleMutation.isPending ? 'Applying…' : 'Confirm'}
                            </Button>
                        </div>
                    </>
                )}
            </div>
            {facility.construction !== null && <UnderConstructionCompactRow facility={facility} />}
        </FacilityCardShell>
    );
}
