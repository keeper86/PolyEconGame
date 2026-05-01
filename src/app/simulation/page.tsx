import { Page } from '@/components/client/Page';
import { APP_ROUTES } from '@/lib/appRoutes';
import Link from 'next/link';
import { EnvironmentWorkforceSection } from './sections/EnvironmentWorkforceSection';
import { FinancialTransfersSection } from './sections/FinancialTransfersSection';
import { InterPlanetSection } from './sections/InterPlanetSection';
import { OverviewSection } from './sections/OverviewSection';
import { PricingMarketSection } from './sections/PricingMarketSection';
import { ProductionPostSection } from './sections/ProductionPostSection';
import { TickOrderSection } from './sections/TickOrderSection';

const TOC = [
    { id: 'overview', label: '0. Overview & Time Units' },
    { id: 'services', label: '0b. Services Product Tier' },
    { id: 'environment', label: '1. Environment Tick' },
    { id: 'workforce-demographic', label: '2. Workforce Demographic Tick' },
    { id: 'population', label: '3. Population Tick' },
    { id: 'workforce-hire', label: '4. Hire / Fire (monthly)' },
    { id: 'financial-pre', label: '5. Pre-Production Financial Tick' },
    { id: 'transfers', label: '6. Intergenerational Transfers' },
    { id: 'pricing', label: '7. Agent Pricing (Tâtonnement)' },
    { id: 'buying', label: '7b. Agent Input Buying' },
    { id: 'market', label: '8. Market Clearing' },
    { id: 'construction', label: '8b. Construction Tick' },
    { id: 'production', label: '9. Production Tick' },
    { id: 'financial-post', label: '10. Post-Production Financial Tick' },
    { id: 'labor-month', label: '11. Labor Market Month Tick' },
    { id: 'population-year', label: '12. Population Year Tick' },
    { id: 'labor-year', label: '13. Workforce Year Tick' },
    { id: 'interplanet', label: '14. Inter-Planet Tick (Forex & Shipping)' },
    { id: 'tick-order', label: '15. Tick Ordering Summary' },
] as const;

export default function SimulationPage() {
    return (
        <Page title='Simulation Model'>
            <div className='prose max-w-none'>
                <p className='text-muted-foreground'>
                    This page describes the discrete-time socio-economic simulation that drives PolyEconGame. The model
                    is organised into several subsystems, each updated on its own cadence. The fundamental time unit is
                    the <strong>tick</strong>: 30 ticks constitute one in-game month, and 360 ticks (12 months)
                    constitute one in-game year.
                </p>

                <hr className='my-6' />

                {/* Table of Contents */}
                <nav className='mb-8 rounded-md border p-4'>
                    <h2 className='text-lg font-semibold mb-2'>Contents</h2>
                    <ul className='columns-2 gap-x-8 list-none pl-0 text-sm space-y-1'>
                        {TOC.map(({ id, label }) => (
                            <li key={id}>
                                <a href={`#${id}`} className='hover:underline'>
                                    {label}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>

                <OverviewSection />
                <EnvironmentWorkforceSection />
                <FinancialTransfersSection />
                <PricingMarketSection />
                <ProductionPostSection />
                <InterPlanetSection />
                <TickOrderSection />

                <hr className='my-8' />
            </div>

            <div className='mt-4'>
                <Link href={APP_ROUTES.root.path} className='btn btn-outline'>
                    Back to Home
                </Link>
            </div>
        </Page>
    );
}
