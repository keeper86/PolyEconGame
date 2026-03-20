'use client';

import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Slider } from '@/components/ui/slider';

const STARVATION_ACUTE_POWER = 4;
const LIFETIME_FERTILITY = 3.0;
const START_FERTILE_AGE = 18;
const END_FERTILE_AGE = 45;
const FERTILE_YEARS = END_FERTILE_AGE - START_FERTILE_AGE + 1;
const STEPS = 40;

function buildData(pollutionReductionPct: number) {
    const pollutionReduction = pollutionReductionPct / 100;
    return Array.from({ length: STEPS + 1 }, (_, i) => {
        const s = i / STEPS;
        const fertilityFactor = 1 - 0.75 * Math.pow(s, STARVATION_ACUTE_POWER);
        const tfr = LIFETIME_FERTILITY * fertilityFactor * (1 - 0.5 * pollutionReduction);
        const annualBirthsPerWoman = tfr / FERTILE_YEARS;
        return {
            s,
            'TFR': Math.round(tfr * 100) / 100,
            'Births/woman/yr': Math.round(annualBirthsPerWoman * 1000) / 1000,
        };
    });
}

export function FertilityStarvationChart() {
    const [pollutionPct, setPollutionPct] = useState(0);
    const data = useMemo(() => buildData(pollutionPct), [pollutionPct]);

    return (
        <div className='not-prose space-y-4 rounded-lg border bg-card p-4'>
            <div className='space-y-1.5 text-sm'>
                <div className='flex justify-between text-muted-foreground'>
                    <span>Pollution reduction</span>
                    <span className='font-mono'>{pollutionPct}%</span>
                </div>
                <Slider min={0} max={80} step={1} value={[pollutionPct]} onValueChange={([v]) => setPollutionPct(v)} />
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
                    <YAxis tick={{ fontSize: 11 }} width={34} />
                    <Tooltip contentStyle={{ fontSize: 12 }} labelFormatter={(s: number) => `S = ${s.toFixed(2)}`} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Line type='monotone' dataKey='TFR' stroke='hsl(var(--primary))' dot={false} strokeWidth={2} />
                    <Line type='monotone' dataKey='Births/woman/yr' stroke='#22c55e' dot={false} strokeWidth={2} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
