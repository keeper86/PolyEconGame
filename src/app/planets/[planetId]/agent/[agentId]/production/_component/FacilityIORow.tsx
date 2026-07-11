'use client';

import { ProductQuantity } from '@/components/client/ProductQuantity';
import { useAgentId } from '@/hooks/useAgentId';
import { usePlanetId } from '@/hooks/usePlanetId';
import type { ResourceQuantity } from '@/simulation/planet/claims';
import React from 'react';

import { RiArrowRightBoxFill } from 'react-icons/ri';

export function FacilityIORow({
    needs,
    produces,
    scale = 1,
}: {
    needs: ResourceQuantity[];
    produces: ResourceQuantity[];
    scale?: number;
}): React.ReactElement {
    const planetId = usePlanetId();
    const { agentId } = useAgentId();

    const needsCount = needs.length || 1;
    const producesCount = produces.length || 1;
    const gridTemplateColumns = `${needsCount}fr 2rem ${producesCount}fr`;

    return (
        <div className='grid w-full items-center gap-x-2 py-2' style={{ gridTemplateColumns }}>
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
                        neutral={true}
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
                        neutral={true}
                    />
                ))}
            </div>
        </div>
    );
}

export function FacilityProductionIORow({
    needs,
    produces,
    scale,
    resourceEfficiency,
    overallEfficiency,
    limitingEfficiency,
}: {
    needs: ResourceQuantity[];
    produces: ResourceQuantity[];
    scale: number;
    resourceEfficiency: Record<string, number>;
    overallEfficiency: number;
    limitingEfficiency: number;
}): React.ReactElement {
    const planetId = usePlanetId();
    const { agentId } = useAgentId();

    const needsCount = needs.length || 1;
    const producesCount = produces.length || 1;
    const gridTemplateColumns = `${needsCount}fr 2rem ${producesCount}fr`;

    return (
        <div className='grid w-full items-center gap-x-2 py-2' style={{ gridTemplateColumns }}>
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
                className={`shrink-0 h-8 w-8 ${needs.length > 0 || produces.length > 0 ? 'text-muted-foreground' : 'invisible'}`}
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
