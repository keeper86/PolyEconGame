'use client';

import { useAgentId } from '@/hooks/useAgentId';
import { usePlanetId } from '@/hooks/usePlanetId';
import React from 'react';
import { RiArrowRightBoxFill } from 'react-icons/ri';
import type { ResourceEntry } from './ProductQuantity';
import { ProductQuantity } from './ProductQuantity';

export function FacilityProductionIORow({
    needs,
    produces,
    scale,
    resourceEfficiency,
    overallEfficiency,
    limitingEfficiency,
}: {
    needs: ResourceEntry[];
    produces: ResourceEntry[];
    scale: number;
    resourceEfficiency: Record<string, number>;
    overallEfficiency: number;
    limitingEfficiency: number;
}): React.ReactElement {
    const planetId = usePlanetId();
    const { agentId } = useAgentId();
    return (
        <div className='grid w-full items-center gap-x-2 py-2' style={{ gridTemplateColumns: '1fr auto 1fr' }}>
            <div className='flex flex-wrap gap-1.5 justify-center'>
                {needs.map(({ resource, quantity }) => {
                    const eff = resourceEfficiency[resource.name] ?? 0;
                    return (
                        <ProductQuantity
                            key={resource.name}
                            resource={resource}
                            quantity={quantity * scale * overallEfficiency}
                            efficiency={eff}
                            isLimiting={eff <= limitingEfficiency && limitingEfficiency < 0.99}
                            planetId={planetId}
                            agentId={agentId}
                        />
                    );
                })}
            </div>

            <RiArrowRightBoxFill
                className={`shrink-0 h-8 w-8 ${needs.length > 0 && produces.length > 0 ? 'text-muted-foreground' : 'invisible'}`}
            />

            <div className='flex flex-wrap gap-1.5 justify-center'>
                {produces.map(({ resource, quantity }) => (
                    <ProductQuantity
                        key={resource.name}
                        resource={resource}
                        quantity={quantity * scale * overallEfficiency}
                        efficiency={overallEfficiency}
                        isLimiting={overallEfficiency <= limitingEfficiency && limitingEfficiency < 0.99}
                        planetId={planetId}
                        agentId={agentId}
                    />
                ))}
            </div>
        </div>
    );
}
