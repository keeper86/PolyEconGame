'use client';

import { formatNumberWithUnit, resourceFormToUnit } from '@/lib/utils';
import type { Units } from '@/lib/utils';
import type { PlanetMarketSnapshot } from '@/server/controller/planet';
import { formatNumbers } from '@/simulation/utils/numberFormat';
import { useMemo } from 'react';
import { useIsSmallScreen } from '@/hooks/useMobile';
import {
    Area,
    CartesianGrid,
    ComposedChart,
    Legend,
    ReferenceArea,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import { getResourceByName } from './marketHelpers';

// ── Types ──────────────────────────────────────────────────────────────────────

interface MarketStepChartProps {
    market: PlanetMarketSnapshot;
    agentId: string;
    planetId: string;
}

type AgentMeta = {
    agentId: string;
    agentName: string;
    isOwn: boolean;
    kind: 'offer' | 'bid' | 'population';
    price: number;
    quantity: number;
    /** Sold (for offers) or bought (for bids) */
    filled: number;
    /** sellThrough (offers) or fillRatio (bids), 0-1 */
    fillRate: number;
};

type StepDataPoint = {
    volume: number;
    Supply: number | null;
    Demand: number | null;
    /** Agent metadata at this step, if any */
    supplyAgent?: AgentMeta;
    demandAgent?: AgentMeta;
};

function AgentInfoCard({
    meta,
    planetId,
    qtyUnit,
    sideLabel,
    fillLabel,
    color,
    small,
}: {
    meta: AgentMeta | undefined;
    planetId: string;
    qtyUnit: Units;
    sideLabel: string;
    fillLabel: string;
    color: string;
    small?: boolean;
}) {
    const minW = small ? 'auto' : '140px';
    const labelFs = small ? '10px' : '11px';
    const nameFs = small ? '11px' : '13px';
    const rowFs = small ? '10px' : '12px';
    const fillFs = small ? '10px' : '11px';
    const clearFs = small ? '9px' : '10px';

    if (!meta) {
        return (
            <div style={{ minWidth: minW }}>
                <div style={{ fontWeight: 600, fontSize: labelFs, color, marginBottom: '2px' }}>{sideLabel}</div>
                <div style={{ fontSize: labelFs, color: '#94a3b8' }}>—</div>
            </div>
        );
    }

    // Population demand — no individual agent info
    if (meta.kind === 'population') {
        return (
            <div style={{ minWidth: minW }}>
                <div style={{ fontWeight: 600, fontSize: labelFs, color, marginBottom: '2px' }}>{sideLabel}</div>
                <div style={{ fontWeight: 600, fontSize: nameFs, color: '#e2e8f0' }}>Population</div>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: small ? '4px' : '8px',
                        fontSize: rowFs,
                        color: '#94a3b8',
                    }}
                >
                    <span>{formatNumberWithUnit(meta.quantity, qtyUnit)}</span>
                    <span>{formatNumberWithUnit(meta.price, 'currency', planetId)}</span>
                </div>
                <div
                    style={{
                        fontSize: fillFs,
                        marginTop: '1px',
                        color: meta.fillRate >= 0.99 ? '#4ade80' : meta.fillRate > 0 ? '#fbbf24' : '#94a3b8',
                    }}
                >
                    {meta.fillRate >= 0.99
                        ? `${fillLabel}: ${formatNumberWithUnit(meta.filled, qtyUnit)} (100%)`
                        : `${fillLabel}: ${formatNumberWithUnit(meta.filled, qtyUnit)} (${(meta.fillRate * 100).toFixed(1)}%)`}
                </div>
            </div>
        );
    }

    return (
        <div style={{ minWidth: minW }}>
            <div style={{ fontWeight: 600, fontSize: labelFs, color, marginBottom: '2px' }}>{sideLabel}</div>

            {/* Agent name */}
            <div style={{ fontWeight: 600, fontSize: nameFs, color: '#e2e8f0' }}>
                {meta.agentName}
                {meta.isOwn && (
                    <span
                        style={{
                            marginLeft: '4px',
                            fontSize: small ? '9px' : '10px',
                            fontWeight: 700,
                            color: '#fbbf24',
                            textTransform: 'uppercase' as const,
                            letterSpacing: '0.03em',
                        }}
                    >
                        ← You
                    </span>
                )}
            </div>

            {/* Quantity | Price */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: small ? '4px' : '8px',
                    fontSize: rowFs,
                    color: '#94a3b8',
                }}
            >
                <span>{meta.quantity === 0 ? 'Out of stock' : `${formatNumberWithUnit(meta.quantity, qtyUnit)}`}</span>
                <span>{formatNumberWithUnit(meta.price, 'currency', planetId)}</span>
            </div>

            {/* Fill rate */}
            <div
                style={{
                    fontSize: fillFs,
                    marginTop: '1px',
                    color: meta.fillRate >= 0.99 ? '#4ade80' : meta.fillRate > 0 ? '#fbbf24' : '#94a3b8',
                }}
            >
                {meta.fillRate >= 0.99
                    ? `${fillLabel}: ${formatNumberWithUnit(meta.filled, qtyUnit)} (100%)`
                    : `${fillLabel}: ${formatNumberWithUnit(meta.filled, qtyUnit)} (${(meta.fillRate * 100).toFixed(1)}%)`}
            </div>

            {/* Clearing indicator for own position */}
            {meta.isOwn && meta.fillRate >= 0.99 && (
                <div style={{ fontSize: clearFs, color: '#4ade80', fontWeight: 600 }}>✓ Fully cleared</div>
            )}
            {meta.isOwn && meta.fillRate > 0 && meta.fillRate < 0.99 && (
                <div style={{ fontSize: clearFs, color: '#fbbf24', fontWeight: 600 }}>⏳ Partially cleared</div>
            )}
            {meta.isOwn && meta.fillRate === 0 && (
                <div style={{ fontSize: clearFs, color: '#ef4444', fontWeight: 600 }}>✗ Not cleared</div>
            )}
        </div>
    );
}

// ── Custom Tooltip (always shows both sides) ────────────────────────────────────

function ChartTooltip({
    active,
    payload,
    label,
    planetId,
    resourceName,
}: TooltipProps<number, string> & { planetId: string; resourceName: string }) {
    const isSmallScreen = useIsSmallScreen();

    if (!active || !payload || payload.length === 0) {
        return null;
    }

    const resource = getResourceByName(resourceName);
    const qtyUnit = resource ? resourceFormToUnit(resource.form) : 'units';
    const vol = label as number;

    const supplyEntry = payload.find((p) => p.dataKey === 'Supply');
    const demandEntry = payload.find((p) => p.dataKey === 'Demand');

    const supplyMeta = (supplyEntry?.payload as StepDataPoint | undefined)?.supplyAgent;
    const demandMeta = (demandEntry?.payload as StepDataPoint | undefined)?.demandAgent;

    // If neither side has data, show generic fallback
    if (!supplyMeta && !demandMeta) {
        return (
            <div
                style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: isSmallScreen ? '4px 8px' : '8px 12px',
                    fontSize: isSmallScreen ? '10px' : '12px',
                    color: '#94a3b8',
                }}
            >
                <div>
                    Volume: {formatNumberWithUnit(vol, 'none')} {qtyUnit}
                </div>
            </div>
        );
    }

    const hasOwn = supplyMeta?.isOwn || demandMeta?.isOwn;

    return (
        <div>
            {/* Volume header (always present) */}
            <div
                style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px 6px 0 0',
                    borderBottom: '1px solid #334155',
                    padding: isSmallScreen ? '4px 8px' : '6px 12px',
                    fontSize: isSmallScreen ? '10px' : '11px',
                    color: '#94a3b8',
                    textAlign: 'center' as const,
                }}
            >
                Volume: {formatNumberWithUnit(vol, 'none')} {qtyUnit}
            </div>

            {/* Layout: side-by-side on desktop, stacked on small screens */}
            <div
                style={{
                    backgroundColor: '#1e293b',
                    border: hasOwn ? '2px solid #fbbf24' : '1px solid #334155',
                    borderTop: 'none',
                    borderRadius: '0 0 6px 6px',
                    padding: isSmallScreen ? '6px 8px' : '8px 12px',
                    display: 'flex',
                    flexDirection: isSmallScreen ? 'column' : 'row',
                    gap: isSmallScreen ? '6px' : '16px',
                }}
            >
                <AgentInfoCard
                    meta={supplyMeta}
                    planetId={planetId}
                    qtyUnit={qtyUnit}
                    sideLabel='Supply'
                    fillLabel='Sold'
                    color='#818cf8'
                    small={isSmallScreen}
                />
                <div
                    style={
                        isSmallScreen
                            ? { height: '1px', backgroundColor: '#334155', alignSelf: 'stretch' }
                            : { width: '1px', backgroundColor: '#334155', alignSelf: 'stretch' }
                    }
                />
                <AgentInfoCard
                    meta={demandMeta}
                    planetId={planetId}
                    qtyUnit={qtyUnit}
                    sideLabel='Demand'
                    fillLabel='Bought'
                    color='#ef4444'
                    small={isSmallScreen}
                />
            </div>
        </div>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function MarketStepChart({ market, agentId, planetId }: MarketStepChartProps) {
    const { chartData, xDomain, xTicks, ownSupplyArea, ownDemandArea } = useMemo(() => {
        const { offers, bids, totalSold, populationBids } = market;

        // 1. Process Supply (Sorted by price ascending)
        const sortedOffers = [...offers].sort((a, b) => a.offerPrice - b.offerPrice);
        const supplyPoints: StepDataPoint[] = [];

        // Build a map from cumulative volume to agent metadata for supply
        let cumSupply = 0;
        if (sortedOffers.length > 0) {
            // Starting point — no agent yet
            supplyPoints.push({ volume: 0, Supply: sortedOffers[0].offerPrice, Demand: null });
        }

        sortedOffers.forEach((offer) => {
            cumSupply += offer.lastPlacedQuantity;
            const meta: AgentMeta = {
                agentId: offer.agentId,
                agentName: offer.agentName,
                isOwn: offer.agentId === agentId,
                kind: 'offer',
                price: offer.offerPrice,
                quantity: offer.lastPlacedQuantity,
                filled: offer.lastSold,
                fillRate: offer.sellThrough,
            };
            supplyPoints.push({
                volume: cumSupply,
                Supply: offer.offerPrice,
                Demand: null,
                supplyAgent: meta,
            });
        });

        // 2. Process Demand (Sorted by bid price descending)
        // Combine agent bids and population bids into a unified demand list
        const sortedBids = [...bids].sort((a, b) => b.bidPrice - a.bidPrice);
        const demandPoints: StepDataPoint[] = [];

        let cumDemand = 0;
        if (sortedBids.length > 0 || (populationBids && populationBids.length > 0)) {
            // Build unified demand entries: agent bids + population bins
            const demandEntries: {
                price: number;
                quantity: number;
                filled: number;
                fillRate: number;
                kind: 'bid' | 'population';
                agentId?: string;
                agentName?: string;
                isOwn?: boolean;
                priceMid?: number;
            }[] = [];

            sortedBids.forEach((bid) => {
                demandEntries.push({
                    price: bid.bidPrice,
                    quantity: bid.demandedQuantity,
                    filled: bid.lastBought,
                    fillRate: bid.fillRatio,
                    kind: 'bid',
                    agentId: bid.agentId,
                    agentName: bid.agentName,
                    isOwn: bid.agentId === agentId,
                });
            });

            if (populationBids) {
                // Sort population bins by priceMid descending (highest willingness to pay first)
                const sortedPopulationBids = [...populationBids].sort((a, b) => b.priceMid - a.priceMid);
                sortedPopulationBids.forEach((bin) => {
                    if (bin.demandedQuantity > 0) {
                        demandEntries.push({
                            price: bin.priceMid,
                            quantity: bin.demandedQuantity,
                            filled: bin.lastBought,
                            fillRate: bin.fillRatio,
                            kind: 'population',
                        });
                    }
                });
            }

            // Sort unified demand by price descending
            demandEntries.sort((a, b) => b.price - a.price);

            if (demandEntries.length > 0) {
                demandPoints.push({ volume: 0, Supply: null, Demand: demandEntries[0].price });
            }

            demandEntries.forEach((entry) => {
                cumDemand += entry.quantity;
                const meta: AgentMeta = {
                    agentId: entry.agentId ?? 'population',
                    agentName: entry.agentName ?? 'Population',
                    isOwn: entry.isOwn ?? false,
                    kind: entry.kind,
                    price: entry.price,
                    quantity: entry.quantity,
                    filled: entry.filled,
                    fillRate: entry.fillRate,
                };
                demandPoints.push({
                    volume: cumDemand,
                    Supply: null,
                    Demand: entry.price,
                    demandAgent: meta,
                });
            });
        }

        // 3. Combine steps onto unified timeline
        const allVolumes = Array.from(
            new Set([...supplyPoints.map((p) => p.volume), ...demandPoints.map((p) => p.volume)]),
        ).sort((a, b) => a - b);

        // Two-pointer single pass: supplyPoints and demandPoints are sorted by volume ascending,
        // so we advance indices monotonically rather than doing an O(n²) linear search per volume.
        const fullData: StepDataPoint[] = [];
        let supplyIdx = 0;
        let demandIdx = 0;

        for (const vol of allVolumes) {
            while (supplyIdx < supplyPoints.length && supplyPoints[supplyIdx].volume < vol) {
                supplyIdx++;
            }
            while (demandIdx < demandPoints.length && demandPoints[demandIdx].volume < vol) {
                demandIdx++;
            }

            const supplyPt = supplyIdx < supplyPoints.length ? supplyPoints[supplyIdx] : null;
            const demandPt = demandIdx < demandPoints.length ? demandPoints[demandIdx] : null;

            fullData.push({
                volume: Math.round(vol * 100) / 100,
                Supply: supplyPt?.Supply ?? null,
                Demand: demandPt?.Demand ?? null,
                // Attach active agent meta continuously (not just at exact step boundaries)
                supplyAgent: supplyPt?.supplyAgent,
                demandAgent: demandPt?.demandAgent,
            });
        }

        // 4. Compute x-axis domain centered around totalSold, crop data
        let xDomain: [number, number] | undefined;
        let xTicks: number[] | undefined;
        let croppedData = fullData;
        let ownSupplyArea: { x1: number; x2: number; y: number } | undefined;
        let ownDemandArea: { x1: number; x2: number; y: number } | undefined;

        if (totalSold > 0 && fullData.length > 0) {
            const maxVolume = fullData[fullData.length - 1].volume;
            const halfRange = Math.min(totalSold, maxVolume - totalSold);
            const xMin = Math.max(0, totalSold - halfRange);
            const xMax = totalSold + halfRange;
            xDomain = [xMin, xMax];

            const tickMultipliers = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
            xTicks = tickMultipliers.map((m) => m * totalSold).filter((v) => v >= xMin && v <= xMax);

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
            croppedData = fullData.slice(startIdx, endIdx + 1);
        }

        // 5. Find own-agent steps for "You Are Here" highlight
        const ownSupplyIdx = supplyPoints.findIndex((p) => p.supplyAgent?.isOwn);
        if (ownSupplyIdx > 0) {
            const prevVol = supplyPoints[ownSupplyIdx - 1].volume;
            const curVol = supplyPoints[ownSupplyIdx].volume;
            const price = supplyPoints[ownSupplyIdx].Supply;
            if (price !== null) {
                ownSupplyArea = { x1: prevVol, x2: curVol, y: price };
            }
        }

        const ownDemandIdx = demandPoints.findIndex((p) => p.demandAgent?.isOwn);
        if (ownDemandIdx > 0) {
            const prevVol = demandPoints[ownDemandIdx - 1].volume;
            const curVol = demandPoints[ownDemandIdx].volume;
            const price = demandPoints[ownDemandIdx].Demand;
            if (price !== null) {
                ownDemandArea = { x1: prevVol, x2: curVol, y: price };
            }
        }

        return { chartData: croppedData, xDomain, xTicks, ownSupplyArea, ownDemandArea };
    }, [market, agentId]);

    const resource = getResourceByName(market.resourceName);
    const qtyUnit = resource ? resourceFormToUnit(resource.form) : 'units';
    const totalSold = market.totalSold;

    return (
        <div className='h-[140px]'>
            <ResponsiveContainer width='100%' height='100%'>
                <ComposedChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray='3 3' stroke='#334155' />

                    <XAxis
                        dataKey='volume'
                        type='number'
                        domain={xDomain ?? ['auto', 'auto']}
                        allowDataOverflow={!!xDomain}
                        ticks={xTicks}
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={{ stroke: '#334155' }}
                        tickLine={false}
                        tickFormatter={(v) => `${formatNumberWithUnit(v, qtyUnit)}`}
                    />
                    <YAxis
                        type='number'
                        domain={['dataMin - 0.02', 'dataMax + 0.02']}
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        width={52}
                        tickFormatter={(v) => `${formatNumberWithUnit(v, 'currency', planetId)}`}
                    />
                    <Tooltip
                        content={<ChartTooltip planetId={planetId} resourceName={market.resourceName} />}
                        cursor={{ stroke: '#475569', strokeWidth: 1, strokeDasharray: '4 4' }}
                    />
                    <Legend
                        verticalAlign='bottom'
                        content={({ payload }) => {
                            if (!payload || payload.length === 0) {
                                return null;
                            }
                            const entries = [
                                { label: 'Supply', stroke: '#6366f1', strokeWidth: 2 },
                                { label: 'Demand', stroke: '#d41e18', strokeWidth: 2 },
                                { label: 'Total sold', stroke: '#22c55e', strokeWidth: 2 },
                            ];
                            return (
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'center',
                                        gap: 16,
                                        padding: 0,
                                        flexWrap: 'wrap',
                                    }}
                                >
                                    {entries.map((e) => (
                                        <div
                                            key={e.label}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 5,
                                                fontSize: 11,
                                                color: '#94a3b8',
                                            }}
                                        >
                                            <svg width={16} height={10} viewBox='0 0 16 10'>
                                                <line
                                                    x1={0}
                                                    y1={5}
                                                    x2={16}
                                                    y2={5}
                                                    stroke={e.stroke}
                                                    strokeWidth={e.strokeWidth}
                                                />
                                            </svg>
                                            <span>{e.label}</span>
                                        </div>
                                    ))}
                                </div>
                            );
                        }}
                    />
                    {totalSold > 0 && (
                        <ReferenceLine
                            x={totalSold}
                            stroke='#22c55e'
                            strokeWidth={4}
                            label={{
                                value: `Cleared: ${formatNumbers(totalSold)} ${qtyUnit}`,
                                fill: '#22c55e',
                                position: 'top',
                                fontSize: 10,
                            }}
                        />
                    )}

                    <Area
                        type='stepBefore'
                        dataKey='Supply'
                        stroke='#6366f1'
                        fill='#6365f144'
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                        isAnimationActive={false}
                    />
                    <Area
                        type='stepBefore'
                        dataKey='Demand'
                        stroke='#d41e18'
                        fill='#d41e183a'
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                        isAnimationActive={false}
                    />

                    {ownSupplyArea && (
                        <ReferenceArea
                            x1={ownSupplyArea.x1}
                            x2={ownSupplyArea.x2}
                            stroke='#fbbf24'
                            strokeWidth={2}
                            strokeOpacity={0.9}
                            fill='#fbbf24'
                            fillOpacity={0.08}
                        />
                    )}

                    {ownDemandArea && (
                        <ReferenceArea
                            x1={ownDemandArea.x1}
                            x2={ownDemandArea.x2}
                            stroke='#fbbf24'
                            strokeWidth={2}
                            strokeOpacity={0.9}
                            fill='#fbbf24'
                            fillOpacity={0.08}
                        />
                    )}
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}
