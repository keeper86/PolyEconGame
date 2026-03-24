'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { formatNumbers } from '@/lib/utils';
import { useIsSmallScreen } from '@/hooks/useMobile';

export type MarketSnapshot = {
    clearingPrice: number;
    totalDemand: number;
    totalSupply: number;
    totalSold: number;
    fillRatio: number;
    unfilledDemand: number;
    unsoldSupply: number;
};

type Props = {
    market: MarketSnapshot;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fillRatioLabel(ratio: number): string {
    if (ratio >= 0.999) {
        return 'Fully satisfied';
    }
    if (ratio >= 0.8) {
        return 'Mostly satisfied';
    }
    if (ratio >= 0.5) {
        return 'Partial shortage';
    }
    return 'Severe shortage';
}

function fillRatioColor(ratio: number): string {
    if (ratio >= 0.999) {
        return '#22c55e';
    } // green-500
    if (ratio >= 0.8) {
        return '#f59e0b';
    } // amber-500
    if (ratio >= 0.5) {
        return '#f97316';
    } // orange-500
    return '#ef4444'; // red-500
}

// ─── Card data ────────────────────────────────────────────────────────────────

type CardDef = {
    label: string;
    value: string;
    sub: string;
    accentColor: string;
};

function buildCards(m: MarketSnapshot): CardDef[] {
    const supply2demand = m.totalDemand > 0 ? formatNumbers((m.totalSupply / m.totalDemand) * 100) + '%' : '—';
    const soldPct = m.totalSupply > 0 ? formatNumbers((m.totalSold / m.totalSupply) * 100) + '%' : '—';

    return [
        {
            label: 'Clearing price',
            value: formatNumbers(m.clearingPrice),
            sub: 'currency / ton (VWAP)',
            accentColor: '#f59e0b',
        },
        {
            label: 'Supply offered',
            value: formatNumbers(m.totalSupply),
            sub: `${supply2demand} of demand`,
            accentColor: '#60a5fa',
        },
        {
            label: 'Demand',
            value: formatNumbers(m.totalDemand),
            sub: 'total bid quantity (units)',
            accentColor: '#a78bfa',
        },
        {
            label: 'Market fill',
            value: formatNumbers(m.fillRatio * 100) + '%',
            sub: `${soldPct} of supply sold · ${fillRatioLabel(m.fillRatio)}`,
            accentColor: fillRatioColor(m.fillRatio),
        },
        {
            label: 'Unfilled demand',
            value: formatNumbers(m.unfilledDemand),
            sub: 'units of bids with no matching ask',
            accentColor: m.unfilledDemand > 0 ? '#f97316' : '#22c55e',
        },
        {
            label: 'Unsold supply',
            value: formatNumbers(m.unsoldSupply),
            sub: 'units of asks below any bid',
            accentColor: m.unsoldSupply > 0 ? '#94a3b8' : '#22c55e',
        },
    ];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MarketSummaryCards({ market }: Props): React.ReactElement {
    const isSmall = useIsSmallScreen();
    const cards = buildCards(market);

    if (isSmall) {
        return (
            <div className='flex flex-wrap gap-1 mb-2'>
                {cards.map((c) => (
                    <div
                        key={c.label}
                        className='flex-1 min-w-[calc(50%-0.25rem)] px-1.5 py-1 border rounded text-xs'
                        style={{ borderLeftColor: c.accentColor, borderLeftWidth: 3 }}
                    >
                        <div className='text-muted-foreground text-[9px] leading-tight truncate'>{c.label}</div>
                        <div className='font-semibold text-[11px] leading-tight' style={{ color: c.accentColor }}>
                            {c.value}
                        </div>
                        <div className='text-[9px] text-muted-foreground leading-tight'>{c.sub}</div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className='flex flex-wrap gap-2 mb-3'>
            {cards.map((c) => (
                <Card
                    key={c.label}
                    className='flex-1 min-w-[140px] overflow-hidden'
                    style={{ borderLeftColor: c.accentColor, borderLeftWidth: 3 }}
                >
                    <CardContent className='px-3 py-2.5 space-y-0.5'>
                        <p className='text-[11px] text-muted-foreground font-medium'>{c.label}</p>
                        <p className='text-lg font-semibold leading-tight' style={{ color: c.accentColor }}>
                            {c.value}
                        </p>
                        <p className='text-xs text-muted-foreground'>{c.sub}</p>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
