import { authOptions } from '@/app/api/auth/[...nextauth]/authOptions';
import { FoundingPage } from '@/components/client/FoundingPage';
import { LoginCard } from '@/components/client/LoginCard';
import { Page } from '@/components/client/Page';
import { db } from '@/server/db';
import { workerQueries } from '@/simulation/workerClient/queries';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

export default async function LandingPage() {
    const session = await getServerSession(authOptions);

    // Step 1: not logged in → show login
    if (!session?.user?.id) {
        return (
            <Page title='Login'>
                <LoginCard />
            </Page>
        );
    }

    const row = await db('user_data').where({ user_id: session.user.id }).first();

    // Step 3: already has a company → server-side redirect to planet page
    if (row?.agent_id) {
        const { agent } = await workerQueries.getAgent(row.agent_id);
        if (agent?.associatedPlanetId) {
            redirect(`/planets/${encodeURIComponent(agent.associatedPlanetId)}/demographics`);
        }
    }

    // Step 2: logged in but no company yet → founding mask
    return <FoundingPage />;
}
