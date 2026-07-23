'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatNumberWithUnit } from '@/lib/utils';
import { ArrowDownRight, ArrowRight, Equal, Plus, Sigma, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

import { TrendingDown, TrendingUp, ShieldAlert, Anchor, Activity, Info } from 'lucide-react';

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
            label: 'Net factor',
            formula: 'base + strength × deviation',
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

interface PricingDiagnosticsProps {
    type: 'sell' | 'buy';
    diagnostics: SellDiagnostics | BuyDiagnostics;
}

export function PricingPopup({ type, diagnostics }: PricingDiagnosticsProps) {
    const isSell = type === 'sell';

    // Safely cast based on type for rendering
    const sellDiag = isSell ? (diagnostics as SellDiagnostics) : null;
    const buyDiag = !isSell ? (diagnostics as BuyDiagnostics) : null;

    // Shared variables mapped from either buy or sell diagnostics
    const oldPrice = isSell ? sellDiag!.oldPrice : buyDiag!.oldBidPrice;
    const newPrice = isSell ? sellDiag!.newPrice : buyDiag!.newBidPrice;
    const currentRate = isSell ? sellDiag!.sellThroughRate : buyDiag!.fillRate;
    const targetRate = isSell ? sellDiag!.targetSellThrough : buyDiag!.targetFillRate;
    const netFactor = diagnostics.netFactor;

    const isPriceUp = netFactor > 1;
    const priceChangeText = isPriceUp ? 'Increasing' : netFactor < 1 ? 'Decreasing' : 'Stable';

    // Spring logic
    const isFloorSpringActive = isSell && sellDiag!.costSpringDeviation > 0;
    const isCeilingSpringActive = isSell ? sellDiag!.overDeviation > 0 : buyDiag!.ceilingSpring > 0;

    return (
        <div className='w-full max-w-md bg-slate-900 text-slate-100 rounded-lg shadow-2xl border border-slate-700 overflow-hidden font-sans'>
            {/* Header */}
            <div className='p-4 border-b border-slate-800 bg-slate-800/50 flex justify-between items-center'>
                <div>
                    <h2 className='text-lg font-bold text-slate-100 capitalize'>
                        <span className='text-slate-400 text-sm font-normal'>({isSell ? 'Offer' : 'Bid'})</span>
                    </h2>
                    <div className='flex items-center gap-2 mt-1'>
                        <span className='text-2xl font-mono text-emerald-400'>${newPrice.toFixed(2)}</span>
                        <span className='text-sm text-slate-400 line-through'>${oldPrice.toFixed(2)}</span>
                    </div>
                </div>

                {/* Trend Indicator */}
                <div
                    className={`flex flex-col items-end ${isPriceUp ? 'text-emerald-400' : netFactor < 1 ? 'text-rose-400' : 'text-slate-400'}`}
                >
                    {isPriceUp ? <TrendingUp size={28} /> : <TrendingDown size={28} />}
                    <span className='text-xs font-bold uppercase tracking-wider mt-1'>{priceChangeText}</span>
                </div>
            </div>

            <div className='p-5 space-y-6'>
                {/* Pillar 1: Velocity vs Target */}
                <div className='space-y-2'>
                    <div className='flex justify-between items-center text-sm'>
                        <div className='flex items-center gap-2'>
                            <Activity size={16} className='text-blue-400' />
                            <span className='text-slate-300 font-medium'>
                                {isSell ? 'Sell-Through Rate' : 'Fill Rate'}
                            </span>
                        </div>
                        <span className='font-mono'>{Math.round(currentRate * 100)}%</span>
                    </div>

                    {/* Progress Bar Container */}
                    <div className='relative w-full h-3 bg-slate-800 rounded-full overflow-hidden'>
                        {/* Target Marker */}
                        <div
                            className='absolute top-0 bottom-0 w-1 bg-yellow-400 z-10'
                            style={{ left: `${Math.min(targetRate * 100, 100)}%` }}
                        />
                        {/* Current Fill */}
                        <div
                            className={`h-full transition-all duration-500 ${
                                currentRate >= targetRate ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                            style={{ width: `${Math.min(currentRate * 100, 100)}%` }}
                        />
                    </div>

                    <div className='flex justify-between text-xs text-slate-500 font-mono'>
                        <span>0%</span>
                        <span>Target: {Math.round(targetRate * 100)}%</span>
                    </div>
                </div>

                {/* Pillar 2: Safety Springs (Brake Zones) */}
                <div className='space-y-3 p-3 bg-slate-800/50 rounded border border-slate-700/50'>
                    <div className='flex items-center gap-2 text-sm font-medium text-slate-300'>
                        <ShieldAlert size={16} className='text-amber-400' />
                        Safety Constraints
                    </div>

                    <div className='grid grid-cols-2 gap-4'>
                        {/* Floor Spring */}
                        <div
                            className={`p-2 rounded flex flex-col gap-1 text-xs border ${isFloorSpringActive ? 'bg-amber-900/20 border-amber-500/50 text-amber-200' : 'border-transparent text-slate-500'}`}
                        >
                            <span className='uppercase font-bold tracking-wider'>Cost Floor</span>
                            <span className='font-mono'>${diagnostics.costFloor.toFixed(2)}</span>
                            {isFloorSpringActive && (
                                <span className='text-[10px] bg-amber-500/20 px-1 py-0.5 rounded mt-1 text-center'>
                                    Brake Active
                                </span>
                            )}
                        </div>

                        {/* Ceiling Spring */}
                        <div
                            className={`p-2 rounded flex flex-col gap-1 text-xs border ${isCeilingSpringActive ? 'bg-amber-900/20 border-amber-500/50 text-amber-200' : 'border-transparent text-slate-500'}`}
                        >
                            <span className='uppercase font-bold tracking-wider'>Price Ceiling</span>
                            <span className='font-mono'>
                                {isSell ? 'Max Margin Limit' : `$${buyDiag?.ceilingPrice?.toFixed(2) || 'N/A'}`}
                            </span>
                            {isCeilingSpringActive && (
                                <span className='text-[10px] bg-amber-500/20 px-1 py-0.5 rounded mt-1 text-center'>
                                    Brake Active
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Pillar 3: Inventory Smoothing / Context Data */}
                <div className='space-y-2 text-sm'>
                    <div className='flex items-center gap-2 text-slate-300 font-medium'>
                        <Anchor size={16} className='text-purple-400' />
                        Inventory & Smoothing
                    </div>

                    <div className='bg-slate-800 rounded p-3 text-xs space-y-2 text-slate-400 font-mono'>
                        {isSell ? (
                            <>
                                <div className='flex justify-between'>
                                    <span>Effective Quantity:</span>
                                    <span className='text-slate-200'>
                                        {sellDiag?.effectiveQuantity.toFixed(0)} units
                                    </span>
                                </div>
                                <div className='flex justify-between'>
                                    <span>Raw Retainment:</span>
                                    <span className='text-slate-200'>{sellDiag?.rawRetainment.toFixed(0)} units</span>
                                </div>
                                {sellDiag?.surplusRatio !== undefined && (
                                    <div className='flex justify-between text-purple-400 pt-1 border-t border-slate-700 mt-1'>
                                        <span>Surplus Smoothing Active:</span>
                                        <span>{(sellDiag.surplusRatio * 100).toFixed(1)}%</span>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className='flex justify-between'>
                                    <span>Current Shortfall:</span>
                                    <span className='text-slate-200'>{buyDiag?.shortfall.toFixed(0)} units</span>
                                </div>
                                <div className='flex justify-between'>
                                    <span>Storage Target:</span>
                                    <span className='text-slate-200'>{buyDiag?.storageTarget.toFixed(0)} units</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer / Info Tooltip */}
            <div className='bg-slate-950 p-3 text-xs text-slate-500 flex items-start gap-2'>
                <Info size={14} className='mt-0.5 shrink-0' />
                <p>
                    Prices automatically adjust to maintain target {isSell ? 'sales velocity' : 'inventory fill rates'}{' '}
                    without violating cost floors or maximum margins.
                </p>
            </div>
        </div>
    );
}

interface PricingMathPipelineProps {
    type: 'sell' | 'buy';
    resourceName: string;
    diagnostics: SellDiagnostics | BuyDiagnostics;
}

export function PricingMathPipeline({ type, resourceName, diagnostics }: PricingMathPipelineProps) {
    const isSell = type === 'sell';
    const sellDiag = isSell ? (diagnostics as SellDiagnostics) : null;
    const buyDiag = !isSell ? (diagnostics as BuyDiagnostics) : null;

    // Shared pipeline variables
    const oldPrice = isSell ? sellDiag!.oldPrice : buyDiag!.oldBidPrice;
    const newPrice = isSell ? sellDiag!.newPrice : buyDiag!.newBidPrice;
    const currentRate = isSell ? sellDiag!.sellThroughRate : buyDiag!.fillRate;
    const targetRate = isSell ? sellDiag!.targetSellThrough : buyDiag!.targetFillRate;

    const baseFactor = diagnostics.baseFactor;
    const netFactor = diagnostics.netFactor;

    // Calculate total spring effect (Net Factor = Base Factor + Springs)
    const springAdjustment = netFactor - baseFactor;
    const hasSpring = Math.abs(springAdjustment) > 0.0001;

    // Formatting helpers
    const formatMultiplier = (val: number) => `x${val.toFixed(4)}`;
    const formatAdjustment = (val: number) => `${val > 0 ? '+' : ''}${val.toFixed(4)}`;

    return (
        <div className='w-full max-w-lg bg-slate-950 text-slate-300 rounded-xl shadow-2xl border border-slate-800 font-mono text-sm overflow-hidden'>
            {/* Header: The Result */}
            <div className='bg-slate-900 p-4 border-b border-slate-800 flex items-center justify-between'>
                <div>
                    <div className='text-slate-400 text-xs font-sans uppercase tracking-wider mb-1'>
                        {resourceName} • {isSell ? 'Offer Price' : 'Bid Price'} Update
                    </div>
                    <div className='flex items-center gap-3 text-2xl font-bold'>
                        <span className='text-slate-500'>${oldPrice.toFixed(2)}</span>
                        <ArrowRight className='text-slate-600' />
                        <span
                            className={
                                netFactor > 1 ? 'text-emerald-400' : netFactor < 1 ? 'text-rose-400' : 'text-slate-300'
                            }
                        >
                            ${newPrice.toFixed(2)}
                        </span>
                    </div>
                </div>
            </div>

            <div className='p-5 space-y-6'>
                {/* Step 1: Base Demand Calculation */}
                <div className='relative'>
                    <div className='absolute -left-2.5 top-2 w-1.5 h-1.5 rounded-full bg-blue-500' />
                    <div className='pl-4 border-l border-slate-800 space-y-2'>
                        <div className='font-sans font-bold text-slate-100'>1. Calculate Base Demand Multiplier</div>
                        <div className='grid grid-cols-2 gap-2 text-xs bg-slate-900/50 p-3 rounded border border-slate-800/50'>
                            <div className='space-y-1'>
                                <div className='text-slate-500'>Current {isSell ? 'Sell' : 'Fill'} Rate</div>
                                <div className='text-lg text-slate-200'>{(currentRate * 100).toFixed(1)}%</div>
                            </div>
                            <div className='space-y-1'>
                                <div className='text-slate-500'>Target Rate</div>
                                <div className='text-lg text-slate-200'>{(targetRate * 100).toFixed(1)}%</div>
                            </div>
                        </div>

                        <div className='flex items-center gap-2 pt-1'>
                            <ArrowDownRight size={16} className='text-slate-600' />
                            <span className='text-slate-400'>Resulting Base Factor:</span>
                            <span className='bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded font-bold'>
                                {formatMultiplier(baseFactor)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Step 2: Safety Springs */}
                <div className='relative'>
                    <div
                        className={`absolute -left-2.5 top-2 w-1.5 h-1.5 rounded-full ${hasSpring ? 'bg-amber-500' : 'bg-slate-700'}`}
                    />
                    <div className='pl-4 border-l border-slate-800 space-y-2'>
                        <div className='font-sans font-bold text-slate-100 flex items-center gap-2'>
                            2. Apply Safety Springs
                            {!hasSpring && (
                                <span className='text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-500 uppercase'>
                                    Inactive
                                </span>
                            )}
                        </div>

                        {hasSpring ? (
                            <>
                                <div className='text-xs text-slate-400 leading-relaxed bg-amber-950/20 p-3 rounded border border-amber-900/30'>
                                    {isSell ? (
                                        <>
                                            Price is approaching Cost Floor{' '}
                                            <strong>(${diagnostics.costFloor.toFixed(2)})</strong>. Spring deviations
                                            [Floor: {sellDiag?.costSpringDeviation.toFixed(3)}, Ceiling:{' '}
                                            {sellDiag?.overDeviation.toFixed(3)}] apply resistance.
                                        </>
                                    ) : (
                                        <>
                                            Price is approaching Margin Ceiling. Spring deviations apply resistance to
                                            prevent overspending.
                                        </>
                                    )}
                                </div>
                                <div className='flex items-center gap-2 pt-1'>
                                    <ArrowDownRight size={16} className='text-slate-600' />
                                    <span className='text-slate-400'>Spring Adjustment:</span>
                                    <span
                                        className={`${springAdjustment > 0 ? 'text-emerald-400 bg-emerald-400/10' : 'text-rose-400 bg-rose-400/10'} px-2 py-0.5 rounded font-bold`}
                                    >
                                        {formatAdjustment(springAdjustment)}
                                    </span>
                                </div>
                            </>
                        ) : (
                            <div className='text-xs text-slate-500 italic'>
                                Price is well within safe margins. No spring resistance applied.
                            </div>
                        )}
                    </div>
                </div>

                {/* Step 3: Final Math Resolution */}
                <div className='relative'>
                    <div className='absolute -left-2.5 top-2 w-1.5 h-1.5 rounded-full bg-emerald-500' />
                    <div className='pl-4 space-y-3'>
                        <div className='font-sans font-bold text-slate-100'>3. Final Price Calculation</div>

                        <div className='bg-slate-900 rounded-lg border border-slate-700 p-4 font-mono text-sm space-y-2'>
                            {/* Formula rows */}
                            <div className='flex justify-between items-center text-slate-400'>
                                <span>Base Factor</span>
                                <span>{baseFactor.toFixed(4)}</span>
                            </div>
                            <div className='flex justify-between items-center text-slate-400'>
                                <span className='flex items-center gap-2'>
                                    <Plus size={14} /> Spring Adjust
                                </span>
                                <span>{formatAdjustment(springAdjustment)}</span>
                            </div>

                            <div className='border-t border-slate-700 my-2 pt-2 flex justify-between items-center font-bold text-slate-200'>
                                <span className='flex items-center gap-2'>
                                    <Equal size={14} /> Net Factor
                                </span>
                                <span className='text-blue-400'>{formatMultiplier(netFactor)}</span>
                            </div>

                            <div className='h-px w-full bg-slate-800 my-4' />

                            <div className='flex justify-between items-center text-slate-400'>
                                <span>Old Price</span>
                                <span>${oldPrice.toFixed(4)}</span>
                            </div>
                            <div className='flex justify-between items-center text-slate-400'>
                                <span className='flex items-center gap-2'>
                                    <X size={14} /> Net Factor
                                </span>
                                <span>{netFactor.toFixed(4)}</span>
                            </div>

                            <div className='border-t border-slate-700 my-2 pt-2 flex justify-between items-center font-bold text-lg text-emerald-400'>
                                <span className='flex items-center gap-2'>
                                    <Equal size={16} /> New Price
                                </span>
                                <span>${newPrice.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
