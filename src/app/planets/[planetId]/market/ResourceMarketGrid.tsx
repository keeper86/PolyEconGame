'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { productImage } from '@/lib/mapResource';
import { agriculturalProductResourceType } from '@/simulation/planet/resources';
import { RESOURCE_LEVELS, RESOURCE_LEVEL_LABELS, resourcesByLevel } from '@/simulation/planet/resourceCatalog';
import type { ResourceProcessLevel } from '@/simulation/planet/planet';

type Props = {
    planetId: string;
    onSelect: (resourceName: string) => void;
};

export default function ResourceMarketGrid({ planetId: _planetId, onSelect }: Props): React.ReactElement {
    const [activeLevel, setActiveLevel] = useState<ResourceProcessLevel>('raw');

    const resources = resourcesByLevel[activeLevel];

    return (
        <div className='space-y-4'>
            <nav className='flex gap-1 flex-wrap border-b border-border pb-0'>
                {RESOURCE_LEVELS.map((level) => (
                    <button
                        key={level}
                        onClick={() => setActiveLevel(level)}
                        className={cn(
                            'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                            activeLevel === level
                                ? 'border-primary text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                        )}
                    >
                        {RESOURCE_LEVEL_LABELS[level]}
                    </button>
                ))}
            </nav>

            <div className='grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3'>
                {resources.map((resource) => {
                    const isFood = resource.name === agriculturalProductResourceType.name;
                    return (
                        <button
                            key={resource.name}
                            onClick={() => onSelect(resource.name)}
                            className={cn(
                                'group flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors',
                                'hover:border-primary hover:bg-accent',
                                isFood ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
                            )}
                        >
                            <div className='h-16 w-16 flex-shrink-0 flex items-center justify-center'>
                                <Image
                                    src={productImage(resource.name)}
                                    alt={resource.name}
                                    width={64}
                                    height={64}
                                    className='object-contain'
                                    onError={(e) => {
                                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                                    }}
                                />
                            </div>
                            <span className='text-xs leading-tight text-foreground'>{resource.name}</span>
                            {!isFood && <span className='text-[10px] text-muted-foreground italic'>soon</span>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
