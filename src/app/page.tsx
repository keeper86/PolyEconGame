import { Page } from '@/components/client/Page';
import SecondTicker from '@/components/client/SecondTicker';
import { APP_ROUTES } from '@/lib/appRoutes';
import Link from 'next/link';

export default function LandingPage() {
    return (
        <Page title='Game'>
            <div className='mb-4'>
                <SecondTicker />
            </div>

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6'>
                <Link
                    href={APP_ROUTES.agents.path}
                    className='block p-4 border rounded-md hover:bg-accent transition-colors'
                >
                    <h2 className='text-lg font-semibold'>{APP_ROUTES.agents.label}</h2>
                    <p className='text-sm text-muted-foreground'>{APP_ROUTES.agents.description}</p>
                </Link>
                <Link
                    href={APP_ROUTES.planets.path}
                    className='block p-4 border rounded-md hover:bg-accent transition-colors'
                >
                    <h2 className='text-lg font-semibold'>{APP_ROUTES.planets.label}</h2>
                    <p className='text-sm text-muted-foreground'>{APP_ROUTES.planets.description}</p>
                </Link>
            </div>
        </Page>
    );
}
