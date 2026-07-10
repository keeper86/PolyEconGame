'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { usePendingActions } from '@/hooks/useActionOverlay';
import { PlusCircle, SendHorizonal } from 'lucide-react';
import React from 'react';
import { BuildCard, type Mode } from './BuildCard';
import type { FacilityCatalogEntry } from '@/simulation/planet/productionFacilities';

export type { Mode } from './BuildCard';

const PLACEHOLDER_PLANET = 'catalog';
const PLACEHOLDER_ID = 'preview';

/**
 * LevelBuildSection renders either:
 * 1. (idle mode, no pending builds): clickable "+" card to enter selecting mode
 * 2. (selecting mode): BuildCards for all unbuilt catalog entries
 * 3. (idle mode, pending builds exist): BuildCards for entries with pending builds showing "Awaiting tick…"
 */
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
    const pendingActions = usePendingActions(agentId, planetId);

    // Find which catalog keys (facility names) have pending build actions
    const pendingBuildKeys = React.useMemo(() => {
        const keys = new Set<string>();
        for (const a of pendingActions) {
            if (a.type === 'build' && a.facilityKey) {
                keys.add(a.facilityKey);
            }
        }
        return keys;
    }, [pendingActions]);

    // Separate entries into those with pending builds and those without
    const { pendingEntries, otherEntries } = React.useMemo(() => {
        const pending: FacilityCatalogEntry[] = [];
        const other: FacilityCatalogEntry[] = [];
        for (const entry of entries) {
            const name = entry.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID).name;
            if (pendingBuildKeys.has(name)) {
                pending.push(entry);
            } else {
                other.push(entry);
            }
        }
        return { pendingEntries: pending, otherEntries: other };
    }, [entries, pendingBuildKeys]);

    // When idle but there are pending builds, show those cards in "awaiting tick" state
    if (mode.type === 'idle' && pendingEntries.length > 0) {
        return (
            <>
                {pendingEntries.map((entry) => {
                    const factory = entry.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID);
                    return (
                        <BuildCard
                            key={factory.name}
                            entry={factory}
                            agentId={agentId}
                            planetId={planetId}
                            constructionServicePrice={constructionServicePrice}
                            onBuilt={() => {}}
                            onCancel={() => {}}
                            isPending={true}
                        />
                    );
                })}
                {/* Show "+" card for remaining entries */}
                {otherEntries.length > 0 && (
                    <Card
                        className='min-w-[300px] flex items-center justify-center cursor-pointer border-dashed text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors'
                        style={{ minHeight: '160px' }}
                        onClick={() => onModeChange({ type: 'selecting' })}
                    >
                        <CardContent className='flex flex-col items-center gap-2 p-6'>
                            <PlusCircle className='h-8 w-8' />
                            <span className='text-xs font-medium'>Build more</span>
                        </CardContent>
                    </Card>
                )}
            </>
        );
    }

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

    // Selecting mode: show all entries, with pending ones marked
    return (
        <>
            {entries.map((entry) => {
                const factory = entry.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID);
                const isPending = pendingBuildKeys.has(factory.name);
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
                        isPending={isPending}
                    />
                );
            })}
        </>
    );
}