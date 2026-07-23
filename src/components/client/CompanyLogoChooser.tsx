'use client';

import { assetManifest, getAssetPath } from '@/lib/assetManifest';
import Image from 'next/image';
import { useMemo } from 'react';

const COMPANY_LOGO_KEYS = (Object.keys(assetManifest) as (keyof typeof assetManifest)[]).filter((k) =>
    k.startsWith('company_icon_'),
);

export function CompanyLogoChooser({
    selectedLogo,
    onSelect,
}: {
    selectedLogo: string;
    onSelect: (key: string) => void;
}) {
    const logoKeys = useMemo(() => COMPANY_LOGO_KEYS, []);
    console.log(logoKeys);

    return (
        <div className='grid gap-2'>
            <label className='text-sm font-medium'>Company Logo</label>
            <div className='grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2 max-h-48 overflow-y-auto p-2 border rounded-md'>
                {logoKeys.map((key) => {
                    const isSelected = selectedLogo === key;
                    const src = getAssetPath(key);
                    return (
                        <button
                            key={key}
                            type='button'
                            onClick={() => onSelect(key)}
                            className={`relative w-full aspect-square rounded-md border overflow-hidden transition-all ${
                                isSelected
                                    ? 'ring-2 ring-primary border-primary'
                                    : 'border-border hover:border-muted-foreground/50'
                            }`}
                        >
                            <Image
                                src={src}
                                alt=''
                                width={64}
                                height={64}
                                className='object-contain w-full h-full'
                                unoptimized
                            />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
