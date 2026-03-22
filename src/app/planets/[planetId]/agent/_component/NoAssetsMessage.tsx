import { Card } from '@/components/ui/card';
import { Globe } from 'lucide-react';

type Props = {
    planetId: string;
};

export function NoAssetsMessage({ planetId }: Props) {
    return (
        <Card className='flex flex-col items-center justify-center gap-2 py-16 text-center'>
            <Globe className='h-8 w-8 text-muted-foreground' />
            <p className='text-sm font-medium'>No presence on {planetId}</p>
            <p className='text-xs text-muted-foreground max-w-xs'>
                This company has no assets or facilities on this planet.
            </p>
        </Card>
    );
}
