import Image from 'next/image';
import { getAssetPath } from '@/lib/assetManifest';

export function CompanyLogo({ logoKey, size = 32, className }: { logoKey: string; size?: number; className?: string }) {
    const src = getAssetPath(logoKey);

    return (
        <span
            className={`rounded overflow-hidden shrink-0 inline-block relative ${className ?? ''}`}
            style={{ width: size, height: size }}
        >
            <Image src={src} alt='' fill sizes={`${size}px`} className='object-contain' unoptimized />
        </span>
    );
}
