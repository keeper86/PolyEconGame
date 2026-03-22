import { Card } from '@/components/ui/card';
import { Globe } from 'lucide-react';
import Link from 'next/link';

type Props = {
    agentId: string;
    planetName: string;
};

export function NoAssetsMessage({ planetName, agentId }: Props) {
    return (
        <Card className='flex flex-col items-center justify-center gap-2 py-16 text-center'>
            <Globe className='h-8 w-8 text-muted-foreground' />
            <p className='text-sm font-medium'>No presence on {planetName}</p>
            <p className='text-xs text-muted-foreground max-w-xs'>
                This company has no assets or facilities on this planet.
            </p>
            <Link href={`/agents/${agentId}` as never}>Leave this planet and go to your agent page</Link>
        </Card>
    );
}
