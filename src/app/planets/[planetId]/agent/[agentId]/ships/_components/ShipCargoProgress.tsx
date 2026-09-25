'use client';

import { Progress } from '@/components/ui/progress';
import type { ResourceQuantity } from '@/simulation/planet/claims';
import React from 'react';

export function cargoProgressPercent(goal: ResourceQuantity, current: ResourceQuantity | null): number {
    if (goal.quantity <= 0) {
        return 0;
    }
    const loaded = current?.quantity ?? 0;
    return Math.min(100, Math.max(0, (loaded / goal.quantity) * 100));
}

export function ShipCargoProgress({
    goal,
    current,
}: {
    goal: ResourceQuantity;
    current: ResourceQuantity | null;
}): React.ReactElement {
    const pct = cargoProgressPercent(goal, current);
    return (
        <div className='w-full'>
            <div className='flex justify-between text-xs text-muted-foreground mb-1'>
                <span>Loading cargo</span>
                <span className='tabular-nums font-medium text-foreground'>{Math.round(pct)}%</span>
            </div>
            <Progress value={pct} className='h-1.5' />
        </div>
    );
}
