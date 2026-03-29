import Image from 'next/image';
import { getAssetPath } from '@/lib/assetManifest';

export function ProductIcon({ productName, size = 24 }: { productName: string; size?: number }) {
    const src = getAssetPath(productName);

    return (
        <span
            className='rounded overflow-hidden shrink-0 inline-block relative'
            style={{ width: size, height: size }}
        >
            <Image
                src={src}
                alt={productName}
                fill
                className='object-contain'
            />
        </span>
    );
}
