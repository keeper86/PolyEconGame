'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { AlertTriangle, Loader2 } from 'lucide-react';
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
    const quantity = sy * consumptionPerTick * TICKS_PER_YEAR;
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
        <Card>
            <ClaimCardHeader resourceName={summary.resourceName} renewable={summary.renewable} />
            <CardContent className='space-y-3'>
                <p className='text-xs text-muted-foreground'>
                    Available: {formatNumbers(summary.availableCapacity)} of {formatNumbers(summary.totalCapacity)}
                </p>
                <div className='space-y-3'>
                    <div className='space-y-1'>
                        <div className='flex justify-between text-xs text-muted-foreground'>
                            <span>Scale-years</span>
                            <span className='font-medium text-foreground'>{formatNumbers(sy)} sy</span>
                        </div>
                        <Slider
                            min={0}
                            max={SY_TIERS.length - 1}
                            step={1}
                            value={[tierIndex]}
                            onValueChange={([v]) => setTierIndex(v ?? 0)}
                            disabled={leaseMutation.isPending || leased}
                        />
                        <div className='flex justify-between text-[10px] text-muted-foreground'>
                            {SY_TIERS.map((t) => (
                                <span key={t}>{t >= 1000 ? `${t / 1000}k` : t}</span>
                            ))}
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
                                {summary.renewable ? 'Cost / tick' : 'Cost (flat)'}
                            </span>
                            <span className='font-medium text-amber-600 dark:text-amber-400'>
                                {formatNumbers(cost)} ¢
                            </span>
                        </div>
                        {!summary.renewable ? (
                            <div className='flex justify-between'>
                                <span className='text-muted-foreground'>Your deposits</span>
                                <span className={`font-medium ${cannotAfford ? 'text-destructive' : ''}`}>
                                    {formatNumbers(deposits)} ¢
                                </span>
                            </div>
                        ) : (
                            <div className='flex justify-between'>
                                <span className='text-muted-foreground'>Your cash flow</span>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span
                                            className={`font-medium ${cashFlowWarning ? 'text-amber-600 dark:text-amber-400' : ''}`}
                                        >
                                            {formatNumbers(perTickCashFlow)} ¢
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {cashFlowWarning && (
                                            <span className='flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400'>
                                                <AlertTriangle className='h-3 w-3 shrink-0' />
                                                Running cost exceeds current cash flow
                                            </span>
                                        )}
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                        )}
                    </div>
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
                        className='w-full'
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
                </div>
                {leaseMutation.error && <p className='text-xs text-destructive'>{leaseMutation.error.message}</p>}
            </CardContent>
        </Card>
    );
}
