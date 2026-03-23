'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumbers } from '@/lib/utils';
import { useParams } from 'next/navigation';
import type { ClaimResourceSummary } from '@/server/controller/planet';
import { Leaf, Mountain } from 'lucide-react';

function ClaimCard({ summary }: { summary: ClaimResourceSummary }) {
    const tenantedFraction = summary.totalCapacity > 0 ? summary.tenantedCapacity / summary.totalCapacity : 0;
    const tenantedPct = Math.round(tenantedFraction * 100);
    const availablePct = 100 - tenantedPct;

    return (
        <Card>
            <CardHeader className='pb-2'>
                <CardTitle className='flex items-center gap-2 text-sm font-semibold'>
                    {summary.renewable ? (
                        <Leaf className='h-4 w-4 text-green-500' />
                    ) : (
                        <Mountain className='h-4 w-4 text-stone-500' />
                    )}
                    {summary.resourceName}
                    <span className='ml-auto text-xs font-normal text-muted-foreground'>
                        {summary.tenantedClaims}/{summary.totalClaims} leased
                    </span>
                </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
                <div className='h-3 w-full overflow-hidden rounded-full bg-muted'>
                    <div
                        className='h-full bg-amber-500 transition-all'
                        style={{ width: `${tenantedPct}%` }}
                        title={`${tenantedPct}% leased`}
                    />
                </div>

                <div className='grid grid-cols-2 gap-2 text-xs'>
                    <div className='space-y-0.5'>
                        <p className='text-muted-foreground'>Leased</p>
                        <p className='font-medium text-amber-600 dark:text-amber-400'>
                            {formatNumbers(summary.tenantedCapacity)}
                            <span className='ml-1 text-muted-foreground'>({tenantedPct}%)</span>
                        </p>
                    </div>
                    <div className='space-y-0.5'>
                        <p className='text-muted-foreground'>Available</p>
                        <p className='font-medium text-emerald-600 dark:text-emerald-400'>
                            {formatNumbers(summary.availableCapacity)}
                            <span className='ml-1 text-muted-foreground'>({availablePct}%)</span>
                        </p>
                    </div>
                </div>

                <p className='text-xs text-muted-foreground'>Total capacity: {formatNumbers(summary.totalCapacity)}</p>
            </CardContent>
        </Card>
    );
}

function ClaimsContent({ planetId }: { planetId: string }) {
    const trpc = useTRPC();
    const { data, isLoading } = useSimulationQuery(trpc.simulation.getPlanetClaims.queryOptions({ planetId }));

    if (isLoading) {
        return <div className='text-sm text-muted-foreground'>Loading claims data…</div>;
    }

    const resources = data?.resources ?? [];

    if (resources.length === 0) {
        return <div className='text-sm text-muted-foreground'>No land-bound claims on this planet.</div>;
    }

    const totalClaims = resources.reduce((s, r) => s + r.totalClaims, 0);
    const leasedClaims = resources.reduce((s, r) => s + r.tenantedClaims, 0);
    const availableClaims = totalClaims - leasedClaims;

    return (
        <div className='space-y-4'>
            <div className='flex flex-wrap gap-4 text-sm'>
                <span className='text-muted-foreground'>
                    <span className='font-medium text-foreground'>{totalClaims}</span> total plots
                </span>
                <span className='text-muted-foreground'>
                    <span className='font-medium text-amber-600 dark:text-amber-400'>{leasedClaims}</span> leased
                </span>
                <span className='text-muted-foreground'>
                    <span className='font-medium text-emerald-600 dark:text-emerald-400'>{availableClaims}</span>{' '}
                    available
                </span>
            </div>

            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                {resources.map((r) => (
                    <ClaimCard key={r.resourceName} summary={r} />
                ))}
            </div>
        </div>
    );
}

export default function PlanetClaimsPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';

    return (
        <div className='space-y-4'>
            <div>
                <h3 className='text-base font-semibold'>Land Claims</h3>
                <p className='text-sm text-muted-foreground'>
                    All land-bound resource plots on this planet. The government owns every claim; companies can become
                    lessees.
                </p>
            </div>
            <ClaimsContent planetId={planetId} />
        </div>
    );
}
