'use client';

import { useMemo, useState } from 'react';
import {
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { Slider } from '@/components/ui/slider';

const TARGET_SELL_THROUGH = 0.9;
const ADJUSTMENT_SPEED = 0.2;
const PRICE_ADJUST_MAX_UP = 1.05;
const PRICE_ADJUST_MAX_DOWN = 0.95;
const TICKS = 80;

function simulatePrice(sellThroughPct: number) {
    const sellThrough = sellThroughPct / 100;
    let price = 1.0;
    return Array.from({ length: TICKS }, (_, t) => {
        const excessDemand = sellThrough - TARGET_SELL_THROUGH;
        let factor = 1 + ADJUSTMENT_SPEED * excessDemand;
        factor = Math.min(PRICE_ADJUST_MAX_UP, Math.max(PRICE_ADJUST_MAX_DOWN, factor));
        price = Math.max(0.01, price * factor);
        return { tick: t + 1, price: Math.round(price * 1000) / 1000 };
    });
}

export function PricingDynamicsChart() {
    const [sellThroughPct, setSellThroughPct] = useState(100);
    const data = useMemo(() => simulatePrice(sellThroughPct), [sellThroughPct]);

    const equilibriumLabel = `Target ${TARGET_SELL_THROUGH * 100}% sold`;
    const isEquilibrium = sellThroughPct === TARGET_SELL_THROUGH * 100;

    return (
        <div className='not-prose space-y-4 rounded-lg border bg-card p-4'>
            <div className='space-y-1.5 text-sm'>
                <div className='flex justify-between text-muted-foreground'>
                    <span>Actual sell-through</span>
                    <span className='font-mono'>{sellThroughPct}%</span>
                </div>
                <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[sellThroughPct]}
                    onValueChange={([v]) => setSellThroughPct(v)}
                />
            </div>
            <ResponsiveContainer width='100%' height={220}>
                <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray='3 3' stroke='hsl(var(--border))' />
                    <XAxis
                        dataKey='tick'
                        tick={{ fontSize: 11 }}
                        label={{ value: 'Tick', position: 'insideBottom', offset: -10 }}
                    />
                    <YAxis tickFormatter={(v: number) => v.toFixed(2)} tick={{ fontSize: 11 }} width={40} />
                    <Tooltip
                        contentStyle={{ fontSize: 12 }}
                        formatter={(v: number) => [v.toFixed(3), 'Price']}
                        labelFormatter={(t: number) => `Tick ${t}`}
                    />
                    <ReferenceLine y={1.0} stroke='hsl(var(--muted-foreground))' strokeDasharray='4 4' />
                    <Line
                        type='monotone'
                        dataKey='price'
                        name={isEquilibrium ? equilibriumLabel : `${sellThroughPct}% sold`}
                        stroke={
                            sellThroughPct > TARGET_SELL_THROUGH * 100
                                ? 'hsl(var(--destructive))'
                                : sellThroughPct === TARGET_SELL_THROUGH * 100
                                  ? '#22c55e'
                                  : 'hsl(var(--primary))'
                        }
                        dot={false}
                        strokeWidth={2}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
