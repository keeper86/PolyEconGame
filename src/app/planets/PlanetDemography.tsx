'use client';
import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import type { Population, Cohort } from '../../simulation/planet';
import { educationLevelKeys, OCCUPATIONS } from '../../simulation/planet';

function safeNumber(v: unknown): number {
    const n = Number(v as unknown);
    return Number.isFinite(n) ? n : 0;
}

export default function PlanetDemography({ population }: { population?: Population }): React.ReactElement {
    // Expect `population` to be the typed `Population` from the engine.
    if (!population || population.demography.length === 0) {
        return <div className='text-sm text-gray-500'>No demography data</div>;
    }

    // Compute labor totals for ages > 14 (i.e. starting at age 15).
    const laborCounts = new Array<number>(OCCUPATIONS.length).fill(0);
    let laborTotal = 0;
    for (let age = 15; age < population.demography.length; age++) {
        const cohort: Cohort | undefined = population.demography[age];
        if (!cohort) {
            continue;
        }
        for (let eduIdx = 0; eduIdx < educationLevelKeys.length; eduIdx++) {
            const eduKey = educationLevelKeys[eduIdx];
            const eduObj = cohort[eduKey];
            for (let occIdx = 0; occIdx < OCCUPATIONS.length; occIdx++) {
                const occKey = OCCUPATIONS[occIdx];
                const val = Number((eduObj && eduObj[occKey]) || 0);
                laborCounts[occIdx] += val;
                laborTotal += val;
            }
        }
    }
    const OCC_LABELS = ['Unoccupied', 'Company', 'Government', 'Education', 'UnableToWork'];

    // Compute totals per age, per education, per occupation
    // ages will include per-education and per-occupation counts so we can render stacked bars
    const ages: {
        age: number;
        total: number;
        edu0: number;
        edu1: number;
        edu2: number;
        edu3: number;
        edu4: number;
        occ0: number;
        occ1: number;
        occ2: number;
        occ3: number;
        occ4: number;
    }[] = [];

    // Use backend-provided runtime keys and types. Assume `population.demography`
    // matches the `Cohort[]` shape from the backend.
    for (let age = 0; age < population.demography.length; age++) {
        const cohort: Cohort | undefined = population.demography[age];
        if (!cohort) {
            continue;
        }
        let ageTotal = 0;
        const eduCounts = new Array(educationLevelKeys.length).fill(0);
        const occCounts = new Array(OCCUPATIONS.length).fill(0);
        for (let eduIdx = 0; eduIdx < educationLevelKeys.length; eduIdx++) {
            const eduKey = educationLevelKeys[eduIdx];
            const eduObj = cohort[eduKey];
            for (let occIdx = 0; occIdx < OCCUPATIONS.length; occIdx++) {
                const occKey = OCCUPATIONS[occIdx];
                const val = Number((eduObj && eduObj[occKey]) || 0);
                ageTotal += val;
                eduCounts[eduIdx] += val;
                occCounts[occIdx] += val;
            }
        }
        ages.push({
            age,
            total: ageTotal,
            edu0: eduCounts[0],
            edu1: eduCounts[1],
            edu2: eduCounts[2],
            edu3: eduCounts[3],
            edu4: eduCounts[4],
            occ0: occCounts[0],
            occ1: occCounts[1],
            occ2: occCounts[2],
            occ3: occCounts[3],
            occ4: occCounts[4],
        });
    }

    // If there are no people across all cohorts, avoid rendering meaningless charts.
    // This prevents situations where the charting library shows axis ticks/values (e.g. 1)
    // despite there being zero people in the data.
    const overallTotal = ages.reduce((sum, a) => sum + a.total, 0);
    if (overallTotal === 0) {
        return <div className='text-sm text-gray-500'>No demography data</div>;
    }

    const ageData = ages.map((a) => ({
        age: String(a.age),
        population: a.total,
        edu0: a.edu0,
        edu1: a.edu1,
        edu2: a.edu2,
        edu3: a.edu3,
        edu4: a.edu4,
        occ0: a.occ0,
        occ1: a.occ1,
        occ2: a.occ2,
        occ3: a.occ3,
        occ4: a.occ4,
    }));

    // Normalize values so the largest bar maps to 1. This preserves the shape
    // of the distribution while making the plot scale independent from total size.
    const maxTotal = ageData.reduce((mx, d) => Math.max(mx, safeNumber(d.population)), 0);
    const scale = maxTotal > 0 ? 1 / maxTotal : 1;
    const normalizedAgeData = ageData.map((d) => ({
        ...d,
        population: safeNumber(d.population) * scale,
        edu0: safeNumber(d.edu0) * scale,
        edu1: safeNumber(d.edu1) * scale,
        edu2: safeNumber(d.edu2) * scale,
        edu3: safeNumber(d.edu3) * scale,
        edu4: safeNumber(d.edu4) * scale,
        occ0: safeNumber(d.occ0) * scale,
        occ1: safeNumber(d.occ1) * scale,
        occ2: safeNumber(d.occ2) * scale,
        occ3: safeNumber(d.occ3) * scale,
        occ4: safeNumber(d.occ4) * scale,
    }));

    const COLORS = ['#60a5fa', '#34d399', '#f59e0b', '#f97316', '#ef4444'];

    return (
        <div className='space-y-4'>
            <div>
                <h4 className='text-sm font-medium mb-2'>Labor (age &gt; 14)</h4>
                <div className='flex flex-wrap gap-2'>
                    {OCCUPATIONS.map((occ, i) => (
                        <div key={occ} className='px-3 py-2 bg-white border rounded shadow-sm text-sm'>
                            <div className='text-xs text-gray-500'>{OCC_LABELS[i] ?? occ}</div>
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
                        <BarChart data={normalizedAgeData} margin={{ top: 6, right: 6, left: 6, bottom: 6 }}>
                            <XAxis dataKey='age' tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Legend verticalAlign='top' height={20} />
                            {/* Stacked bars: edu0=None, edu1=Primary, edu2=Secondary, edu3=Tertiary, edu4=Quaternary */}
                            <Bar dataKey='edu0' stackId='a' fill={COLORS[0]} name='None' />
                            <Bar dataKey='edu1' stackId='a' fill={COLORS[1]} name='Primary' />
                            <Bar dataKey='edu2' stackId='a' fill={COLORS[2]} name='Secondary' />
                            <Bar dataKey='edu3' stackId='a' fill={COLORS[3]} name='Tertiary' />
                            <Bar dataKey='edu4' stackId='a' fill={COLORS[4]} name='Quaternary' />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div>
                <h4 className='text-sm font-medium mb-2'>Occupation distribution by age</h4>
                <div style={{ width: '100%', height: 160 }}>
                    <ResponsiveContainer width='100%' height='100%'>
                        <BarChart data={normalizedAgeData} margin={{ top: 6, right: 6, left: 6, bottom: 6 }}>
                            <XAxis dataKey='age' tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Legend verticalAlign='top' height={20} />
                            {/* Stacked bars: occ0=Unoccupied, occ1=Company, occ2=Government, occ3=Education, occ4=UnableToWork */}
                            <Bar dataKey='occ0' stackId='b' fill={COLORS[0]} name='Unoccupied' />
                            <Bar dataKey='occ1' stackId='b' fill={COLORS[1]} name='Company' />
                            <Bar dataKey='occ2' stackId='b' fill={COLORS[2]} name='Government' />
                            <Bar dataKey='occ3' stackId='b' fill={COLORS[3]} name='Education' />
                            <Bar dataKey='occ4' stackId='b' fill={COLORS[4]} name='UnableToWork' />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
