'use client';

import { useParams, useRouter } from 'next/navigation';
import ResourceMarketGrid from './ResourceMarketGrid';

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

    return <ResourceMarketGrid planetId={planetId} onSelect={handleSelect} />;
}
