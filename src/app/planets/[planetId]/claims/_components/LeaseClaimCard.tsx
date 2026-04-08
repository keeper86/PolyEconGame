'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { ProductIcon } from '@/components/client/ProductIcon';
import { Leaf } from 'lucide-react';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatNumbers } from '@/lib/utils';
import { LAND_CLAIM_COST_PER_UNIT } from '@/simulation/constants';
import type { ClaimResourceSummary } from '@/server/controller/planet';

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
    const [quantity, setQuantity] = useState(Math.min(1000, summary.availableCapacity));

    const leaseMutation = useMutation(
        trpc.leaseClaim.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getPlanetClaims.queryKey({ planetId }),
                });
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getAgentClaims.queryKey({ agentId, planetId }),
                });
            },
        }),
    );

    const costPerTick = Math.floor(quantity * (LAND_CLAIM_COST_PER_UNIT[summary.resourceName] ?? 1));

    return (
        <Card>
            <CardHeader className='pb-2'>
                <CardTitle className='flex items-center gap-2 text-sm font-semibold'>
                    <ProductIcon productName={summary.resourceName} />
                    {summary.resourceName}
                    {summary.renewable && <Leaf className='h-4 w-4 text-green-500' />}
                </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
                <p className='text-xs text-muted-foreground'>
                    Available: {formatNumbers(summary.availableCapacity)} of {formatNumbers(summary.totalCapacity)}
                </p>
                <div className='space-y-2'>
                    <p className='text-xs font-medium'>Lease quantity</p>
                    <div className='flex items-center gap-2'>
                        <Slider
                            min={0}
                            max={summary.availableCapacity}
                            step={1000}
                            value={[quantity]}
                            onValueChange={([v]) => setQuantity(v ?? 0)}
                            className='flex-1'
                        />
                        <Input
                            type='number'
                            min={0}
                            max={summary.availableCapacity}
                            step={1000}
                            value={quantity}
                            onChange={(e) =>
                                setQuantity(Math.max(0, Math.min(summary.availableCapacity, Number(e.target.value))))
                            }
                            className='w-24 text-xs'
                        />
                    </div>
                    <p className='text-xs text-muted-foreground'>
                        Cost per tick:{' '}
                        <span className='font-medium text-amber-600 dark:text-amber-400'>
                            {formatNumbers(costPerTick)} ¢
                        </span>
                    </p>
                </div>
                <Button
                    size='sm'
                    disabled={quantity <= 0 || leaseMutation.isPending}
                    onClick={() =>
                        leaseMutation.mutate({ agentId, planetId, resourceName: summary.resourceName, quantity })
                    }
                >
                    {leaseMutation.isPending ? 'Leasing…' : 'Lease'}
                </Button>
                {leaseMutation.error && <p className='text-xs text-destructive'>{leaseMutation.error.message}</p>}
            </CardContent>
        </Card>
    );
}
