'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { RefreshCw } from 'lucide-react';
import { ClaimCardHeader } from './ClaimCardHeader';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatNumbers } from '@/lib/utils';
import { TICKS_PER_MONTH, MONTHS_PER_YEAR } from '@/simulation/constants';
import type { AgentClaimEntry, ClaimResourceSummary } from '@/server/controller/planet';

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
    const [additionalQuantity, setAdditionalQuantity] = useState(Math.min(1000, summary.availableCapacity));
    const [confirmQuit, setConfirmQuit] = useState(false);

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
                invalidate();
                setShowExpand(false);
            },
        }),
    );

    const quitMutation = useMutation(
        trpc.quitClaim.mutationOptions({
            onSuccess: () => {
                invalidate();
                setConfirmQuit(false);
            },
        }),
    );

    const fillPct = claim.maximumCapacity > 0 ? Math.round((claim.quantity / claim.maximumCapacity) * 100) : 0;
    const isSustainable = claim.depletionTicksEstimate === null;

    return (
        <Card className='border-emerald-500/30'>
            <ClaimCardHeader resourceName={claim.resourceName} renewable={summary.renewable} />
            <CardContent className='space-y-3'>
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
                    <div className='space-y-2 border-t pt-3'>
                        <p className='text-xs font-medium'>Expand by</p>
                        <div className='flex items-center gap-2'>
                            <Slider
                                min={0}
                                max={summary.availableCapacity}
                                step={1000}
                                value={[additionalQuantity]}
                                onValueChange={([v]) => setAdditionalQuantity(v ?? 0)}
                                className='flex-1'
                            />
                            <Input
                                type='number'
                                min={0}
                                max={summary.availableCapacity}
                                step={1000}
                                value={additionalQuantity}
                                onChange={(e) =>
                                    setAdditionalQuantity(
                                        Math.max(0, Math.min(summary.availableCapacity, Number(e.target.value))),
                                    )
                                }
                                className='w-24 text-xs'
                            />
                        </div>
                        <div className='flex gap-2'>
                            <Button
                                size='sm'
                                disabled={additionalQuantity <= 0 || expandMutation.isPending}
                                onClick={() =>
                                    expandMutation.mutate({
                                        agentId,
                                        planetId,
                                        claimId: claim.claimId,
                                        additionalQuantity,
                                    })
                                }
                            >
                                {expandMutation.isPending ? 'Expanding…' : 'Confirm Expand'}
                            </Button>
                            <Button size='sm' variant='outline' onClick={() => setShowExpand(false)}>
                                Cancel
                            </Button>
                        </div>
                        {expandMutation.error && (
                            <p className='text-xs text-destructive'>{expandMutation.error.message}</p>
                        )}
                    </div>
                ) : confirmQuit ? (
                    <div className='space-y-2 border-t pt-3'>
                        <p className='text-xs text-destructive font-medium'>Release this claim back to the planet?</p>
                        <div className='flex gap-2'>
                            <Button
                                size='sm'
                                variant='destructive'
                                disabled={quitMutation.isPending}
                                onClick={() => quitMutation.mutate({ agentId, planetId, claimId: claim.claimId })}
                            >
                                {quitMutation.isPending ? 'Releasing…' : 'Confirm Release'}
                            </Button>
                            <Button size='sm' variant='outline' onClick={() => setConfirmQuit(false)}>
                                Cancel
                            </Button>
                        </div>
                        {quitMutation.error && <p className='text-xs text-destructive'>{quitMutation.error.message}</p>}
                    </div>
                ) : (
                    <div className='flex gap-2 border-t pt-3'>
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
