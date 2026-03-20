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

const STARVATION_ADJUST_TICKS = 30;
const SIM_TICKS = 180;

function buildData(famineDuration: number, chronicSupply: number) {
    let sFamine = 0;
    let sChronic = 0;
    return Array.from({ length: SIM_TICKS }, (_, tick) => {
        const famineFraction = tick < famineDuration ? 0 : 1;
        const chronicFraction = chronicSupply / 100;

        const famineShortfall = Math.max(0, Math.min(1, 1 - famineFraction));
        const chronicShortfall = Math.max(0, Math.min(1, 1 - chronicFraction));

        sFamine = sFamine + (famineShortfall - sFamine) / STARVATION_ADJUST_TICKS;
        sChronic = sChronic + (chronicShortfall - sChronic) / STARVATION_ADJUST_TICKS;

        return {
            tick,
            famine: Math.round(sFamine * 1000) / 1000,
            chronic: Math.round(sChronic * 1000) / 1000,
        };
    });
}

export function StarvationDynamicsChart() {
    const [famineDuration, setFamineDuration] = useState(60);
    const [chronicSupply, setChronicSupply] = useState(50);

    const data = useMemo(() => buildData(famineDuration, chronicSupply), [famineDuration, chronicSupply]);

    return (
        <div className='not-prose space-y-4 rounded-lg border bg-card p-4'>
            <div className='grid grid-cols-2 gap-x-8 gap-y-3 text-sm'>
                <div className='space-y-1.5'>
                    <div className='flex justify-between text-muted-foreground'>
                        <span>Famine duration</span>
                        <span className='font-mono'>{famineDuration} ticks</span>
                    </div>
                    <Slider
                        min={5}
                        max={150}
                        step={5}
                        value={[famineDuration]}
                        onValueChange={([v]) => setFamineDuration(v)}
                    />
                </div>
                <div className='space-y-1.5'>
                    <div className='flex justify-between text-muted-foreground'>
                        <span>Chronic food supply</span>
                        <span className='font-mono'>{chronicSupply}%</span>
                    </div>
                    <Slider
                        min={0}
                        max={100}
                        step={5}
                        value={[chronicSupply]}
                        onValueChange={([v]) => setChronicSupply(v)}
                    />
                </div>
            </div>
            <ResponsiveContainer width='100%' height={220}>
                <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray='3 3' stroke='hsl(var(--border))' />
                    <XAxis
                        dataKey='tick'
                        tick={{ fontSize: 11 }}
                        label={{ value: 'Tick', position: 'insideBottom', offset: -10 }}
                    />
                    <YAxis
                        domain={[0, 1]}
                        tickFormatter={(v: number) => v.toFixed(1)}
                        tick={{ fontSize: 11 }}
                        width={32}
                    />
                    <Tooltip
                        contentStyle={{ fontSize: 12 }}
                        formatter={(v: number, name: string) => [
                            v.toFixed(3),
                            name === 'famine' ? 'Famine → recovery' : `Chronic ${chronicSupply}% supply`,
                        ]}
                        labelFormatter={(t) => `Tick ${t}`}
                    />
                    <Legend
                        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                        formatter={(name) =>
                            name === 'famine' ? 'Famine → recovery' : `Chronic ${chronicSupply}% supply`
                        }
                    />
                    <ReferenceLine
                        x={famineDuration}
                        stroke='#ef4444'
                        strokeDasharray='4 3'
                        label={{ value: 'End famine', fontSize: 10, fill: '#ef4444' }}
                    />
                    <Line
                        type='monotone'
                        dataKey='famine'
                        stroke='#ef4444'
                        dot={false}
                        strokeWidth={2}
                        isAnimationActive={false}
                    />
                    <Line
                        type='monotone'
                        dataKey='chronic'
                        stroke='#3b82f6'
                        dot={false}
                        strokeWidth={2}
                        isAnimationActive={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
