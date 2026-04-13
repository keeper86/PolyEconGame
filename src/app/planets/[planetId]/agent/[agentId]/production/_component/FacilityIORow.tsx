'use client';

import React from 'react';
import { RiArrowRightBoxFill } from 'react-icons/ri';
import type { ResourceEntry } from './ProductQuantity';
import { ProductQuantity } from './ProductQuantity';
import { useAgentId } from '@/hooks/useAgentId';
import { usePlanetId } from '@/hooks/usePlanetId';

export function FacilityIORow({
    needs,
    produces,
    scale = 1,
}: {
    needs: ResourceEntry[];
    produces: ResourceEntry[];
    scale?: number;
}): React.ReactElement {
    const planetId = usePlanetId();
    const { agentId } = useAgentId();
    return (
        <div className='grid w-full items-center gap-x-2 py-2' style={{ gridTemplateColumns: '1fr auto 1fr' }}>
            <div className='flex flex-wrap gap-1.5 justify-center'>
                {needs.map(({ resource, quantity }) => (
                    <ProductQuantity
                        key={resource.name}
                        resource={resource}
                        quantity={quantity * scale}
                        efficiency={1}
                        isLimiting={false}
                        planetId={planetId}
                        agentId={agentId}
                    />
                ))}
            </div>

            <RiArrowRightBoxFill
                className={`shrink-0 h-8 w-8 ${needs.length > 0 && produces.length > 0 ? 'text-muted-foreground' : 'invisible'}`}
            />

            <div className='flex flex-wrap gap-1.5 justify-center'>
                {produces.map(({ resource, quantity }) => (
                    <ProductQuantity
                        key={resource.name}
                        resource={resource}
                        quantity={quantity * scale}
                        efficiency={1}
                        isLimiting={false}
                        planetId={planetId}
                        agentId={agentId}
                    />
                ))}
            </div>
        </div>
    );
}
