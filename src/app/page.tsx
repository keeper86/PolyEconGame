import { authOptions } from '@/app/api/auth/[...nextauth]/authOptions';
import { FoundingPage } from '@/components/client/FoundingPage';
import { LoginCard } from '@/components/client/LoginCard';
import { Page } from '@/components/client/Page';
import { getServerSession } from 'next-auth';

export default async function LandingPage() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return (
            <Page title='Login'>
                <LoginCard />
            </Page>
        );
    }

    return <FoundingPage />;
}
