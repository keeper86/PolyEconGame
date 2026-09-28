'use client';

import { getAssetPath } from '@/lib/assetManifest';
import { getProductForm } from '@/simulation/planet/resourceCatalog';
import { termFor } from '@/i18n/terms';
import { useLocale } from 'next-intl';
import Image from 'next/image';
import { useMemo } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

export function ProductIcon({
    productName,
    size = 42,
    label,
    className,
}: {
    productName: string;
    size?: number;
    label?: string;
    className?: string;
}) {
    const locale = useLocale();
    const src = getAssetPath(productName);
    const form = getProductForm(productName);
    const displayName = label ?? termFor(locale, productName);

    const formIcon = useMemo(() => {
        switch (form) {
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
                    className={
                        'rounded overflow-hidden shrink-0 inline-block relative' + (className ? ` ${className}` : '')
                    }
                    style={{ width: size, height: size }}
                >
                    <Image src={src} alt={displayName} fill sizes={`${size}px`} className='object-contain' />
                </span>
            </TooltipTrigger>
            <TooltipContent>
                <span className='flex items-center gap-1'>
                    {displayName} {formIcon && <Image src={formIcon} alt={form ?? ''} width={16} height={16} />}
                </span>
            </TooltipContent>
        </Tooltip>
    );
}
