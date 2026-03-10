'use client';

import React from 'react';
import Link from 'next/link';
import { route } from 'nextjs-routes';
import { Building2, ChevronRight, Globe, Package, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatNumbers } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const effColor = (frac: number): string => {
    if (frac >= 0.9) {
        return 'text-green-600';
    }
    if (frac >= 0.5) {
        return 'text-amber-500';
    }
    return 'text-red-500';
};

const pct = (frac: number): string => `${Math.round(frac * 100)}%`;

/* ------------------------------------------------------------------ */
/*  Stat row — label / value pair (matching EducationLevelCards style) */
/* ------------------------------------------------------------------ */

function Stat({
    label,
    value,
    valueClassName,
}: {
    label: React.ReactNode;
    value: React.ReactNode;
    valueClassName?: string;
}): React.ReactElement {
    return (
        <div className='flex items-baseline justify-between gap-2'>
            <span className='truncate text-muted-foreground'>{label}</span>
            <span className={`tabular-nums whitespace-nowrap font-medium ${valueClassName ?? ''}`}>{value}</span>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type PlanetAssetSummary = {
    planetId: string;
    facilityCount: number;
    avgEfficiency: number | null;
    totalWorkers: number;
    unusedWorkerFraction: number;
    topResources: Array<{ name: string; quantity: number }>;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

type Props = {
    agentId: string;
    planet: PlanetAssetSummary;
    isHomePlanet?: boolean;
};

export default function PlanetAssetCard({ agentId, planet: p, isHomePlanet }: Props): React.ReactElement {
    return (
        <Link
            href={route({
                pathname: '/agents/[agentId]/[planetId]',
                query: { agentId, planetId: p.planetId },
            })}
            className='block'
        >
            <div
                className={`min-w-[240px] flex-1 rounded-lg border p-3 space-y-0.5 text-xs
                    hover:border-primary/40 transition-colors cursor-pointer
                    ${isHomePlanet ? 'border-2 bg-muted/10' : ''}`}
            >
                {/* Header */}
                <div className='flex items-center justify-between mb-1.5'>
                    <Badge variant='outline' className='text-xs px-1.5 py-0.5 gap-1'>
                        <Globe className='h-3 w-3' />
                        {p.planetId}
                        {isHomePlanet && <span className='text-[10px] text-muted-foreground ml-0.5'>(home)</span>}
                    </Badge>
                    <ChevronRight className='h-3.5 w-3.5 text-muted-foreground' />
                </div>

                {/* Facilities */}
                <Stat
                    label={
                        <span className='flex items-center gap-1'>
                            <Building2 className='h-3 w-3' />
                            Facilities
                        </span>
                    }
                    value={
                        p.avgEfficiency !== null ? (
                            <span>
                                {p.facilityCount}{' '}
                                <span className={`text-[10px] ${effColor(p.avgEfficiency)}`}>
                                    {pct(p.avgEfficiency)} eff.
                                </span>
                            </span>
                        ) : (
                            p.facilityCount
                        )
                    }
                />

                {/* Workers */}
                <Stat
                    label={
                        <span className='flex items-center gap-1'>
                            <Users className='h-3 w-3' />
                            Workers
                        </span>
                    }
                    value={
                        <span>
                            {formatNumbers(p.totalWorkers)}
                            {p.unusedWorkerFraction > 0.01 && (
                                <span className='text-[10px] text-amber-500 ml-1'>
                                    {pct(p.unusedWorkerFraction)} idle
                                </span>
                            )}
                        </span>
                    }
                />

                {/* Top resources */}
                {p.topResources.length > 0 && (
                    <div className='pt-1 flex items-start gap-1 flex-wrap'>
                        <Package className='h-3 w-3 text-muted-foreground mt-0.5 shrink-0' />
                        {p.topResources.map((r) => (
                            <Badge key={r.name} variant='secondary' className='text-[10px] px-1 py-0'>
                                {r.name}: {formatNumbers(r.quantity)}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>
        </Link>
    );
}
