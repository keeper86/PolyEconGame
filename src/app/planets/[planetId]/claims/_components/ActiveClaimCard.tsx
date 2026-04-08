'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { useTRPC } from '@/lib/trpc';
import { formatNumbers } from '@/lib/utils';
import type { AgentClaimEntry, ClaimResourceSummary } from '@/server/controller/planet';
import {
    CLAIM_CONSUMPTION_PER_TICK_AT_SCALE1,
    LAND_CLAIM_COST_PER_UNIT,
    MONTHS_PER_YEAR,
    TICKS_PER_MONTH,
    TICKS_PER_YEAR,
} from '@/simulation/constants';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { ClaimCardHeader } from './ClaimCardHeader';

const SY_TIERS = [1, 10, 100, 1000, 10000, 100000] as const;

function formatDepletion(ticks: number | null): string {
    if (ticks === null) {
        return 'Sustainable';
    }
    const months = Math.floor(ticks / TICKS_PER_MONTH);
    if (months < MONTHS_PER_YEAR) {
        return `~${months} month${months !== 1 ? 's' : ''}`;
    }
    const years = Math.floor(months / MONTHS_PER_YEAR);
    const remMonths = months % MONTHS_PER_YEAR;
    return remMonths > 0 ? `~${years}y ${remMonths}m` : `~${years} year${years !== 1 ? 's' : ''}`;
}

export function ActiveClaimCard({
    claim,
    summary,
    agentId,
    planetId,
}: {
    claim: AgentClaimEntry;
    summary: ClaimResourceSummary;
    agentId: string;
    planetId: string;
}): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [showExpand, setShowExpand] = useState(false);
    const [expandTierIndex, setExpandTierIndex] = useState(0);
    const [expanded, setExpanded] = useState(false);
    const [confirmQuit, setConfirmQuit] = useState(false);
    const [released, setReleased] = useState(false);

    useEffect(() => {
        if (expanded) {
            setExpanded(false);
            setShowExpand(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [claim.maximumCapacity]);

    const { data: financials } = useQuery(trpc.simulation.getAgentFinancials.queryOptions({ agentId, planetId }));

    const invalidate = () => {
        void queryClient.invalidateQueries({
            queryKey: trpc.simulation.getPlanetClaims.queryKey({ planetId }),
        });
        void queryClient.invalidateQueries({
            queryKey: trpc.simulation.getAgentClaims.queryKey({ agentId, planetId }),
        });
    };

    const expandMutation = useMutation(
        trpc.expandClaim.mutationOptions({
            onSuccess: () => {
                setExpanded(true);
                invalidate();
            },
        }),
    );

    const quitMutation = useMutation(
        trpc.quitClaim.mutationOptions({
            onSuccess: () => {
                setReleased(true);
                invalidate();
            },
        }),
    );

    const fillPct = claim.maximumCapacity > 0 ? Math.round((claim.quantity / claim.maximumCapacity) * 100) : 0;
    const isSustainable = claim.depletionTicksEstimate === null;

    return (
        <Card className='border-emerald-500/30 flex flex-col'>
            <ClaimCardHeader resourceName={claim.resourceName} renewable={summary.renewable} />
            <CardContent className='flex flex-col gap-3 flex-1'>
                <p className='text-xs text-muted-foreground'>
                    Available: {formatNumbers(summary.availableCapacity)} of {formatNumbers(summary.totalCapacity)}
                </p>
                <div className='space-y-1'>
                    <div className='flex justify-between text-xs'>
                        <span className='text-muted-foreground'>Stock</span>
                        <span className='font-medium'>
                            {formatNumbers(claim.quantity)} / {formatNumbers(claim.maximumCapacity)} ({fillPct}%)
                        </span>
                    </div>
                    <div className='h-1.5 w-full rounded-full bg-secondary'>
                        <div className='h-1.5 rounded-full bg-emerald-500' style={{ width: `${fillPct}%` }} />
                    </div>
                </div>
                <div className='grid grid-cols-2 gap-2 text-xs'>
                    <div className='space-y-0.5'>
                        <p className='text-muted-foreground'>Cost / tick</p>
                        <p className='font-medium'>{formatNumbers(claim.tenantCostInCoins)} ¢</p>
                    </div>
                    <div className='space-y-0.5'>
                        <p className='text-muted-foreground'>Regen / tick</p>
                        <p className='font-medium text-green-600 dark:text-green-400'>
                            +{formatNumbers(claim.regenerationRate)}
                        </p>
                    </div>
                    <div className='space-y-0.5'>
                        <p className='text-muted-foreground'>Extraction / tick</p>
                        <p className='font-medium'>{formatNumbers(claim.extractionRatePerTick)}</p>
                    </div>
                    <div className='space-y-0.5'>
                        <p className='text-muted-foreground'>Depletion</p>
                        <p
                            className={`font-medium flex items-center gap-1 ${isSustainable ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}
                        >
                            {isSustainable && <RefreshCw className='h-3 w-3' />}
                            {formatDepletion(claim.depletionTicksEstimate)}
                        </p>
                    </div>
                </div>

                {showExpand ? (
                    <div className='space-y-3 border-t pt-3 mt-auto'>
                        <p className='text-xs font-medium'>Expand by (scale-years)</p>
                        <div className='space-y-1'>
                            <div className='flex justify-between text-xs text-muted-foreground'>
                                <span>Scale-years</span>
                                <span className='font-medium text-foreground'>
                                    {formatNumbers(SY_TIERS[expandTierIndex] ?? 1)} sy
                                </span>
                            </div>
                            <Slider
                                min={0}
                                max={SY_TIERS.length - 1}
                                step={1}
                                value={[expandTierIndex]}
                                onValueChange={([v]: [number]) => setExpandTierIndex(v ?? 0)}
                                disabled={expandMutation.isPending || expanded}
                            />
                            <div className='flex justify-between text-[10px] text-muted-foreground'>
                                {SY_TIERS.map((t) => (
                                    <span key={t}>{t >= 1000 ? `${t / 1000}k` : t}</span>
                                ))}
                            </div>
                        </div>
                        {(() => {
                            const sy = SY_TIERS[expandTierIndex] ?? 1;
                            const consumptionPerTick = CLAIM_CONSUMPTION_PER_TICK_AT_SCALE1[claim.resourceName] ?? 1;
                            const additionalQuantity = sy * consumptionPerTick * TICKS_PER_YEAR;
                            const costPerUnit = LAND_CLAIM_COST_PER_UNIT[claim.resourceName] ?? 1;
                            const cost = Math.floor(additionalQuantity * costPerUnit);
                            const exceedsCapacity = additionalQuantity > summary.availableCapacity;
                            const deposits = financials?.deposits ?? 0;
                            const cannotAfford = !summary.renewable && cost > deposits;
                            const perTickCashFlow = financials?.monthlyNetCashFlow ?? 0;
                            const cashFlowWarning =
                                summary.renewable &&
                                cost * TICKS_PER_YEAR > deposits + perTickCashFlow * MONTHS_PER_YEAR;
                            const isDisabled = exceedsCapacity || cannotAfford || expandMutation.isPending || expanded;

                            return (
                                <>
                                    <div className='space-y-0.5 text-xs'>
                                        <div className='flex justify-between'>
                                            <span className='text-muted-foreground'>Quantity</span>
                                            <span
                                                className={`font-medium ${exceedsCapacity ? 'text-destructive' : ''}`}
                                            >
                                                {formatNumbers(additionalQuantity)} units
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
                                                <span
                                                    className={`font-medium ${cannotAfford ? 'text-destructive' : ''}`}
                                                >
                                                    {formatNumbers(deposits)} ¢
                                                </span>
                                            </div>
                                        ) : (
                                            <div className='flex justify-between'>
                                                <span className='text-muted-foreground'>Your cash flow</span>
                                                <span
                                                    className={`font-medium ${cashFlowWarning ? 'text-amber-600 dark:text-amber-400' : ''}`}
                                                >
                                                    {formatNumbers(perTickCashFlow)} ¢
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <div className='flex gap-2'>
                                        <Button
                                            size='sm'
                                            disabled={isDisabled}
                                            onClick={() =>
                                                expandMutation.mutate({
                                                    agentId,
                                                    planetId,
                                                    claimId: claim.claimId,
                                                    additionalQuantity,
                                                })
                                            }
                                        >
                                            {expandMutation.isPending || expanded ? (
                                                <>
                                                    <Loader2 className='h-3 w-3 animate-spin mr-1' />
                                                    Takes effect next tick…
                                                </>
                                            ) : (
                                                'Expand'
                                            )}
                                        </Button>
                                        <Button
                                            size='sm'
                                            variant='outline'
                                            disabled={expandMutation.isPending || expanded}
                                            onClick={() => setShowExpand(false)}
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                    {expandMutation.error && (
                                        <p className='text-xs text-destructive'>{expandMutation.error.message}</p>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                ) : confirmQuit ? (
                    <div className='space-y-2 border-t pt-3 mt-auto'>
                        <p className='text-xs text-destructive font-medium'>Release this claim back to the planet?</p>
                        <div className='flex gap-2'>
                            <Button
                                size='sm'
                                variant='destructive'
                                disabled={quitMutation.isPending || released}
                                onClick={() => quitMutation.mutate({ agentId, planetId, claimId: claim.claimId })}
                            >
                                {quitMutation.isPending || released ? (
                                    <>
                                        <Loader2 className='h-3 w-3 animate-spin mr-1' />
                                        Takes effect next tick…
                                    </>
                                ) : (
                                    'Confirm Release'
                                )}
                            </Button>
                            <Button
                                size='sm'
                                variant='outline'
                                disabled={quitMutation.isPending || released}
                                onClick={() => setConfirmQuit(false)}
                            >
                                Cancel
                            </Button>
                        </div>
                        {quitMutation.error && <p className='text-xs text-destructive'>{quitMutation.error.message}</p>}
                    </div>
                ) : (
                    <div className='flex gap-2 border-t pt-3 mt-auto'>
                        {summary.availableCapacity > 0 && (
                            <Button size='sm' variant='outline' onClick={() => setShowExpand(true)}>
                                Expand
                            </Button>
                        )}
                        <Button size='sm' variant='outline' onClick={() => setConfirmQuit(true)}>
                            Release
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
