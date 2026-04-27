'use client';

import React, { useMemo, useState } from 'react';
import { formatNumberWithUnit } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { calculateCostsForConstruction } from '@/simulation/planet/facility';
import { Anchor, PlusCircle, Users, Zap } from 'lucide-react';

export function ShipyardBuildSection({
    agentId,
    planetId,
    constructionServicePrice,
    onBuilt,
}: {
    agentId: string;
    planetId: string;
    constructionServicePrice: number | undefined;
    onBuilt: () => void;
}): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const [showForm, setShowForm] = useState(false);
    const [targetScale, setTargetScale] = useState(1);
    const [shipyardName, setShipyardName] = useState('');

    const buildCost = useMemo(() => calculateCostsForConstruction('ship_construction', 0, targetScale), [targetScale]);
    const estimatedCredits =
        constructionServicePrice && constructionServicePrice > 0 ? buildCost * constructionServicePrice : null;

    const buildMutation = useMutation(
        trpc.buildShipConstructionFacility.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getAgentPlanetDetail.queryKey({ agentId, planetId }),
                });
                setShowForm(false);
                setShipyardName('');
                setTargetScale(1);
                onBuilt();
            },
        }),
    );

    if (!showForm) {
        return (
            <div className='flex items-center gap-3 p-3 rounded-lg border border-dashed text-muted-foreground'>
                <Anchor className='h-5 w-5 shrink-0' />
                <div className='flex-1 text-sm'>Build a new shipyard to construct and maintain transport ships.</div>
                <Button size='sm' variant='outline' className='gap-1' onClick={() => setShowForm(true)}>
                    <PlusCircle className='h-3.5 w-3.5' />
                    Build shipyard
                </Button>
            </div>
        );
    }

    return (
        <div className='rounded-lg border p-4 space-y-4'>
            <div className='flex items-center gap-2'>
                <Anchor className='h-5 w-5 text-muted-foreground' />
                <h3 className='font-semibold text-sm'>New Shipyard</h3>
            </div>

            <div className='grid gap-3 text-xs text-muted-foreground'>
                <div className='flex items-center gap-2'>
                    <Users className='h-3.5 w-3.5' />
                    <span>Workers: 10 unskilled · 20 primary · 10 secondary · 5 tertiary (per scale)</span>
                </div>
                <div className='flex items-center gap-2'>
                    <Zap className='h-3.5 w-3.5' />
                    <span>2 MW power per scale</span>
                </div>
            </div>

            <Separator />

            <div className='space-y-2'>
                <Label className='text-xs'>Shipyard name</Label>
                <Input
                    className='h-8 text-xs'
                    placeholder='Enter a unique name, e.g. "Shipyard Alpha"'
                    value={shipyardName}
                    maxLength={50}
                    onChange={(e) => setShipyardName(e.target.value)}
                />
            </div>

            <div className='space-y-2'>
                <div className='flex items-center justify-between text-xs'>
                    <Label className='text-xs'>Initial scale</Label>
                    <span className='tabular-nums font-medium'>{targetScale}</span>
                </div>
                <Slider min={1} max={10} step={1} value={[targetScale]} onValueChange={([v]) => setTargetScale(v)} />
            </div>

            <div className='text-xs text-muted-foreground'>
                Construction cost: {formatNumberWithUnit(buildCost, 'units')} cs
                {estimatedCredits ? (
                    <span> ≈ {formatNumberWithUnit(estimatedCredits, 'currency', planetId)} ₵</span>
                ) : null}
            </div>

            {buildMutation.error && <p className='text-destructive text-xs'>{buildMutation.error.message}</p>}

            <div className='flex gap-2'>
                <Button
                    size='sm'
                    disabled={!shipyardName.trim() || buildMutation.isPending}
                    onClick={() =>
                        buildMutation.mutate({
                            agentId,
                            planetId,
                            facilityName: shipyardName.trim(),
                            targetScale,
                        })
                    }
                >
                    Build
                </Button>
                <Button
                    size='sm'
                    variant='ghost'
                    onClick={() => {
                        setShowForm(false);
                        setShipyardName('');
                        setTargetScale(1);
                    }}
                >
                    Cancel
                </Button>
            </div>
        </div>
    );
}
