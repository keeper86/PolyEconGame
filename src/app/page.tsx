import { authOptions } from '@/app/api/auth/[...nextauth]/authOptions';
import { LoginCard } from '@/components/client/LoginCard';
import { Page } from '@/components/client/Page';
import { db } from '@/server/db';
import { workerQueries } from '@/simulation/workerClient/queries';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

export default async function LandingPage() {
    const session = await getServerSession(authOptions);

    // If the user is logged in and has a company (agent), redirect to the
    // associated planet's demographics page (there is no dedicated root page).
    if (session?.user?.id) {
        const row = await db('user_data').where({ user_id: session.user.id }).first();
        if (row?.agent_id) {
            const { agent } = await workerQueries.getAgent(row.agent_id);
            if (agent?.associatedPlanetId) {
                redirect(`/planets/${encodeURIComponent(agent.associatedPlanetId)}/demographics`);
            }
        }
    }

    return <Page title='Login'>{!session && <LoginCard />}</Page>;
}
