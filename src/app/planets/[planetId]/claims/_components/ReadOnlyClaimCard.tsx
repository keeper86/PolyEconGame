import { Card, CardContent } from '@/components/ui/card';
import { formatNumbers } from '@/lib/utils';
import type { ClaimResourceSummary } from '@/server/controller/planet';
import { ClaimCardHeader } from './ClaimCardHeader';

export function ReadOnlyClaimCard({ summary }: { summary: ClaimResourceSummary }) {
    const tenantedFraction = summary.totalCapacity > 0 ? summary.tenantedCapacity / summary.totalCapacity : 0;
    const tenantedPct = Math.round(tenantedFraction * 100);
    const availablePct = 100 - tenantedPct;

    return (
        <Card>
            <ClaimCardHeader resourceName={summary.resourceName} renewable={summary.renewable} />
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
