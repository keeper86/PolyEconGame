import Image from 'next/image';
import { getAssetPath } from '@/lib/assetManifest';

export function FacilityIcon({ facilityName, size = 164 }: { facilityName: string; size?: number }) {
    const src = getAssetPath(facilityName);

    return (
        <span className='rounded overflow-hidden shrink-0 inline-block relative' style={{ width: size, height: size }}>
            <Image src={src} alt={facilityName} fill className='object-contain' />
        </span>
    );
}
