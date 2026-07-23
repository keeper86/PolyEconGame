'use client';

import type { TickResult, SellDiagnostics, BuyDiagnostics } from './pricingSimulator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PricingDetailPanelProps {
    tickResult: TickResult;
}

export default function PricingDetailPanel({ tickResult }: PricingDetailPanelProps) {
    const d = tickResult.diagnostics;
    const isSell = 'sellThroughRate' in d;
    const sellDiag = d as SellDiagnostics;
    const buyDiag = d as BuyDiagnostics;

    const oldPrice = isSell ? sellDiag.oldPrice : buyDiag.oldBidPrice;
    const newPrice = isSell ? sellDiag.newPrice : buyDiag.newBidPrice;
    const pctChange = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 0;

    return (
        <Card className='border-primary/30'>
            <CardHeader className='pb-2 pt-3 px-4'>
                <CardTitle className='text-sm font-semibold flex items-center gap-2'>
                    Tick {tickResult.tick} — Detailed Breakdown
                    <Badge variant='outline' className='text-[10px]'>
                        {isSell ? 'Sell-Side' : 'Buy-Side'}
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className='px-4 pb-3 space-y-4 text-sm'>
                <div className='flex items-center gap-4 flex-wrap'>
                    <div>
                        <span className='text-muted-foreground text-xs'>Old Price</span>
                        <div className='font-mono text-base'>{fmt(oldPrice)}</div>
                    </div>
                    <div className='text-muted-foreground text-lg'>→</div>
                    <div>
                        <span className='text-muted-foreground text-xs'>New Price</span>
                        <div className='font-mono text-base'>{fmt(newPrice)}</div>
                    </div>
                    <div
                        className={`font-mono text-sm font-semibold ${pctChange >= 0 ? 'text-green-600' : 'text-red-600'}`}
                    >
                        {pctChange >= 0 ? '+' : ''}
                        {pctChange.toFixed(2)}%
                    </div>
                </div>

                <div className='grid grid-cols-2 gap-3'>
                    <div className='space-y-1.5'>
                        <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
                            Demand Feedback
                        </p>
                        <FactorRow
                            label={isSell ? 'Sell-Through Rate' : 'Fill Rate'}
                            value={isSell ? sellDiag.sellThroughRate : buyDiag.fillRate}
                            target={isSell ? sellDiag.targetSellThrough : buyDiag.targetFillRate}
                            fmtFn={pct}
                            goodDir='up'
                        />
                        <FactorRow
                            label='Base Factor'
                            value={d.baseFactor}
                            target={1}
                            fmtFn={(v) => v.toFixed(4)}
                            goodDir='neutral'
                        />
                    </div>
                    <div className='space-y-1.5'>
                        <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
                            Cost Spring / Ceiling
                        </p>
                        {isSell ? (
                            <>
                                <FactorRow
                                    label='Cost Floor'
                                    value={sellDiag.costFloor}
                                    fmtFn={fmt}
                                    goodDir='neutral'
                                />
                                <FactorRow
                                    label='Cost Spring Deviation'
                                    value={sellDiag.costSpringDeviation}
                                    fmtFn={(v) => v.toFixed(4)}
                                    goodDir='neutral'
                                />
                                <div className='flex justify-between text-xs'>
                                    <span className='text-muted-foreground'>Brake Zone Top</span>
                                    <span className='font-mono'>{fmt(sellDiag.costFloor * 1.5)}</span>
                                </div>
                            </>
                        ) : (
                            <>
                                <FactorRow
                                    label='Ceiling Price'
                                    value={buyDiag.ceilingPrice}
                                    fmtFn={fmt}
                                    goodDir='neutral'
                                />
                                <FactorRow
                                    label='Ceiling Spring'
                                    value={buyDiag.ceilingSpring}
                                    fmtFn={(v) => v.toFixed(4)}
                                    goodDir='neutral'
                                />
                                <div className='flex justify-between text-xs'>
                                    <span className='text-muted-foreground'>Shortfall</span>
                                    <span className='font-mono'>{fmt(buyDiag.shortfall)}</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className='border-t pt-2 flex items-center gap-3'>
                    <span className='text-xs font-medium text-muted-foreground'>Net Factor</span>
                    <span
                        className={`font-mono text-base font-bold ${d.netFactor > 1 ? 'text-green-600' : d.netFactor < 1 ? 'text-red-600' : ''}`}
                    >
                        {d.netFactor.toFixed(4)}
                        <span className='text-xs ml-1'>({((d.netFactor - 1) * 100).toFixed(2)}%)</span>
                    </span>
                    <span className='text-xs text-muted-foreground'>Price = Old Price × Net Factor</span>
                </div>

                <div className='grid grid-cols-3 gap-2 text-xs'>
                    <div className='bg-muted/50 rounded p-2'>
                        <span className='text-muted-foreground block'>Market Price</span>
                        <span className='font-mono'>{fmt(d.marketPrice)}</span>
                    </div>
                    <div className='bg-muted/50 rounded p-2'>
                        <span className='text-muted-foreground block'>Cost Floor</span>
                        <span className='font-mono'>{fmt(d.costFloor)}</span>
                    </div>
                    <div className='bg-muted/50 rounded p-2'>
                        <span className='text-muted-foreground block'>Inventory</span>
                        <span className='font-mono'>{fmt(tickResult.inventory)}</span>
                    </div>
                </div>

                {isSell && sellDiag.surplusRatio !== undefined && (
                    <div className='text-xs text-muted-foreground border-t pt-2'>
                        <span className='font-medium'>Inventory smoothing:</span> Surplus ratio ={' '}
                        {sellDiag.surplusRatio.toFixed(2)} — effective offer quantity ={' '}
                        {fmt(sellDiag.effectiveQuantity)}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function fmt(n: number): string {
    if (Math.abs(n) >= 1_000_000) {
        return `${(n / 1_000_000).toFixed(2)}M`;
    }
    if (Math.abs(n) >= 1_000) {
        return `${(n / 1_000).toFixed(2)}k`;
    }
    return n.toFixed(4);
}

function pct(n: number): string {
    return `${(n * 100).toFixed(1)}%`;
}

function FactorRow({
    label,
    value,
    target,
    fmtFn = (v: number) => String(v),
    goodDir,
}: {
    label: string;
    value: number;
    target?: number;
    fmtFn: (v: number) => string;
    goodDir: 'up' | 'down' | 'neutral';
}) {
    const isGood =
        goodDir === 'neutral'
            ? true
            : target !== undefined
              ? goodDir === 'up'
                  ? value >= target
                  : value <= target
              : true;

    return (
        <div className='flex justify-between text-xs'>
            <span className='text-muted-foreground'>{label}</span>
            <span className={`font-mono ${isGood ? '' : 'text-amber-600'}`}>
                {fmtFn(value)}
                {target !== undefined && <span className='text-muted-foreground ml-1'>(target: {fmtFn(target)})</span>}
            </span>
        </div>
    );
}
