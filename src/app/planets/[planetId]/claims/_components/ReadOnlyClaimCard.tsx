import { Card, CardContent } from '@/components/ui/card';
import { formatNumberWithUnit } from '@/lib/utils';
import type { ClaimResourceSummary } from '@/server/controller/planet';
import { ClaimCardHeader } from './ClaimCardHeader';
import { resourceNameToSlug } from '@/app/planets/[planetId]/agent/[agentId]/market/_components/marketHelpers';

export function ReadOnlyClaimCard({ summary }: { summary: ClaimResourceSummary }) {
    return (
        <Card id={resourceNameToSlug(summary.resourceName)} className='flex flex-col'>
            <ClaimCardHeader resourceName={summary.resourceName} renewable={summary.renewable} />
            <CardContent className='flex flex-col gap-3 flex-1'>
                <p className='text-xs text-muted-foreground'>
                    Available: {formatNumberWithUnit(summary.availableCapacity, 'units')} of{' '}
                    {formatNumberWithUnit(summary.totalCapacity, 'units')}
                </p>
                {summary.availableCapacity === 0 && (
                    <p className='text-xs text-red-500'>No capacity available to lease</p>
                )}
            </CardContent>
        </Card>
    );
}
