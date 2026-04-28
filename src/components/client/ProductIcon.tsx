import Image from 'next/image';
import { getAssetPath } from '@/lib/assetManifest';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';

export function ProductIcon({
    productName,
    size = 42,
    label,
}: {
    productName: string;
    size?: number;
    /** Optional display label for the tooltip. Defaults to `productName`. */
    label?: string;
}) {
    const src = getAssetPath(productName);

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    className='rounded overflow-hidden shrink-0 inline-block relative'
                    style={{ width: size, height: size }}
                >
                    <Image src={src} alt={label ?? productName} fill sizes={`${size}px`} className='object-contain' />
                </span>
            </TooltipTrigger>
            <TooltipContent>{label ?? productName}</TooltipContent>
        </Tooltip>
    );
}
