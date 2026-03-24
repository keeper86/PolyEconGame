'use client';

import { useParams, useRouter } from 'next/navigation';
import ResourceMarketGrid from './ResourceMarketGrid';
import MarketOverviewTable from './MarketOverviewTable';

export default function PlanetMarketIndexPage() {
    const params = useParams();
    const planetId = params?.planetId;
    const router = useRouter();

    if (!planetId || typeof planetId !== 'string') {
        return <div className='text-sm text-muted-foreground'>Invalid planet ID</div>;
    }

    const handleSelect = (resourceName: string) => {
        const slug = resourceName.toLowerCase().replace(/\s+/g, '-');
        router.push(`/planets/${encodeURIComponent(planetId)}/market/${encodeURIComponent(slug)}` as never);
    };

    return (
        <div className='space-y-8'>
            <section>
                <h3 className='text-base font-semibold mb-3'>Market Overview</h3>
                <MarketOverviewTable planetId={planetId} onSelect={handleSelect} />
            </section>

            <section>
                <h3 className='text-base font-semibold mb-3'>Browse by Product</h3>
                <ResourceMarketGrid planetId={planetId} onSelect={handleSelect} />
            </section>
        </div>
    );
}
