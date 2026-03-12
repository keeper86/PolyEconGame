'use client';

import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';

const OCC_LABELS = ['Unoccupied', 'Employed', 'Education', 'UnableToWork'];
const COLORS = ['#60a5fa', '#34d399', '#f59e0b', '#f97316', '#ef4444'];

type DemographyRow = {
    age: number;
    total: number;
    edu: [number, number, number, number];
    occ: [number, number, number, number];
};

type Props = {
    rows: DemographyRow[];
};

function safeNumber(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

export default function PlanetDemography({ rows }: Props): React.ReactElement {
    if (!rows || rows.length === 0) {
        return <div className='text-sm text-gray-500'>No demography data</div>;
    }

    // Compute labor totals for ages > 14
    const laborCounts = [0, 0, 0, 0];
    let laborTotal = 0;
    for (const row of rows) {
        if (row.age <= 14) {
            continue;
        }
        for (let i = 0; i < 4; i++) {
            laborCounts[i] += row.occ[i];
            laborTotal += row.occ[i];
        }
    }

    const overallTotal = rows.reduce((s, r) => s + r.total, 0);
    if (overallTotal === 0) {
        return <div className='text-sm text-gray-500'>No demography data</div>;
    }

    const maxTotal = rows.reduce((mx, r) => Math.max(mx, safeNumber(r.total)), 0);
    const scale = maxTotal > 0 ? 1 / maxTotal : 1;

    const ageData = rows.map((r) => ({
        age: String(r.age),
        population: safeNumber(r.total) * scale,
        edu0: safeNumber(r.edu[0]) * scale,
        edu1: safeNumber(r.edu[1]) * scale,
        edu2: safeNumber(r.edu[2]) * scale,
        edu3: safeNumber(r.edu[3]) * scale,
        occ0: safeNumber(r.occ[0]) * scale,
        occ1: safeNumber(r.occ[1]) * scale,
        occ2: safeNumber(r.occ[2]) * scale,
        occ3: safeNumber(r.occ[3]) * scale,
    }));

    return (
        <div className='space-y-4'>
            <div>
                <h4 className='text-sm font-medium mb-2'>Labor (age &gt; 14)</h4>
                <div className='flex flex-wrap gap-2'>
                    {OCC_LABELS.map((label, i) => (
                        <div key={label} className='px-3 py-2 bg-white border rounded shadow-sm text-sm'>
                            <div className='text-xs text-gray-500'>{label}</div>
                            <div className='font-medium'>{laborCounts[i].toLocaleString()}</div>
                            <div className='text-xs text-gray-400'>
                                {laborTotal > 0 ? ((laborCounts[i] / laborTotal) * 100).toFixed(1) + '%' : '0.0%'}
                            </div>
                        </div>
                    ))}
                    <div className='px-3 py-2 bg-white border rounded shadow-sm text-sm'>
                        <div className='text-xs text-gray-500'>Total (age &gt; 14)</div>
                        <div className='font-medium'>{laborTotal.toLocaleString()}</div>
                    </div>
                </div>
            </div>

            <div>
                <h4 className='text-sm font-medium mb-2'>Education distribution by age</h4>
                <div style={{ width: '100%', height: 160 }}>
                    <ResponsiveContainer width='100%' height='100%'>
                        <BarChart data={ageData} margin={{ top: 6, right: 6, left: 6, bottom: 6 }}>
                            <XAxis dataKey='age' tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Legend verticalAlign='top' height={20} />
                            <Bar dataKey='edu0' stackId='a' fill={COLORS[0]} name='None' />
                            <Bar dataKey='edu1' stackId='a' fill={COLORS[1]} name='Primary' />
                            <Bar dataKey='edu2' stackId='a' fill={COLORS[2]} name='Secondary' />
                            <Bar dataKey='edu3' stackId='a' fill={COLORS[3]} name='Tertiary' />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div>
                <h4 className='text-sm font-medium mb-2'>Occupation distribution by age</h4>
                <div style={{ width: '100%', height: 160 }}>
                    <ResponsiveContainer width='100%' height='100%'>
                        <BarChart data={ageData} margin={{ top: 6, right: 6, left: 6, bottom: 6 }}>
                            <XAxis dataKey='age' tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Legend verticalAlign='top' height={20} />
                            <Bar dataKey='occ0' stackId='b' fill={COLORS[0]} name='Unoccupied' />
                            <Bar dataKey='occ1' stackId='b' fill={COLORS[1]} name='Employed' />
                            <Bar dataKey='occ2' stackId='b' fill={COLORS[2]} name='Education' />
                            <Bar dataKey='occ3' stackId='b' fill={COLORS[3]} name='UnableToWork' />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
