'use client';

import React from 'react';
import Link from 'next/link';
import { ProductIcon } from '@/components/client/ProductIcon';
import { formatNumbers } from '@/lib/utils';
import { useAgentId } from '@/hooks/useAgentId';
import { usePlanetId } from '@/hooks/usePlanetId';
import { resourceNameToSlug } from '../../market/_components/marketHelpers';
import { RiArrowRightBoxFill } from 'react-icons/ri';

type ResourceEntry = { resource: { name: string }; quantity: number };

function fillColor(efficiency: number, isLimiting: boolean): string {
    if (isLimiting) {
        return 'bg-red-500/30';
    }
    if (efficiency < 0.95) {
        return 'bg-amber-400/30';
    }
    return 'bg-green-500/30';
}

function ProductQuantity({
    resource,
    quantity,
    efficiency,
    isLimiting,
    planetId,
    agentId,
}: ResourceEntry & {
    efficiency: number;
    isLimiting: boolean;
    planetId: string | null;
    agentId: string | null;
}): React.ReactElement {
    const href =
        planetId && agentId
            ? `/planets/${planetId}/agent/${agentId}/market#${resourceNameToSlug(resource.name)}`
            : null;
    return (
        <Link
            href={(href ?? '#') as never}
            className='relative inline-flex flex-col items-center gap-1.5 rounded bg-muted px-2 py-1 overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all'
        >
            <span
                className={`absolute bottom-0 left-0 right-0 ${fillColor(efficiency, isLimiting)} transition-all`}
                style={{ height: `${Math.round(efficiency * 100)}%` }}
            />
            <span className='relative z-10 inline-flex flex-col items-center gap-1.5 text-xs text-outline-strong'>
                <ProductIcon productName={resource.name} />
                {formatNumbers(quantity)}
            </span>
        </Link>
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
                    const eff = resourceEfficiency[resource.name] ?? 1;
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
