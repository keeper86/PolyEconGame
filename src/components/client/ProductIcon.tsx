import { getAssetPath } from '@/lib/assetManifest';
import { getProductForm } from '@/simulation/planet/resourceCatalog';
import Image from 'next/image';
import { useMemo } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

export function ProductIcon({
    productName,
    size = 42,
    label,
}: {
    productName: string;
    size?: number;

    label?: string;
}) {
    const src = getAssetPath(productName);
    const form = getProductForm(productName);

    const formIcon = useMemo(() => {
        switch (form) {
            case 'gas':
                return getAssetPath('form_gas');
            case 'liquid':
                return getAssetPath('form_liquid');
            case 'solid':
                return getAssetPath('form_solid');
            case 'pieces':
                return getAssetPath('form_pieces');
            default:
                return null;
        }
    }, [form]);

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
            <TooltipContent>
                <span className='flex items-center gap-1'>
                    {label ?? productName}{' '}
                    {formIcon && <Image src={formIcon} alt={form ?? ''} width={16} height={16} />}
                </span>
            </TooltipContent>
        </Tooltip>
    );
}
