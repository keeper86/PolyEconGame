import Image from 'next/image';
import { getAssetPath } from '@/lib/assetManifest';

export function FacilityIcon({
    facilityName,
    size = 280,
    variant,
}: {
    facilityName: string;
    size?: number;
    variant?: 'constructed';
}) {
    let src: string;
    if (variant === 'constructed') {
        src = getAssetPath(facilityName + '_constructed');
    } else {
        src = getAssetPath(facilityName);
    }

    return (
        <span
            className='rounded overflow-hidden shrink-0 inline-block relative'
            style={{ width: size, height: (size * 2) / 3 }}
        >
            <Image src={src} alt={facilityName} fill className='object-contain' />
        </span>
    );
}
