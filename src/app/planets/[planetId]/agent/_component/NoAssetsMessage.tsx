import { Card } from '@/components/ui/card';
import { Globe } from 'lucide-react';
import { LicensePanel } from './LicensePanel';

type Props = {
    agentId: string;
    planetId: string;
    isOwnAgent?: boolean;
};

export function NoAssetsMessage({ planetId, agentId, isOwnAgent }: Props) {
    return (
        <div className='space-y-4'>
            <Card className='flex flex-col items-center justify-center gap-2 py-8 text-center'>
                <Globe className='h-8 w-8 text-muted-foreground' />
                <p className='text-sm font-medium'>No presence on {planetId}</p>
                <p className='text-xs text-muted-foreground max-w-xs'>
                    Acquire a commercial license to establish a bank account and begin trading on this planet.
                </p>
            </Card>
            {isOwnAgent && (
                <LicensePanel agentId={agentId} planetId={planetId} isOwnAgent={true} licenses={undefined} />
            )}
        </div>
    );
}
