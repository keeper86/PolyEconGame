'use client';

import { useTour } from '@/components/tour/TourContext';
import { usePendingActions } from '@/hooks/useActionOverlay';
import type { FacilityCatalogEntry } from '@/simulation/planet/productionFacilities';
import React from 'react';
import { BuildCard, type Mode } from './BuildCard';
import { BuildPlaceholderCard } from './BuildPlaceholderCard';

export type { Mode } from './BuildCard';

const PLACEHOLDER_PLANET = 'catalog';
const PLACEHOLDER_ID = 'preview';

export function LevelBuildSection({
    entries,
    agentId,
    planetId,
    constructionServicePrice,
    otherConstructionCosts,
    onBuilt,
    mode,
    onModeChange,
}: {
    entries: FacilityCatalogEntry[];
    agentId: string;
    planetId: string;
    constructionServicePrice: number;
    otherConstructionCosts?: number;
    onBuilt: () => void;
    mode: Mode;
    onModeChange: (mode: Mode) => void;
}): React.ReactElement {
    const { isTourActive, markActionCompleted } = useTour();
    const pendingActions = usePendingActions(agentId, planetId);

    const pendingBuildKeys = React.useMemo(() => {
        const keys = new Set<string>();
        for (const a of pendingActions) {
            if (a.type === 'build' && a.facilityKey) {
                keys.add(a.facilityKey);
            }
        }
        return keys;
    }, [pendingActions]);

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
                            otherConstructionCosts={otherConstructionCosts}
                            onBuilt={() => {}}
                            onCancel={() => {}}
                            isPending={true}
                        />
                    );
                })}
                {otherEntries.length > 0 && (
                    <BuildPlaceholderCard label='Build more' onClick={() => onModeChange({ type: 'selecting' })} />
                )}
            </>
        );
    }

    if (mode.type === 'idle') {
        return (
            <BuildPlaceholderCard
                label='Build facility'
                dataTour='production-build'
                onClick={() => {
                    if (isTourActive) {
                        markActionCompleted('click-plus-build');
                    }
                    onModeChange({ type: 'selecting' });
                }}
            />
        );
    }

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
                        otherConstructionCosts={otherConstructionCosts}
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
