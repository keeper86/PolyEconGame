'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatNumbers } from '@/lib/utils';
import type { PlanetSummary } from '@/server/controller/simulation';
import { ChevronRight, Globe, Landmark, Users, Wheat } from 'lucide-react';
import Link from 'next/link';
import React from 'react';

interface PlanetSummaryCardProps {
    summary: PlanetSummary;
}

export default function PlanetSummaryCard({ summary }: PlanetSummaryCardProps): React.ReactElement {
    const { planetId, name, populationTotal, bank, foodPrice } = summary;
    return (
        <Link
            href={`/planets/${encodeURIComponent(planetId)}` as never}
            className='block transition-transform hover:scale-[1.01] active:scale-[0.99]'
        >
            <Card className='hover:border-primary/40 transition-colors'>
                <CardHeader className='pb-3'>
                    <div className='flex items-center justify-between'>
                        <div className='flex items-center gap-3'>
                            <div className='flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary'>
                                <Globe className='h-5 w-5' />
                            </div>
                            <div>
                                <h3 className='text-lg font-semibold leading-none'>{name}</h3>
                                <div className='mt-1 text-xs text-muted-foreground'>{planetId}</div>
                            </div>
                        </div>
                        <ChevronRight className='h-5 w-5 text-muted-foreground' />
                    </div>
                </CardHeader>

                <CardContent>
                    <div className='grid grid-cols-2 sm:grid-cols-4 gap-4'>
                        {/* Population */}
                        <div className='space-y-1'>
                            <div className='flex items-center gap-1 text-xs text-muted-foreground'>
                                <Users className='h-3 w-3' />
                                Population
                            </div>
                            <div className='text-sm font-semibold tabular-nums'>{formatNumbers(populationTotal)}</div>
                        </div>

                        {/* Money supply */}
                        {bank && (
                            <div className='space-y-1'>
                                <div className='flex items-center gap-1 text-xs text-muted-foreground'>
                                    <Landmark className='h-3 w-3' />
                                    Money supply
                                </div>
                                <div className='text-sm font-semibold tabular-nums'>{formatNumbers(bank.deposits)}</div>
                            </div>
                        )}

                        {/* Food price */}
                        {foodPrice !== undefined && (
                            <div className='space-y-1'>
                                <div className='flex items-center gap-1 text-xs text-muted-foreground'>
                                    <Wheat className='h-3 w-3' />
                                    Food price
                                </div>
                                <div className='text-sm font-semibold tabular-nums'>{foodPrice.toFixed(3)}</div>
                            </div>
                        )}
                    </div>

                    {/* Badges */}
                    <div className='mt-3 flex flex-wrap gap-1.5'>
                        {bank && bank.equity < 0 && <Badge variant='destructive'>Negative bank equity</Badge>}
                        {populationTotal === 0 && <Badge variant='secondary'>Uninhabited</Badge>}
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}
