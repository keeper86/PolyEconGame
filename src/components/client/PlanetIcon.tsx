import { AC_ID } from '@/simulation/utils/initialWorld';
import { Globe } from 'lucide-react';
import Image from 'next/image';
import { getAssetPath } from '@/lib/assetManifest';

export function PlanetIcon({ planetId, size = 24 }: { planetId: string; size?: number }) {
    const src = getAssetPath(planetId);

    // Special handling for AC_ID (Alpha Centauri)
    if (planetId === AC_ID) {
        return (
            <span
                className='rounded-full overflow-hidden shrink-0 inline-block relative'
                style={{ width: size, height: size }}
            >
                <Image src='/images/planets/centauri.webp' alt={planetId} fill className='object-cover' />
            </span>
        );
    }

    // Check if we got the question mark (asset not found)
    if (src === '/images/products/question_mark.webp') {
        return <Globe width={size} height={size} />;
    }

    return (
        <span
            className='rounded-full overflow-hidden shrink-0 inline-block relative'
            style={{ width: size, height: size }}
        >
            <Image src={src} alt={planetId} fill className='object-cover' />
        </span>
    );
}
