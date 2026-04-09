'use client';

import { ProductIcon } from '@/components/client/ProductIcon';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Leaf } from 'lucide-react';

export function ClaimCardHeader({ resourceName, renewable }: { resourceName: string; renewable: boolean }) {
    return (
        <CardHeader className='pb-2'>
            <CardTitle className='flex items-center gap-2 text-sm font-semibold'>
                <ProductIcon productName={resourceName} />
                {resourceName}
                {renewable && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Leaf className='h-4 w-4 text-green-500' />
                        </TooltipTrigger>
                        <TooltipContent>{'Renewable'}</TooltipContent>
                    </Tooltip>
                )}
            </CardTitle>
        </CardHeader>
    );
}
