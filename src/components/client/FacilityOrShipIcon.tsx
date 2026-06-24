import Image from 'next/image';
import { getAssetPath } from '@/lib/assetManifest';

export function FacilityOrShipIcon({
    facilityOrShipName,
    size = 280,
    suffix = '',
    buildProgress,
}: {
    facilityOrShipName: string;
    size?: number;
    suffix?: string;
    buildProgress?: number;
}) {
    let src: string;
    if (suffix && suffix !== '') {
        src = getAssetPath(facilityOrShipName + '_' + suffix);
    } else {
        src = getAssetPath(facilityOrShipName);
    }

    const width = size;
    const height = (size * 2) / 3;

    if (buildProgress !== undefined) {
        const fillPct = Math.min(1, Math.max(0, buildProgress)) * 100;
        return (
            <span className='rounded overflow-hidden shrink-0 inline-block relative' style={{ width, height }}>
                <Image
                    src={src}
                    alt={facilityOrShipName}
                    fill
                    className='object-contain opacity-25'
                    sizes={`(max-width: ${width}px) 100vw, ${width}px`}
                />
                <span
                    className='absolute inset-0 overflow-hidden'
                    style={{ clipPath: `inset(${100 - fillPct}% 0 0 0)` }}
                >
                    <Image
                        src={src}
                        alt=''
                        fill
                        className='object-contain'
                        sizes={`(max-width: ${width}px) 100vw, ${width}px`}
                    />
                </span>
            </span>
        );
    }

    return (
        <span
            className='rounded overflow-hidden shrink-0 inline-block relative'
            style={{ width: size, height: (size * 2) / 3 }}
        >
            <Image
                src={src}
                alt={facilityOrShipName}
                fill
                className='object-contain'
                sizes={`(max-width: ${size}px) 100vw, ${size}px`}
            />
        </span>
    );
}

export const defaultHeight = Math.ceil((280 * 2) / 3);
