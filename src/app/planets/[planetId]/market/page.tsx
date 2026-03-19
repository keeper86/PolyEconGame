'use client';

import { useParams, useRouter } from 'next/navigation';
import ResourceMarketGrid from './ResourceMarketGrid';
import { agriculturalProductResourceType } from '@/simulation/planet/resources';

export default function PlanetMarketIndexPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';
    const router = useRouter();

    const handleSelect = (resourceName: string) => {
        const slug = resourceName.toLowerCase().replace(/\s+/g, '-');
        router.push(`/planets/${encodeURIComponent(planetId)}/market/${encodeURIComponent(slug)}` as never);
    };

    return (
        <div className='space-y-4'>
            <div>
                <h4 className='text-sm font-semibold mb-1'>Select a market</h4>
                <p className='text-xs text-muted-foreground mb-3'>
                    Choose a resource to view its market data. Currently live:{' '}
                    <span className='font-medium text-foreground'>{agriculturalProductResourceType.name}</span>.
                </p>
            </div>
            <ResourceMarketGrid planetId={planetId} onSelect={handleSelect} />
        </div>
    );
}
