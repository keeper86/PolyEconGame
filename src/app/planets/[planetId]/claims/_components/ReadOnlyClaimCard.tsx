import { Card, CardContent } from '@/components/ui/card';
import { formatNumbers } from '@/lib/utils';
import type { ClaimResourceSummary } from '@/server/controller/planet';
import { ClaimCardHeader } from './ClaimCardHeader';

export function ReadOnlyClaimCard({ summary }: { summary: ClaimResourceSummary }) {
    return (
        <Card className='flex flex-col'>
            <ClaimCardHeader resourceName={summary.resourceName} renewable={summary.renewable} />
            <CardContent className='flex flex-col gap-3 flex-1'>
                <p className='text-xs text-muted-foreground'>
                    Available: {formatNumbers(summary.availableCapacity)} of {formatNumbers(summary.totalCapacity)}
                </p>
                {summary.availableCapacity === 0 && (
                    <p className='text-xs text-red-500'>No capacity available to lease</p>
                )}
            </CardContent>
        </Card>
    );
}
