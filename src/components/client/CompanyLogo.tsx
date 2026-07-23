import Image from 'next/image';
import { getAssetPath } from '@/lib/assetManifest';

export function CompanyLogo({ logoKey, size = 32, className }: { logoKey: string; size?: number; className?: string }) {
    const src = getAssetPath(logoKey);

    return (
        <Image
            src={src}
            alt=''
            width={size}
            height={size}
            className={`object-contain hover:scale-110 ${className ?? ''}`}
            unoptimized
        />
    );
}
