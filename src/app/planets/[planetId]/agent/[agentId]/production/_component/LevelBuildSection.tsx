'use client';

import { Card, CardContent } from '@/components/ui/card';
import { PlusCircle } from 'lucide-react';
import React from 'react';
import { BuildCard, type Mode } from './BuildCard';
import type { FacilityCatalogEntry } from '@/simulation/planet/productionFacilities';

export type { Mode } from './BuildCard';

const PLACEHOLDER_PLANET = 'catalog';
const PLACEHOLDER_ID = 'preview';

export function LevelBuildSection({
    entries,
    agentId,
    planetId,
    constructionServicePrice,
    onBuilt,
    mode,
    onModeChange,
}: {
    entries: FacilityCatalogEntry[];
    agentId: string;
    planetId: string;
    constructionServicePrice: number;
    onBuilt: () => void;
    mode: Mode;
    onModeChange: (mode: Mode) => void;
}): React.ReactElement {
    if (mode.type === 'idle') {
        return (
            <Card
                className='min-w-[300px] flex items-center justify-center cursor-pointer border-dashed text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors'
                style={{ minHeight: '160px' }}
                onClick={() => onModeChange({ type: 'selecting' })}
            >
                <CardContent className='flex flex-col items-center gap-2 p-6'>
                    <PlusCircle className='h-8 w-8' />
                    <span className='text-xs font-medium'>Build facility</span>
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            {entries.map((entry) => {
                const factory = entry.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID);
                return (
                    <BuildCard
                        key={factory.name}
                        entry={factory}
                        agentId={agentId}
                        planetId={planetId}
                        constructionServicePrice={constructionServicePrice}
                        onBuilt={() => {
                            onModeChange({ type: 'idle' });
                            onBuilt();
                        }}
                        onCancel={() => onModeChange({ type: 'idle' })}
                    />
                );
            })}
        </>
    );
}
