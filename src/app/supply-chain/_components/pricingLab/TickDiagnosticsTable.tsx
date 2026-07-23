'use client';

import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TickResult, SellDiagnostics, BuyDiagnostics } from './pricingSimulator';

interface TickDiagnosticsTableProps {
    results: TickResult[];
    selectedTick: number | null;
    onSelectTick: (tick: number) => void;
}

type ColumnDef = {
    key: string;
    label: string;
    align: 'text-right' | 'text-left';
};

export default function TickDiagnosticsTable({ results, selectedTick, onSelectTick }: TickDiagnosticsTableProps) {
    const isSell = results.length > 0 && 'sellThroughRate' in results[0].diagnostics;

    const columns = useMemo((): ColumnDef[] => {
        const base: ColumnDef[] = [
            { key: 'tick', label: 'Tick', align: 'text-right' },
            { key: 'price', label: 'Price', align: 'text-right' },
            { key: 'inventory', label: 'Inventory', align: 'text-right' },
            { key: 'soldOrBought', label: isSell ? 'Sold' : 'Bought', align: 'text-right' },
        ];

        if (isSell) {
            base.push(
                { key: 'sellThroughRate', label: 'Sell-Through', align: 'text-right' },
                { key: 'targetSellThrough', label: 'Target ST', align: 'text-right' },
                { key: 'baseFactor', label: 'Base Factor', align: 'text-right' },
                { key: 'costSpringDeviation', label: 'Cost Spring', align: 'text-right' },
                { key: 'netFactor', label: 'Net Factor', align: 'text-right' },
                { key: 'effectiveQuantity', label: 'Eff. Qty', align: 'text-right' },
            );
        } else {
            base.push(
                { key: 'fillRate', label: 'Fill Rate', align: 'text-right' },
                { key: 'targetFillRate', label: 'Target FR', align: 'text-right' },
                { key: 'baseFactor', label: 'Base Factor', align: 'text-right' },
                { key: 'ceilingSpring', label: 'Ceiling Spring', align: 'text-right' },
                { key: 'netFactor', label: 'Net Factor', align: 'text-right' },
                { key: 'shortfall', label: 'Shortfall', align: 'text-right' },
            );
        }
        return base;
    }, [isSell]);

    function fmt(n: number): string {
        if (Math.abs(n) >= 1_000_000) {
            return `${(n / 1_000_000).toFixed(1)}M`;
        }
        if (Math.abs(n) >= 1_000) {
            return `${(n / 1_000).toFixed(1)}k`;
        }
        return n.toFixed(2);
    }

    if (results.length === 0) {
        return <div className='text-sm text-muted-foreground py-8 text-center'>No simulation results yet.</div>;
    }

    return (
        <div className='border rounded-lg overflow-auto max-h-96'>
            <Table>
                <TableHeader>
                    <TableRow>
                        {columns.map((col) => (
                            <TableHead key={col.key} className={col.align === 'text-right' ? 'text-right' : ''}>
                                {col.label}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {results.map((r) => {
                        const d = r.diagnostics as SellDiagnostics & BuyDiagnostics;
                        const cells = columns.map((col) => {
                            let value: string | number = '';
                            switch (col.key) {
                                case 'tick':
                                    value = r.tick;
                                    break;
                                case 'price':
                                    value = isSell ? d.newPrice : d.newBidPrice;
                                    break;
                                case 'inventory':
                                    value = r.inventory;
                                    break;
                                case 'soldOrBought':
                                    value = r.soldOrBought;
                                    break;
                                case 'sellThroughRate':
                                    value = d.sellThroughRate;
                                    break;
                                case 'fillRate':
                                    value = d.fillRate;
                                    break;
                                case 'targetSellThrough':
                                    value = d.targetSellThrough;
                                    break;
                                case 'targetFillRate':
                                    value = d.targetFillRate;
                                    break;
                                case 'baseFactor':
                                    value = d.baseFactor;
                                    break;
                                case 'costSpringDeviation':
                                    value = d.costSpringDeviation;
                                    break;
                                case 'ceilingSpring':
                                    value = d.ceilingSpring;
                                    break;
                                case 'netFactor':
                                    value = d.netFactor;
                                    break;
                                case 'effectiveQuantity':
                                    value = d.effectiveQuantity;
                                    break;
                                case 'shortfall':
                                    value = d.shortfall;
                                    break;
                            }
                            return { key: col.key, value, align: col.align };
                        });

                        const isSelected = selectedTick === r.tick;
                        return (
                            <TableRow
                                key={r.tick}
                                className={`cursor-pointer ${isSelected ? 'bg-muted/80 font-medium' : ''}`}
                                onClick={() => onSelectTick(r.tick)}
                            >
                                {cells.map((c) => (
                                    <TableCell key={c.key} className={`font-mono text-xs ${c.align}`}>
                                        {typeof c.value === 'number' ? fmt(c.value) : c.value}
                                    </TableCell>
                                ))}
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
