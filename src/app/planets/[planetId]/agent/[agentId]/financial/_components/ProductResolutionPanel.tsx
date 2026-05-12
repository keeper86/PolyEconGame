'use client';

import { resourceNameToSlug } from '@/app/planets/[planetId]/agent/[agentId]/market/_components/marketHelpers';
import { ProductIcon } from '@/components/client/ProductIcon';
import { formatNumberWithUnit } from '@/lib/utils';
import type { MonthAccumulator } from '@/simulation/planet/planet';
import Link from 'next/link';

type Props = {
    monthAcc: MonthAccumulator;
    lastMonthAcc: MonthAccumulator;
    tick: number;
    planetId: string;
    agentId: string;
};

function ProductCell({
    currentValue,
    lastValue,
    resourceName,
    planetId,
    agentId,
}: {
    currentValue: number;
    lastValue: number;
    resourceName: string;
    planetId: string;
    agentId: string;
}): React.ReactElement {
    const href = `/planets/${planetId}/agent/${agentId}/market#${resourceNameToSlug(resourceName)}`;
    return (
        <Link
            href={href as never}
            className='inline-flex items-center gap-1.5 rounded bg-muted px-2 py-1 hover:ring-2 hover:ring-primary/50 transition-all w-[100px]'
        >
            <ProductIcon productName={resourceName} size={36} />
            <span className='flex flex-col flex-grow text-xs font-medium text-right'>
                {formatNumberWithUnit(currentValue, 'currency', planetId)}
                <span className='text-muted-foreground'>{formatNumberWithUnit(lastValue, 'currency', planetId)}</span>
            </span>
        </Link>
    );
}

function ProductList({
    entries,
    planetId,
    agentId,
}: {
    entries: [string, { quantity: number; value: number }, { quantity: number; value: number }][];
    tick: number;
    planetId: string;
    agentId: string;
}): React.ReactElement {
    if (entries.length === 0) {
        return <span className='text-xs text-muted-foreground'>None</span>;
    }
    return (
        <div className='flex flex-wrap gap-1.5'>
            {entries.map(([name, currentEntry, lastEntry]) => (
                <ProductCell
                    key={name}
                    currentValue={currentEntry.value}
                    lastValue={lastEntry.value}
                    resourceName={name}
                    planetId={planetId}
                    agentId={agentId}
                />
            ))}
        </div>
    );
}

export default function ProductResolutionPanel({
    monthAcc,
    lastMonthAcc,
    tick,
    planetId,
    agentId,
}: Props): React.ReactElement {
    // Merge all product names from both current and last month accumulators
    const allNames = new Set<string>();
    for (const acc of [monthAcc, lastMonthAcc]) {
        for (const name of Object.keys(acc.boughtResources)) {
            if (acc.boughtResources[name]?.value !== 0) {
                allNames.add(name);
            }
        }
        for (const name of Object.keys(acc.soldResources)) {
            if (acc.soldResources[name]?.value !== 0) {
                allNames.add(name);
            }
        }
        for (const name of Object.keys(acc.depreciatedServices)) {
            if (acc.depreciatedServices[name]?.value !== 0) {
                allNames.add(name);
            }
        }
    }

    if (allNames.size === 0) {
        return <div className='text-xs text-muted-foreground'>No product resolution data available.</div>;
    }

    const sortedNames = Array.from(allNames).sort();

    // Build entries: [name, currentEntry, lastEntry] for each KPI
    const boughtEntries: [string, { quantity: number; value: number }, { quantity: number; value: number }][] = [];
    const soldEntries: [string, { quantity: number; value: number }, { quantity: number; value: number }][] = [];
    const depreciatedEntries: [string, { quantity: number; value: number }, { quantity: number; value: number }][] = [];

    for (const name of sortedNames) {
        const currentBought = monthAcc.boughtResources[name] ?? { quantity: 0, value: 0 };
        const lastBought = lastMonthAcc.boughtResources[name] ?? { quantity: 0, value: 0 };
        if (currentBought.value !== 0 || lastBought.value !== 0) {
            boughtEntries.push([name, currentBought, lastBought]);
        }
        boughtEntries.sort((a, b) => b[1].value - a[1].value); // Sort by current month value desc

        const currentSold = monthAcc.soldResources[name] ?? { quantity: 0, value: 0 };
        const lastSold = lastMonthAcc.soldResources[name] ?? { quantity: 0, value: 0 };
        if (currentSold.value !== 0 || lastSold.value !== 0) {
            soldEntries.push([name, currentSold, lastSold]);
        }
        soldEntries.sort((a, b) => b[1].value - a[1].value); // Sort by current month value desc

        const currentDepr = monthAcc.depreciatedServices[name] ?? { quantity: 0, value: 0 };
        const lastDepr = lastMonthAcc.depreciatedServices[name] ?? { quantity: 0, value: 0 };
        if (currentDepr.value !== 0 || lastDepr.value !== 0) {
            depreciatedEntries.push([name, currentDepr, lastDepr]);
        }
        depreciatedEntries.sort((a, b) => b[1].value - a[1].value); // Sort by current month value desc
    }

    return (
        <div className='space-y-3'>
            <div className='flex flex-wrap gap-4'>
                <div className='min-w-[200px] flex-1 basis-[250px] space-y-1.5'>
                    <p className='text-xs font-medium text-muted-foreground'>Purchases: current month (last month)</p>
                    <ProductList entries={boughtEntries} tick={tick} planetId={planetId} agentId={agentId} />
                </div>
                <div className='min-w-[200px] flex-1 basis-[250px] space-y-1.5'>
                    <p className='text-xs font-medium text-muted-foreground'>Revenue: current month (last month)</p>
                    <ProductList entries={soldEntries} tick={tick} planetId={planetId} agentId={agentId} />
                </div>
                {depreciatedEntries.length > 0 && (
                    <div className='min-w-[200px] flex-1 basis-[250px] space-y-1.5'>
                        <p className='text-xs font-medium text-muted-foreground'>
                            Depreciation: current month (last month)
                        </p>
                        <ProductList entries={depreciatedEntries} tick={tick} planetId={planetId} agentId={agentId} />
                    </div>
                )}
            </div>
        </div>
    );
}
