'use client';

import { PlanetIcon } from '@/components/client/PlanetIcon';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import React from 'react';

export function PlanetDestinationSelect({
    fromPlanetId,
    value,
    onChange,
}: {
    fromPlanetId: string;
    value: string;
    onChange: (value: string) => void;
}): React.ReactElement {
    const trpc = useTRPC();
    const { data: planetSummaries } = useSimulationQuery(trpc.simulation.getLatestPlanetSummaries.queryOptions());
    const planets = (planetSummaries?.planets ?? []).filter((p) => p.planetId !== fromPlanetId);

    return (
        <div className='space-y-1.5'>
            <Label>Destination Planet</Label>
            <Select value={value} onValueChange={onChange} required>
                <SelectTrigger>
                    <SelectValue placeholder='Select destination…' />
                </SelectTrigger>
                <SelectContent>
                    {planets.map((p) => (
                        <SelectItem key={p.planetId} value={p.planetId}>
                            <span className='flex items-center gap-2'>
                                <PlanetIcon planetId={p.planetId} />
                                {p.name}
                            </span>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
