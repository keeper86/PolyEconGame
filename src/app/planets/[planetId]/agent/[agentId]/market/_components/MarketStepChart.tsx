'use client';

import type { AgentBid, AgentOffer } from '@/server/controller/planet';
import { formatNumbers } from '@/simulation/utils/numberFormat';
import React, { useMemo } from 'react';
import {
    CartesianGrid,
    ComposedChart,
    Line,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface MarketStepChartProps {
    offers: AgentOffer[];
    bids: AgentBid[];
    totalSold: number;
    qtyUnit: string;
}
export default function MarketStepChart({ offers, bids, totalSold, qtyUnit }: MarketStepChartProps) {
    const { chartData, xDomain } = useMemo(() => {
        // 1. Process Supply (Sorted by price ascending)
        const sortedOffers = [...offers].sort((a, b) => a.offerPrice - b.offerPrice);
        const supplyPoints: { volume: number; supplyPrice: number | null; demandPrice: number | null }[] = [];

        let cumSupply = 0;
        if (sortedOffers.length > 0) {
            supplyPoints.push({ volume: 0, supplyPrice: sortedOffers[0].offerPrice, demandPrice: null });
        }

        sortedOffers.forEach((offer) => {
            cumSupply += offer.lastPlacedQuantity;
            supplyPoints.push({
                volume: cumSupply,
                supplyPrice: offer.offerPrice,
                demandPrice: null,
            });
        });

        // 2. Process Demand (Sorted by bid price descending)
        const sortedBids = [...bids].sort((a, b) => b.bidPrice - a.bidPrice);
        const demandPoints: { volume: number; supplyPrice: number | null; demandPrice: number | null }[] = [];

        let cumDemand = 0;
        if (sortedBids.length > 0) {
            demandPoints.push({ volume: 0, supplyPrice: null, demandPrice: sortedBids[0].bidPrice });
        }

        sortedBids.forEach((bid) => {
            cumDemand += bid.demandedQuantity;
            demandPoints.push({
                volume: cumDemand,
                supplyPrice: null,
                demandPrice: bid.bidPrice,
            });
        });

        // 3. Combine steps onto unified timeline
        const allVolumes = Array.from(
            new Set([...supplyPoints.map((p) => p.volume), ...demandPoints.map((p) => p.volume)]),
        ).sort((a, b) => a - b);

        const getActivePrice = (points: typeof supplyPoints, vol: number, key: 'supplyPrice' | 'demandPrice') => {
            const match = points.find((p) => p.volume >= vol);
            return match ? match[key] : null;
        };

        const fullData = allVolumes.map((vol) => ({
            volume: Math.round(vol * 100) / 100,
            Supply: getActivePrice(supplyPoints, vol, 'supplyPrice'),
            Demand: getActivePrice(demandPoints, vol, 'demandPrice'),
        }));

        // 4. Compute x-axis domain centered around totalSold, crop data for performance
        if (totalSold > 0 && fullData.length > 0) {
            const maxVolume = fullData[fullData.length - 1].volume;
            const halfRange = Math.min(totalSold, maxVolume - totalSold);
            const xMin = Math.max(0, totalSold - halfRange);
            const xMax = totalSold + halfRange;
            const domain: [number, number] = [xMin, xMax];

            // Crop data to the domain range, with one extra point on each side for step line continuity
            let startIdx = 0;
            let endIdx = fullData.length - 1;

            for (let i = 0; i < fullData.length; i++) {
                if (fullData[i].volume >= xMin) {
                    startIdx = Math.max(0, i - 1);
                    break;
                }
            }
            for (let i = fullData.length - 1; i >= 0; i--) {
                if (fullData[i].volume <= xMax) {
                    endIdx = Math.min(fullData.length - 1, i + 1);
                    break;
                }
            }

            return { chartData: fullData.slice(startIdx, endIdx + 1), xDomain: domain };
        }

        return { chartData: fullData, xDomain: undefined };
    }, [offers, bids, totalSold]);

    return (
        <div className='w-full h-72'>
            <ResponsiveContainer width='100%' height='100%'>
                <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray='3 3' stroke='#262626' />
                    <XAxis
                        dataKey='volume'
                        type='number'
                        domain={xDomain ?? ['auto', 'auto']}
                        allowDataOverflow={!!xDomain}
                        stroke='#737373'
                        fontSize={11}
                        tickLine={false}
                        tickFormatter={(v) => formatNumbers(v)}
                    />
                    <YAxis
                        type='number'
                        domain={['dataMin - 0.02', 'dataMax + 0.02']}
                        stroke='#737373'
                        fontSize={11}
                        tickLine={false}
                        tickFormatter={(v) => `${v.toFixed(2)}€`}
                    />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#171717', borderColor: '#404040', borderRadius: '6px' }}
                        labelStyle={{ color: '#a3a3a3', fontSize: '12px' }}
                        itemStyle={{ fontSize: '13px' }}
                        labelFormatter={(label) => `Cumulative Vol: ${formatNumbers(label)} ${qtyUnit}`}
                    />

                    <Line
                        type='stepBefore'
                        dataKey='Supply'
                        stroke='#6366f1'
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                    />
                    <Line
                        type='stepBefore'
                        dataKey='Demand'
                        stroke='#06b6d4'
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                    />

                    {totalSold > 0 && (
                        <ReferenceLine
                            x={totalSold}
                            stroke='#22c55e'
                            strokeDasharray='4 4'
                            label={{
                                value: `Cleared: ${formatNumbers(totalSold)} ${qtyUnit}`,
                                fill: '#22c55e',
                                position: 'top',
                                fontSize: 10,
                            }}
                        />
                    )}
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}
