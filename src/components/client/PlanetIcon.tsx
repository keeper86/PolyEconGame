import { AC_ID } from '@/simulation/utils/initialWorld';
import { Globe } from 'lucide-react';
import Image from 'next/image';

const PLANET_ICONS: Record<string, string> = {
    earth: '/images/planets/earth.webp',
    gune: '/images/planets/gune.webp',
    icedonia: '/images/planets/icedonia.webp',
    pandara: '/images/planets/pandara.webp',
    paradies: '/images/planets/paradies.webp',
    suerte: '/images/planets/suerte.webp',
    [AC_ID]: '/images/planets/centauri.webp',
};

export function PlanetIcon({ planetId, size = 24 }: { planetId: string; size?: number }) {
    const src = PLANET_ICONS[planetId];
    if (!src) {
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
