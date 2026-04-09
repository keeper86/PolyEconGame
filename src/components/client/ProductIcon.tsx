import Image from 'next/image';
import { getAssetPath } from '@/lib/assetManifest';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';

export function ProductIcon({ productName, size = 42 }: { productName: string; size?: number }) {
    const src = getAssetPath(productName);

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    className='rounded overflow-hidden shrink-0 inline-block relative'
                    style={{ width: size, height: size }}
                >
                    <Image src={src} alt={productName} fill sizes={`${size}px`} className='object-contain' />
                </span>
            </TooltipTrigger>
            <TooltipContent>{productName}</TooltipContent>
        </Tooltip>
    );
}
