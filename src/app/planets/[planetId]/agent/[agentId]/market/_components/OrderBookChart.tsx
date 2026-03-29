'use client';

/**
 * OrderBookChart
 *
 * Renders the merit-order supply stack for the food market:
 *   - Stepped supply curve: cumulative quantity (x) vs. offer price (y),
 *     cheapest seller leftmost.  Each step is one agent's lot.
 *   - Horizontal demand line: aggregate household demand at the reference price.
 *   - Vertical clearing line: where demand intersects supply.
 *
 * The chart is a classic "stack-of-bars" representation used in
 * electricity / commodity markets.  Colour-coded by sell-through so the
 * viewer instantly sees who is infra-marginal (sold everything, green),
 * marginal (partially sold, amber), or supra-marginal (unsold, red/grey).
 */

import React, { useMemo } from 'react';
import {
    ComposedChart,
    Bar,
    ReferenceLine,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    ResponsiveContainer,
    Cell,
    Legend,
} from 'recharts';
import { formatNumbers } from '@/lib/utils';

export type OfferEntry = {
    agentId: string;
    agentName: string;
    offerPrice: number;
    lastPlacedQuantity: number;
    lastSold: number;
    sellThrough: number;
};

type Props = {
    offers: OfferEntry[];
    /** Aggregate household demand (tons). */
    totalDemand: number;
    /** Volume-weighted clearing price. */
    clearingPrice: number;
};

// ─── Colour helpers ───────────────────────────────────────────────────────────

function barColor(sellThrough: number): string {
    if (sellThrough >= 0.99) {
        return '#22c55e';
    } // fully sold — green
    if (sellThrough >= 0.01) {
        return '#f59e0b';
    } // partially sold — amber (marginal)
    return '#94a3b8'; // unsold — slate
}

// ─── Chart data builder ───────────────────────────────────────────────────────

type ChartBar = {
    name: string; // agent name (for tooltip)
    agentId: string;
    price: number;
    quantity: number;
    cumulativeStart: number; // left edge of this bar
    cumulativeEnd: number; // right edge of this bar
    sellThrough: number;
    lastSold: number;
};

function buildChartBars(offers: OfferEntry[]): ChartBar[] {
    // Sort cheapest first (merit order)
    const sorted = [...offers].sort((a, b) => a.offerPrice - b.offerPrice);
    let cum = 0;
    return sorted.map((o) => {
        const start = cum;
        cum += o.lastPlacedQuantity;
        return {
            name: o.agentName,
            agentId: o.agentId,
            price: o.offerPrice,
            quantity: o.lastPlacedQuantity,
            cumulativeStart: start,
            cumulativeEnd: cum,
            sellThrough: o.sellThrough,
            lastSold: o.lastSold,
        };
    });
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

type TooltipPayload = {
    payload?: ChartBar;
};

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
    if (!active || !payload?.length) {
        return null;
    }
    const d = payload[0]?.payload;
    if (!d) {
        return null;
    }
    return (
        <div className='bg-background border rounded px-2 py-1.5 text-xs shadow-md space-y-0.5'>
            <p className='font-semibold'>{d.name}</p>
            <p>
                Price: <span className='font-mono'>{formatNumbers(d.price)}</span>
            </p>
            <p>
                Offered: <span className='font-mono'>{formatNumbers(d.quantity)}</span> t
            </p>
            <p>
                Sold: <span className='font-mono'>{formatNumbers(d.lastSold)}</span> t (
                {formatNumbers(d.sellThrough * 100)}%)
            </p>
            <p className='text-muted-foreground'>
                Cumulative: {formatNumbers(d.cumulativeStart)}–{formatNumbers(d.cumulativeEnd)} t
            </p>
        </div>
    );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrderBookChart({ offers, totalDemand, clearingPrice }: Props): React.ReactElement {
    const bars = useMemo(() => buildChartBars(offers), [offers]);

    if (bars.length === 0) {
        return (
            <div className='flex items-center justify-center h-[200px] text-sm text-muted-foreground'>
                No offers this tick
            </div>
        );
    }

    // For Recharts Bar we need a single data array where x = index and we
    // manually position using a custom shape, OR we use a simple bar chart
    // where data[i] = { x: midpoint, price, quantity }.
    // We render quantity as bar height and price on the Y axis.
    // X axis = agent index in merit order (cumulative quantity would need
    // a custom bar width — simpler to use index + show quantity in tooltip).
    //
    // For a true supply-step-curve we use a custom stepped bar where each
    // entry encodes [cumulativeStart, cumulativeEnd] on X.  Recharts Bar
    // does not natively support variable-width bars, so we use a simple
    // fixed-width bar chart ordered by price and annotate with quantities.

    const data = bars.map((b, i) => ({
        ...b,
        index: i,
    }));

    const allPrices = bars.map((b) => b.price);
    const minP = Math.min(...allPrices);
    const maxP = Math.max(...allPrices);
    const yPad = (maxP - minP) * 0.15 || 0.1;

    return (
        <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width='100%' height='100%'>
                <ComposedChart data={data} margin={{ top: 8, right: 36, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray='3 3' stroke='var(--border)' />
                    <XAxis
                        dataKey='index'
                        type='number'
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => {
                            const bar = data[v as number];
                            return bar ? bar.name.slice(0, 8) : String(v);
                        }}
                        domain={[0, data.length - 1]}
                        ticks={data.map((_, i) => i)}
                        label={{ value: 'Sellers (merit order)', position: 'insideBottom', offset: -4, fontSize: 10 }}
                        interval={0}
                    />
                    <YAxis
                        type='number'
                        domain={[Math.max(0, minP - yPad), maxP + yPad]}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => (typeof v === 'number' ? formatNumbers(v) : String(v))}
                        label={{ value: 'Price (¤/t)', angle: -90, position: 'insideLeft', fontSize: 10 }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                        verticalAlign='top'
                        height={20}
                        formatter={(value) => {
                            if (value === 'price') {
                                return 'Offer price';
                            }
                            return value;
                        }}
                        wrapperStyle={{ fontSize: 10 }}
                    />
                    {/* Supply bars */}
                    <Bar dataKey='price' name='price' isAnimationActive={false} barSize={32}>
                        {data.map((entry) => (
                            <Cell key={entry.agentId} fill={barColor(entry.sellThrough)} fillOpacity={0.85} />
                        ))}
                    </Bar>
                    {/* Clearing price line */}
                    <ReferenceLine
                        y={clearingPrice}
                        stroke='#f59e0b'
                        strokeDasharray='5 3'
                        strokeWidth={1.5}
                        label={{
                            value: `Cleared @ ${formatNumbers(clearingPrice)}`,
                            position: 'right',
                            fontSize: 9,
                            fill: '#f59e0b',
                        }}
                    />
                </ComposedChart>
            </ResponsiveContainer>
            {/* Legend for bar colours */}
            <div className='flex items-center gap-3 mt-1 justify-center text-[10px] text-muted-foreground'>
                <span className='flex items-center gap-1'>
                    <span className='inline-block w-2.5 h-2.5 rounded-sm bg-green-500' />
                    Fully sold
                </span>
                <span className='flex items-center gap-1'>
                    <span className='inline-block w-2.5 h-2.5 rounded-sm bg-amber-500' />
                    Marginal (partial)
                </span>
                <span className='flex items-center gap-1'>
                    <span className='inline-block w-2.5 h-2.5 rounded-sm bg-slate-400' />
                    Unsold
                </span>
                <span className='flex items-center gap-1'>
                    <span className='inline-block w-5 border-t-2 border-dashed border-amber-500' />
                    Clearing price
                </span>
                {totalDemand > 0 && <span className='text-violet-400'>Demand: {formatNumbers(totalDemand)} t</span>}
            </div>
        </div>
    );
}
