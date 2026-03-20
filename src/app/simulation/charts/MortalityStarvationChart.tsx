'use client';

import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Slider } from '@/components/ui/slider';

const STARVATION_ACUTE_POWER = 4;
const STEPS = 40;

function buildData(baseMortalityPct: number) {
    const base = baseMortalityPct / 100;
    return Array.from({ length: STEPS + 1 }, (_, i) => {
        const s = i / STEPS;
        const baseAmplified = base * (1 + s);
        const acute = s === 0 ? 0 : Math.pow(s, STARVATION_ACUTE_POWER);
        const total = Math.min(0.8, baseAmplified + acute);
        return {
            s,
            'Base × (1 + S)': Math.round(baseAmplified * 10000) / 10000,
            'Acute S⁴': Math.round(acute * 10000) / 10000,
            'Total (cap 80%)': Math.round(total * 10000) / 10000,
        };
    });
}

export function MortalityStarvationChart() {
    const [basePct, setBasePct] = useState(1);
    const data = useMemo(() => buildData(basePct), [basePct]);

    return (
        <div className='not-prose space-y-4 rounded-lg border bg-card p-4'>
            <div className='space-y-1.5 text-sm'>
                <div className='flex justify-between text-muted-foreground'>
                    <span>Base annual mortality rate</span>
                    <span className='font-mono'>{basePct}%/yr</span>
                </div>
                <Slider min={0.1} max={20} step={0.1} value={[basePct]} onValueChange={([v]) => setBasePct(v)} />
            </div>
            <ResponsiveContainer width='100%' height={220}>
                <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray='3 3' stroke='hsl(var(--border))' />
                    <XAxis
                        dataKey='s'
                        type='number'
                        domain={[0, 1]}
                        tickFormatter={(v: number) => v.toFixed(1)}
                        tick={{ fontSize: 11 }}
                        label={{ value: 'Starvation S', position: 'insideBottom', offset: -10 }}
                    />
                    <YAxis
                        tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
                        tick={{ fontSize: 11 }}
                        width={44}
                    />
                    <Tooltip
                        contentStyle={{ fontSize: 12 }}
                        formatter={(v: number, name: string) => [`${(v * 100).toFixed(2)}%/yr`, name]}
                        labelFormatter={(s: number) => `S = ${s.toFixed(2)}`}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Line
                        type='monotone'
                        dataKey='Base × (1 + S)'
                        stroke='hsl(var(--primary))'
                        dot={false}
                        strokeWidth={2}
                    />
                    <Line
                        type='monotone'
                        dataKey='Acute S⁴'
                        stroke='hsl(var(--destructive))'
                        dot={false}
                        strokeWidth={2}
                    />
                    <Line
                        type='monotone'
                        dataKey='Total (cap 80%)'
                        stroke='#f59e0b'
                        dot={false}
                        strokeWidth={2}
                        strokeDasharray='5 3'
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
