'use client';

import { ProductIcon } from '@/components/client/ProductIcon';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumbers } from '@/lib/utils';
import type { ClaimResourceSummary } from '@/server/controller/planet';
import { Leaf } from 'lucide-react';
import { useParams } from 'next/navigation';

function ClaimCard({ summary }: { summary: ClaimResourceSummary }) {
    const tenantedFraction = summary.totalCapacity > 0 ? summary.tenantedCapacity / summary.totalCapacity : 0;
    const tenantedPct = Math.round(tenantedFraction * 100);
    const availablePct = 100 - tenantedPct;

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
                <p className='text-xs text-muted-foreground'>Total capacity: {formatNumbers(summary.totalCapacity)}</p>
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

    return (
        <div className='space-y-4'>
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
                <p className='text-sm text-muted-foreground'>All land-bound resource plots on this planet.</p>
            </div>
            <ClaimsContent planetId={planetId} />
        </div>
    );
}
