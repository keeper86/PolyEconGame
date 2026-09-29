import { Card } from '@/components/ui/card';
import { Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LicensePanel } from './LicensePanel';

type Props = {
    agentId: string;
    planetId: string;
    isOwnAgent?: boolean;
};

export function NoAssetsMessage({ planetId, agentId, isOwnAgent }: Props) {
    const t = useTranslations('Agent');
    return (
        <div className='space-y-4'>
            <Card className='flex flex-col items-center justify-center gap-2 py-8 text-center'>
                <Globe className='h-8 w-8 text-muted-foreground' />
                <p className='text-sm font-medium'>{t('noPresenceOn', { planetId })}</p>
                <p className='text-xs text-muted-foreground max-w-xs'>{t('acquireCommercialLicense')}</p>
            </Card>
            {isOwnAgent && (
                <LicensePanel agentId={agentId} planetId={planetId} isOwnAgent={true} licenses={undefined} />
            )}
        </div>
    );
}
