'use client';

import { useParams, useRouter } from 'next/navigation';
import ResourceMarketGrid from './ResourceMarketGrid';

export default function PlanetMarketIndexPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';
    const router = useRouter();

    const handleSelect = (resourceName: string) => {
        const slug = resourceName.toLowerCase().replace(/\s+/g, '-');
        router.push(`/planets/${encodeURIComponent(planetId)}/market/${encodeURIComponent(slug)}` as never);
    };

    return <ResourceMarketGrid planetId={planetId} onSelect={handleSelect} />;
}
