import { redirect } from 'next/navigation';
import { Page } from '@/components/client/Page';
import { LoginCard } from '@/components/client/LoginCard';
import { APP_ROUTES } from '@/lib/appRoutes';
import { authOptions } from '@/app/api/auth/[...nextauth]/authOptions';
import { getServerSession } from 'next-auth';
import { db } from '@/server/db';
import { workerQueries } from '@/simulation/workerClient/queries';
import Link from 'next/link';

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

    return (
        <Page title='Game'>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6'>
                <Link
                    href={APP_ROUTES.simulation.path}
                    className='block p-4 border rounded-md hover:bg-accent transition-colors'
                >
                    <h2 className='text-lg font-semibold'>{APP_ROUTES.simulation.label}</h2>
                    <p className='text-sm text-muted-foreground'>{APP_ROUTES.simulation.description}</p>
                </Link>
            </div>
            {!session && <LoginCard />}
        </Page>
    );
}
