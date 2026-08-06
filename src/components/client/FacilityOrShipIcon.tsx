import { getAssetPath } from '@/lib/assetManifest';
import { formatNumberWithUnit } from '@/lib/utils';
import Image from 'next/image';
import type { JSX } from 'react';

export function FacilityOrShipIcon({
    facilityOrShipName,
    size = 280,
    suffix = '',
    buildProgress,
    badge,
}: {
    facilityOrShipName: string;
    size?: number;
    suffix?: string;
    buildProgress?: number;
    badge?: number | string | JSX.Element;
}) {
    let src: string;
    if (suffix && suffix !== '') {
        src = getAssetPath(facilityOrShipName + '_' + suffix);
    } else {
        src = getAssetPath(facilityOrShipName);
    }

    const width = size;
    const height = (size * 2) / 3;
    const fontSize = `${size * 0.095}px`;

    let badgeContent;
    if (typeof badge === 'number') {
        badgeContent = formatNumberWithUnit(badge, 'none');
    } else if (typeof badge === 'string') {
        badgeContent = badge;
    } else if (badge) {
        badgeContent = badge;
    }

    const badgeOverlay =
        badge !== undefined ? (
            <div
                className='absolute top-0 right-0 pr-0.5 flex items-center justify-end text-xs text-foreground text-right rounded bg-foreground/10 text-outline-strong'
                style={{
                    width: '57%',
                    height: '25%',
                    fontSize,
                    lineHeight: 1,
                }}
            >
                <span className='z-10'>{badgeContent}</span>
            </div>
        ) : null;

    if (buildProgress !== undefined) {
        const fillPct = Math.min(1, Math.max(0, buildProgress)) * 100;
        return (
            <span className='rounded overflow-hidden shrink-0 inline-block relative' style={{ width, height }}>
                {badgeOverlay}
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
            {badgeOverlay}
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
