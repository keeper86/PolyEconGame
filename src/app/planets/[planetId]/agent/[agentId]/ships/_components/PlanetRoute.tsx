'use client';

import { PlanetIcon } from '@/components/client/PlanetIcon';
import { ArrowDown, ArrowRight } from 'lucide-react';
import React from 'react';
import { planetName, type PlanetSummary } from './shipFormatting';

export function PlanetRoute({
    fromPlanetId,
    toPlanetId,
    planetSummaries,
}: {
    fromPlanetId: string;
    toPlanetId: string;
    planetSummaries: PlanetSummary[];
}): React.ReactElement {
    return (
        <span className='flex items-center gap-1 text-sm'>
            <PlanetIcon planetId={fromPlanetId} />
            <span>{planetName(planetSummaries, fromPlanetId)}</span>
            <ArrowRight className='h-3 w-3 text-muted-foreground' />
            <PlanetIcon planetId={toPlanetId} />
            <span>{planetName(planetSummaries, toPlanetId)}</span>
        </span>
    );
}

export function PlanetRouteIcon({
    fromPlanetId,
    toPlanetId,
}: {
    fromPlanetId: string;
    toPlanetId: string;
}): React.ReactElement {
    return (
        <span className='flex flex-col items-center gap-1'>
            <PlanetIcon planetId={fromPlanetId} size={40} />
            <ArrowDown className='h-3 w-3 text-muted-foreground' />
            <PlanetIcon planetId={toPlanetId} size={40} />
        </span>
    );
}
