'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Building2, ChevronRight, Globe, Package, Ship, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { route } from 'nextjs-routes';
import React from 'react';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Colour class based on an efficiency fraction (0-1). */
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

const fmtNumber = (n: number): string =>
    n >= 1_000_000
        ? `${(n / 1_000_000).toFixed(1)}M`
        : n >= 1_000
          ? `${(n / 1_000).toFixed(1)}k`
          : String(Math.round(n));

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Pre-computed summary data from the server endpoint. */
export type AgentSummary = {
    agentId: string;
    name: string;
    associatedPlanetId: string;
    wealth: number;
    facilityCount: number;
    avgEfficiency: number | null;
    totalWorkers: number;
    unusedWorkerFraction: number;
    topResources: Array<{ name: string; quantity: number }>;
    shipCount: number;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

type Props = {
    summary: AgentSummary;
};

export default function AgentSummaryCard({ summary: s }: Props): React.ReactElement {
    return (
        <Link
            href={route({ pathname: '/agents/[agentId]', query: { agentId: s.agentId } })}
            className='block transition-transform hover:scale-[1.01] active:scale-[0.99]'
        >
            <Card className='hover:border-primary/40 transition-colors'>
                <CardHeader className='pb-3'>
                    <div className='flex items-center justify-between'>
                        <div className='flex items-center gap-3'>
                            <div className='flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary'>
                                <Users className='h-5 w-5' />
                            </div>
                            <div>
                                <h3 className='text-lg font-semibold leading-none'>{s.name}</h3>
                                <div className='mt-1 flex items-center gap-1 text-xs text-muted-foreground'>
                                    <Globe className='h-3 w-3' />
                                    {s.associatedPlanetId}
                                </div>
                            </div>
                        </div>
                        <ChevronRight className='h-5 w-5 text-muted-foreground' />
                    </div>
                </CardHeader>

                <CardContent>
                    {/* Key metrics row */}
                    <div className='grid grid-cols-2 sm:grid-cols-4 gap-4'>
                        {/* Wealth */}
                        <div className='space-y-1'>
                            <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                                <Wallet className='h-3.5 w-3.5' />
                                Wealth
                            </div>
                            <div className='text-lg font-semibold tabular-nums'>{fmtNumber(s.wealth)}</div>
                        </div>

                        {/* Facilities */}
                        <div className='space-y-1'>
                            <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                                <Building2 className='h-3.5 w-3.5' />
                                Facilities
                            </div>
                            <div className='flex items-baseline gap-2'>
                                <span className='text-lg font-semibold tabular-nums'>{s.facilityCount}</span>
                                {s.avgEfficiency !== null && (
                                    <span className={`text-sm font-medium ${effColor(s.avgEfficiency)}`}>
                                        {pct(s.avgEfficiency)} eff.
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Workers */}
                        <div className='space-y-1'>
                            <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                                <Users className='h-3.5 w-3.5' />
                                Workers
                            </div>
                            <div className='flex items-baseline gap-2'>
                                <span className='text-lg font-semibold tabular-nums'>{fmtNumber(s.totalWorkers)}</span>
                                {s.unusedWorkerFraction > 0.01 && (
                                    <span className='text-xs text-amber-500'>{pct(s.unusedWorkerFraction)} idle</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Secondary metrics row: Ships */}
                    <div className='mt-3 flex items-center gap-6'>
                        <div className='space-y-0.5'>
                            <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                                <Ship className='h-3.5 w-3.5' />
                                Ships
                            </div>
                            <div className='text-sm font-semibold tabular-nums'>{s.shipCount}</div>
                        </div>
                    </div>

                    {/* Top resources badges */}
                    {s.topResources.length > 0 && (
                        <div className='mt-4 flex items-center gap-2 flex-wrap'>
                            <Package className='h-3.5 w-3.5 text-muted-foreground' />
                            {s.topResources.map((r) => (
                                <Badge key={r.name} variant='secondary'>
                                    {r.name}: {fmtNumber(r.quantity)}
                                </Badge>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </Link>
    );
}
