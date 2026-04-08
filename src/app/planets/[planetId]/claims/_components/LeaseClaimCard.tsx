'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { AlertTriangle, InfoIcon, Loader2 } from 'lucide-react';
import { ClaimCardHeader } from './ClaimCardHeader';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatNumbers } from '@/lib/utils';
import {
    CLAIM_CONSUMPTION_PER_TICK_AT_SCALE1,
    LAND_CLAIM_COST_PER_UNIT,
    TICKS_PER_MONTH,
    TICKS_PER_YEAR,
} from '@/simulation/constants';
import type { ClaimResourceSummary } from '@/server/controller/planet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const SY_TIERS = [1, 10, 100, 1000, 10000, 100000] as const;

export function LeaseClaimCard({
    summary,
    agentId,
    planetId,
}: {
    summary: ClaimResourceSummary;
    agentId: string;
    planetId: string;
}): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [tierIndex, setTierIndex] = useState(0);
    const [leased, setLeased] = useState(false);

    const { data: financials } = useQuery(trpc.simulation.getAgentFinancials.queryOptions({ agentId, planetId }));

    const leaseMutation = useMutation(
        trpc.leaseClaim.mutationOptions({
            onSuccess: () => {
                setLeased(true);
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getPlanetClaims.queryKey({ planetId }),
                });
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getAgentClaims.queryKey({ agentId, planetId }),
                });
            },
        }),
    );

    const sy = SY_TIERS[tierIndex] ?? 1;
    const consumptionPerTick = CLAIM_CONSUMPTION_PER_TICK_AT_SCALE1[summary.resourceName] ?? 1;
    const quantity = sy * consumptionPerTick * (summary.renewable ? 1 : TICKS_PER_YEAR);
    const costPerUnit = LAND_CLAIM_COST_PER_UNIT[summary.resourceName] ?? 1;
    const cost = Math.floor(quantity * costPerUnit);

    const deposits = financials?.deposits ?? 0;
    const monthlyNetCashFlow = financials?.monthlyNetCashFlow ?? 0;
    const perTickCashFlow = monthlyNetCashFlow / TICKS_PER_MONTH;

    const exceedsCapacity = quantity > summary.availableCapacity;
    const cannotAfford = !summary.renewable && cost > deposits;
    const cashFlowWarning = summary.renewable && cost > perTickCashFlow;
    const leaseDisabled = exceedsCapacity || cannotAfford || leaseMutation.isPending || leased;

    return (
        <Card className='flex flex-col'>
            <ClaimCardHeader resourceName={summary.resourceName} renewable={summary.renewable} />
            <CardContent className='flex flex-col gap-3 flex-1'>
                <p className='text-xs text-muted-foreground'>
                    Available: {formatNumbers(summary.availableCapacity)} of {formatNumbers(summary.totalCapacity)}
                </p>
                <div className='space-y-3'>
                    <div className='space-y-1'>
                        <div className='flex gap-2 text-xs text-muted-foreground pb-1'>
                            {summary.renewable ? (
                                <span className='flex gap-1'>
                                    Scale
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <InfoIcon className='h-4' />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            Measures the quantity of resource claimed by what the least-demanding
                                            facility of a this scale would sustainable be able to consume.
                                        </TooltipContent>
                                    </Tooltip>
                                </span>
                            ) : (
                                <span className='flex gap-1'>
                                    Scale-years{' '}
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <InfoIcon className='h-4' />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            1 Scale year can satisfy the annual consumption of one facility at scale 1.
                                        </TooltipContent>
                                    </Tooltip>
                                </span>
                            )}
                        </div>
                        <Slider
                            min={0}
                            max={SY_TIERS.length - 1}
                            step={1}
                            value={[tierIndex]}
                            onValueChange={([v]) => setTierIndex(v ?? 0)}
                            disabled={leaseMutation.isPending || leased}
                        />
                        <div className='relative h-4 text-[10px] text-muted-foreground'>
                            {SY_TIERS.map((t, i) => {
                                const pct = (i / (SY_TIERS.length - 1)) * 100 - 0.3 * (i - 2.3);
                                const translate = i === 0 ? '100%' : i === SY_TIERS.length - 1 ? '-80%' : '-50%';
                                return (
                                    <span
                                        key={t}
                                        className='absolute'
                                        style={{ left: `${pct}%`, transform: `translateX(${translate})` }}
                                    >
                                        {formatNumbers(t)}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                    <div className='space-y-0.5 text-xs'>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>Quantity</span>
                            <span className={`font-medium ${exceedsCapacity ? 'text-destructive' : ''}`}>
                                {formatNumbers(quantity)} units
                                {exceedsCapacity && ' — exceeds available'}
                            </span>
                        </div>
                        <div className='flex justify-between'>
                            <span className='text-muted-foreground'>
                                {summary.renewable ? 'Cost / tick (locked)' : 'Cost (flat)'}
                            </span>
                            <span className='font-medium text-amber-600 dark:text-amber-400'>
                                {formatNumbers(cost)}
                            </span>
                        </div>
                        {!summary.renewable ? (
                            <div className='flex justify-between'>
                                <span className='text-muted-foreground'>Your deposits</span>
                                <span className={`font-medium ${cannotAfford ? 'text-destructive' : ''}`}>
                                    {formatNumbers(deposits)}
                                </span>
                            </div>
                        ) : (
                            <div className='flex justify-between'>
                                <span className='text-muted-foreground'>Your cash flow</span>
                                {cashFlowWarning ? (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className={`font-medium text-amber-600 dark:text-amber-400`}>
                                                {formatNumbers(perTickCashFlow)}
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <span className='flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400'>
                                                <AlertTriangle className='h-3 w-3 shrink-0' />
                                                Running cost exceeds current cash flow
                                            </span>
                                        </TooltipContent>
                                    </Tooltip>
                                ) : (
                                    <span className={`font-medium `}>{formatNumbers(perTickCashFlow)} </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                {leaseMutation.error && <p className='text-xs text-destructive'>{leaseMutation.error.message}</p>}
                <Button
                    size='sm'
                    disabled={leaseDisabled}
                    onClick={() =>
                        leaseMutation.mutate({
                            agentId,
                            planetId,
                            resourceName: summary.resourceName,
                            quantity,
                        })
                    }
                    className='w-full mt-auto'
                >
                    {leaseMutation.isPending || leased ? (
                        <>
                            <Loader2 className='h-3 w-3 animate-spin mr-1' />
                            Takes effect next tick…
                        </>
                    ) : (
                        'Lease'
                    )}
                </Button>
            </CardContent>
        </Card>
    );
}
