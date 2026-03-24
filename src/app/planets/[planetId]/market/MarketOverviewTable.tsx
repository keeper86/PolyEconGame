'use client';

import React from 'react';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { productImage } from '@/lib/mapResource';
import { formatNumbers } from '@/lib/utils';
import { RESOURCE_LEVEL_LABELS } from '@/simulation/planet/resourceCatalog';
import type { MarketOverviewRow } from '@/server/controller/planet';
import Image from 'next/image';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Card, CardHeader } from '@/components/ui/card';

type Props = {
    planetId: string;
    onSelect: (resourceName: string) => void;
};

const OVERSUPPLY_RATIO_THRESHOLD = 2;

type MarketStatus = 'balanced' | 'mostly' | 'partial-shortage' | 'shortage' | 'oversupply' | 'no-demand';

function classifyMarket(row: MarketOverviewRow): MarketStatus {
    const { totalSupply, totalDemand, fillRatio } = row;

    if (totalDemand === 0 && totalSupply > 0) {
        return 'no-demand';
    }
    if (totalDemand > 0 && totalSupply / totalDemand >= OVERSUPPLY_RATIO_THRESHOLD) {
        return 'oversupply';
    }
    if (fillRatio >= 0.999) {
        return 'balanced';
    }
    if (fillRatio >= 0.8) {
        return 'mostly';
    }
    if (fillRatio >= 0.5) {
        return 'partial-shortage';
    }
    return 'shortage';
}

const STATUS_CONFIG: Record<MarketStatus, { label: string; className: string }> = {
    'balanced': {
        label: 'Full',
        className: 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30',
    },
    'mostly': {
        label: 'Mostly',
        className: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
    },
    'partial-shortage': {
        label: 'Partial',
        className: 'bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30',
    },
    'shortage': {
        label: 'Shortage',
        className: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30',
    },
    'oversupply': {
        label: 'Oversupply',
        className: 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30',
    },
    'no-demand': {
        label: 'No demand',
        className: 'bg-slate-500/20 text-slate-500 dark:text-slate-400 border-slate-500/30',
    },
};

function groupRowsByLevel(rows: MarketOverviewRow[]): Map<string, MarketOverviewRow[]> {
    const groups = new Map<string, MarketOverviewRow[]>();
    for (const row of rows) {
        const existing = groups.get(row.level) ?? [];
        existing.push(row);
        groups.set(row.level, existing);
    }
    return groups;
}

const LEVEL_ORDER = ['raw', 'refined', 'manufactured', 'consumerGood'];

export default function MarketOverviewTable({ planetId, onSelect }: Props): React.ReactElement {
    const trpc = useTRPC();
    const { data, isLoading } = useSimulationQuery(trpc.simulation.getPlanetMarketOverview.queryOptions({ planetId }));

    if (isLoading) {
        return <div className='text-sm text-muted-foreground'>Loading market overview…</div>;
    }

    const rows = data?.rows ?? [];

    if (rows.length === 0) {
        return <div className='text-sm text-muted-foreground'>No market activity yet.</div>;
    }

    const groups = groupRowsByLevel(rows);
    const orderedLevels = LEVEL_ORDER.filter((l) => groups.has(l));

    return (
        <div className='space-y-6'>
            {orderedLevels.map((level) => {
                const levelRows = groups.get(level)!;
                const label = RESOURCE_LEVEL_LABELS[level as keyof typeof RESOURCE_LEVEL_LABELS] ?? level;

                return (
                    <Card key={level} className='border'>
                        <CardHeader className='bg-transparent border-b'>{label}</CardHeader>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className='w-40 min-w-32'>Resource</TableHead>
                                    <TableHead className='text-right'>Price</TableHead>
                                    <TableHead className='text-right hidden sm:table-cell'>Production</TableHead>
                                    <TableHead className='text-right hidden md:table-cell'>Supply</TableHead>
                                    <TableHead className='text-right hidden md:table-cell'>Demand</TableHead>
                                    <TableHead className='text-right'>Sold</TableHead>
                                    <TableHead className='text-right hidden sm:table-cell'>Fill</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {levelRows.map((row) => (
                                    <TableRow
                                        key={row.resourceName}
                                        className='cursor-pointer hover:bg-accent'
                                        onClick={() => onSelect(row.resourceName)}
                                    >
                                        <TableCell className='font-medium'>
                                            <div className='flex items-center gap-2'>
                                                <Image
                                                    src={productImage(row.resourceName)}
                                                    alt={row.resourceName}
                                                    width={28}
                                                    height={28}
                                                    className='object-contain flex-shrink-0'
                                                    onError={(e) => {
                                                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                                <span className='text-xs leading-tight'>{row.resourceName}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className='text-right tabular-nums'>
                                            {formatNumbers(row.clearingPrice)}
                                        </TableCell>
                                        <TableCell className='text-right tabular-nums hidden sm:table-cell'>
                                            {formatNumbers(row.totalProduction)}
                                        </TableCell>
                                        <TableCell className='text-right tabular-nums hidden md:table-cell'>
                                            {formatNumbers(row.totalSupply)}
                                        </TableCell>
                                        <TableCell className='text-right tabular-nums hidden md:table-cell'>
                                            {formatNumbers(row.totalDemand)}
                                        </TableCell>
                                        <TableCell className='text-right tabular-nums'>
                                            {formatNumbers(row.totalSold)}
                                        </TableCell>
                                        <TableCell className='text-right hidden sm:table-cell'>
                                            {(() => {
                                                const status = classifyMarket(row);
                                                const { label, className } = STATUS_CONFIG[status];
                                                return (
                                                    <Badge variant='outline' className={cn('text-xs', className)}>
                                                        {label}
                                                    </Badge>
                                                );
                                            })()}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Card>
                );
            })}
        </div>
    );
}
