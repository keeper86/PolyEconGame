'use client';

import React from 'react';
import { ProductIcon } from '@/components/client/ProductIcon';
import { formatNumbers } from '@/lib/utils';
import { RiArrowRightBoxFill } from 'react-icons/ri';

type ResourceEntry = { resource: { name: string }; quantity: number };

function ProductQuantity({ resource, quantity }: ResourceEntry): React.ReactElement {
    return (
        <span className='inline-flex flex-col items-center gap-1.5 rounded bg-muted px-2 py-1'>
            <ProductIcon productName={resource.name} />
            {formatNumbers(quantity)}
        </span>
    );
}

export function FacilityIORow({
    needs,
    produces,
    scale = 1,
}: {
    needs: ResourceEntry[];
    produces: ResourceEntry[];
    scale?: number;
}): React.ReactElement {
    return (
        <div className='grid w-full items-center gap-x-2 py-2' style={{ gridTemplateColumns: '1fr auto 1fr' }}>
            <div className='flex flex-wrap gap-1.5 justify-center'>
                {needs.map(({ resource, quantity }) => (
                    <ProductQuantity key={resource.name} resource={resource} quantity={quantity * scale} />
                ))}
            </div>

            <RiArrowRightBoxFill
                className={`shrink-0 h-8 w-8 ${needs.length > 0 && produces.length > 0 ? 'text-muted-foreground' : 'invisible'}`}
            />

            <div className='flex flex-wrap gap-1.5 justify-center'>
                {produces.map(({ resource, quantity }) => (
                    <ProductQuantity key={resource.name} resource={resource} quantity={quantity * scale} />
                ))}
            </div>
        </div>
    );
}
