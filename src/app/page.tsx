import { authOptions } from '@/app/api/auth/[...nextauth]/authOptions';
import { FoundingPage } from '@/components/client/FoundingPage';
import { LoginCard } from '@/components/client/LoginCard';
import { Page } from '@/components/client/Page';
import { resolveBankruptcyForUser } from '@/server/bankruptcy';
import { db } from '@/server/db';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

export default async function LandingPage() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return (
            <Page title='Login'>
                <LoginCard />
            </Page>
        );
    }

    const row = await db('user_data').where({ user_id: session.user.id }).first();

    if (row?.agent_id) {
        if (resolveBankruptcyForUser(row.agent_id)) {
            redirect('/bankrupt');
        }
        redirect('/planets/');
    }

    return <FoundingPage />;
}
