'use client';
import { AvatarUploadDialog } from '@/app/account/AvatarUploadDialog';
import { Page } from '@/components/client/Page';
import { useSession } from 'next-auth/react';

export default function AccountPage() {
    const session = useSession();

    if (session.status !== 'authenticated') {
        return <div>Loading...</div>;
    }

    return (
        <Page title='Account Management'>
            <div className='w-full max-w-md space-y-4 flex flex-col flex-gap-2'>
                <AvatarUploadDialog triggerLabel='Upload Avatar' />
            </div>
        </Page>
    );
}
