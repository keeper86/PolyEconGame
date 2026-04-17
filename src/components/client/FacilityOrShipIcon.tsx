import Image from 'next/image';
import { getAssetPath } from '@/lib/assetManifest';

export function FacilityOrShipIcon({
    facilityOrShipName,
    size = 280,
    suffix,
}: {
    facilityOrShipName: string;
    size?: number;
    suffix?: string;
}) {
    let src: string;
    if (suffix && suffix !== '') {
        src = getAssetPath(facilityOrShipName + '_' + suffix);
    } else {
        src = getAssetPath(facilityOrShipName);
    }

    return (
        <span
            className='rounded overflow-hidden shrink-0 inline-block relative'
            style={{ width: size, height: (size * 2) / 3 }}
        >
            <Image src={src} alt={facilityOrShipName} fill className='object-contain' />
        </span>
    );
}

export const defaultHeight = Math.ceil((280 * 2) / 3);
