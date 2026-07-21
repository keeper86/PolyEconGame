'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatNumberWithUnit } from '@/lib/utils';
import { Sigma } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import React from 'react';
import type { BuyDiagnostics, SellDiagnostics } from '@/simulation/planet/planet';

type Step = {
    label: string;
    formula: string;
    value: string | number;
    isResult?: boolean;
};

function sellSteps(d: SellDiagnostics): Step[] {
    const fmt = (n: number) => n.toFixed(4);
    const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
    const fmtCurr = (n: number) => formatNumberWithUnit(n, 'currency', '');
    return [
        {
            label: 'Sell-through rate',
            formula: 'sold / effectiveQuantity',
            value: `${d.sellThroughRate.toFixed(4)} (= ${fmtPct(d.sellThroughRate)})`,
        },
        {
            label: 'Target sell-through (config)',
            formula: '(from setup)',
            value: fmtPct(d.targetSellThrough),
        },
        {
            label: 'Base factor',
            formula: d.sellThroughRate >= d.targetSellThrough ? '1 + t × (maxUp - 1)' : 'maxDown + t × (1 - maxDown)',
            value: fmt(d.baseFactor),
        },
        {
            label: 'Cost spring deviation',
            formula: '√(max(0, brakeZoneTop / price - 1))',
            value: fmt(d.costSpringDeviation),
        },
        {
            label: 'Over-deviation',
            formula: '√(max(0, price / overPriceGuard - 1))',
            value: fmt(d.overDeviation),
        },
        {
            label: 'Net factor',
            formula: 'base + strength × deviation - strength × overDeviation',
            value: fmt(d.netFactor),
        },
        {
            label: 'Old price',
            formula: '(from last tick)',
            value: fmtCurr(d.oldPrice),
        },
        {
            label: 'New price',
            formula: 'oldPrice × netFactor (clamped to ±PRICE_CEIL / PRICE_FLOOR)',
            value: fmtCurr(d.newPrice),
            isResult: true,
        },
        {
            label: 'Cost floor',
            formula: '(planet production cost floor)',
            value: fmtCurr(d.costFloor),
        },
        {
            label: 'Market price',
            formula: '(planet clearing price)',
            value: fmtCurr(d.marketPrice),
        },
        {
            label: 'Effective quantity',
            formula: 'max(0, inventory - retainment) + free quantity smoothing',
            value: d.effectiveQuantity.toFixed(2),
        },
    ];
}

function buySteps(d: BuyDiagnostics): Step[] {
    const fmt = (n: number) => n.toFixed(4);
    const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
    const fmtCurr = (n: number) => formatNumberWithUnit(n, 'currency', '');
    return [
        {
            label: 'Fill rate',
            formula: 'lastBought / lastDemanded',
            value: `${d.fillRate.toFixed(4)} (= ${fmtPct(d.fillRate)})`,
        },
        {
            label: 'Target fill rate (config)',
            formula: '(from setup)',
            value: fmtPct(d.targetFillRate),
        },
        {
            label: 'Base factor',
            formula: d.fillRate >= d.targetFillRate ? '1 + t × (maxDown - 1)' : 'maxUp + t × (1 - maxUp)',
            value: fmt(d.baseFactor),
        },
        {
            label: 'Ceiling price',
            formula: 'costFloor × bidOfferMaxCostMultiplier (clamped)',
            value: fmtCurr(d.ceilingPrice),
        },
        {
            label: 'Ceiling spring',
            formula: 'strength × √(max(0, bidPrice / ceiling - 1))',
            value: fmt(d.ceilingSpring),
        },
        {
            label: 'Net factor',
            formula: 'baseFactor - ceilingSpring',
            value: fmt(d.netFactor),
        },
        {
            label: 'Old bid price',
            formula: '(from last tick)',
            value: fmtCurr(d.oldBidPrice),
        },
        {
            label: 'New bid price',
            formula: 'oldBidPrice × netFactor (clamped to PRICE_FLOOR..PRICE_CEIL)',
            value: fmtCurr(d.newBidPrice),
            isResult: true,
        },
        {
            label: 'Cost floor',
            formula: '(planet production cost floor)',
            value: fmtCurr(d.costFloor),
        },
        {
            label: 'Market price',
            formula: '(planet clearing price)',
            value: fmtCurr(d.marketPrice),
        },
        {
            label: 'Shortfall',
            formula: 'max(0, storageTarget - currentInventory)',
            value: d.shortfall.toFixed(2),
        },
        {
            label: 'Storage target',
            formula: 'consumptionRate × inputBufferTargetTicks',
            value: d.storageTarget.toFixed(2),
        },
    ];
}

function StepRow({ step, index }: { step: Step; index: number }) {
    return (
        <div
            className={`rounded-md px-3 py-2 text-sm ${step.isResult ? 'bg-primary/10 border border-primary/20 -mx-1' : index % 2 === 0 ? 'bg-muted/30' : ''}`}
        >
            <div className='flex items-center justify-between gap-2'>
                <span className='font-medium text-foreground'>{step.label}</span>
                <span
                    className={`tabular-nums ${step.isResult ? 'text-base font-bold text-primary' : 'text-muted-foreground'}`}
                >
                    {step.value}
                </span>
            </div>
            {step.formula && (
                <div className='text-[10px] text-muted-foreground/60 font-mono mt-0.5'>{step.formula}</div>
            )}
        </div>
    );
}

export function PriceAlgorithmDialog({
    mode,
    diagnostics,
}: {
    mode: 'buy' | 'sell';
    diagnostics?: BuyDiagnostics | SellDiagnostics;
}): React.ReactElement {
    const [open, setOpen] = React.useState(false);

    const steps = React.useMemo(() => {
        if (!diagnostics) {
            return null;
        }
        if (mode === 'sell') {
            return sellSteps(diagnostics as SellDiagnostics);
        }
        return buySteps(diagnostics as BuyDiagnostics);
    }, [mode, diagnostics]);

    const title = mode === 'sell' ? 'Sell Price Algorithm' : 'Buy Price Algorithm';

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Button variant='outline' size='sm' className='h-7 text-[11px] px-2' onClick={() => setOpen(true)}>
                <Sigma className='h-3.5 w-3.5 mr-1' />
            </Button>
            <DialogContent className='max-w-md max-h-[80vh] overflow-y-auto'>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        Step-by-step breakdown of how the automatic pricing algorithm computed the new price.
                    </DialogDescription>
                </DialogHeader>
                <Separator />
                {steps ? (
                    <div className='space-y-2'>
                        {steps.map((step, i) => (
                            <StepRow key={i} step={step} index={i} />
                        ))}
                    </div>
                ) : (
                    <p className='text-sm text-muted-foreground py-4 text-center'>
                        No diagnostics available yet. The algorithm runs once per tick — data will appear after the next
                        simulation step.
                    </p>
                )}
            </DialogContent>
        </Dialog>
    );
}
