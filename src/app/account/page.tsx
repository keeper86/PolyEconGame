'use client';
import { AvatarUploadDialog } from '@/app/account/AvatarUploadDialog';
import { InteractivePaperworkProcess } from '@/components/client/FakePaperWorkProcess';
import { Page } from '@/components/client/Page';
import { useTour } from '@/components/tour/TourContext';
import { Button } from '@/components/ui/button';
import { useAgentId } from '@/hooks/useAgentId';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';

export default function AccountPage() {
    const session = useSession();
    const { agentId, planetId } = useAgentId();
    const { isTourActive, isCompleted, resetTour } = useTour();
    const t = useTranslations('Account');
    const tc = useTranslations('Common');

    if (session.status !== 'authenticated') {
        return <div>{tc('loading')}</div>;
    }

    const showRestart = agentId && planetId && (!isTourActive || isCompleted);

    return (
        <Page title={t('title')}>
            <div className='w-full max-w-md space-y-4 flex flex-col flex-gap-2'>
                <AvatarUploadDialog />

                <Button
                    type='button'
                    disabled={isTourActive || !showRestart}
                    className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors'
                    onClick={() => {
                        resetTour();
                        window.location.href = `/planets/${planetId}/agent/${agentId}/financial`;
                    }}
                >
                    {t('restartTutorial')}
                </Button>

                <span className='w-full'>
                    <InteractivePaperworkProcess />
                </span>
            </div>
        </Page>
    );
}
