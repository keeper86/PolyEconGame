'use client';
import { AvatarUploadDialog } from '@/app/account/AvatarUploadDialog';
import { Page } from '@/components/client/Page';
import { useTour } from '@/components/tour/TourContext';
import { useAgentId } from '@/hooks/useAgentId';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';

export default function AccountPage() {
    const session = useSession();
    const { agentId, planetId } = useAgentId();
    const { isTourActive, isCompleted, resetTour } = useTour();

    if (session.status !== 'authenticated') {
        return <div>Loading...</div>;
    }

    const showRestart = agentId && planetId && (!isTourActive || isCompleted);

    return (
        <Page title='Account Management'>
            <div className='w-full max-w-md space-y-4 flex flex-col flex-gap-2'>
                <AvatarUploadDialog triggerLabel='Upload Avatar' />

                <Button
                    type='button'
                    disabled={isTourActive || !showRestart}
                    className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors'
                    onClick={() => {
                        resetTour();
                        // Use window.location.href to bypass the navigation guard
                        // which would otherwise block the redirect with "unsaved changes" toast.
                        window.location.href = `/planets/${planetId}/agent/${agentId}/financial`;
                    }}
                >
                    Restart Tutorial
                </Button>
            </div>
        </Page>
    );
}
