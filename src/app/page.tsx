import { Page } from '@/components/client/Page';
import { LoginCard } from '@/components/client/LoginCard';
import { APP_ROUTES } from '@/lib/appRoutes';
import { authOptions } from '@/app/api/auth/[...nextauth]/authOptions';
import { getServerSession } from 'next-auth';
import Link from 'next/link';

export default async function LandingPage() {
    const session = await getServerSession(authOptions);

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
