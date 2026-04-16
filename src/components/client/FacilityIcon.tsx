import Image from 'next/image';
import { getAssetPath } from '@/lib/assetManifest';

export function FacilityIcon({
    facilityName,
    size = 280,
    suffix,
}: {
    facilityName: string;
    size?: number;
    suffix?: string;
}) {
    let src: string;
    if (suffix !== '') {
        src = getAssetPath(facilityName + '_' + suffix);
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

export const defaultHeight = Math.ceil((280 * 2) / 3);
