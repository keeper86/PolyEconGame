'use client';

import { formatNumberWithUnit } from '@/lib/utils';
import type { TooltipProps } from 'recharts';
import { useLocale } from 'next-intl';

type Props = TooltipProps<number, string> & {
    labelFormatter?: (label: number) => string;
    planetId?: string;
};

export function FinancialTooltip({ active, payload, label, labelFormatter, planetId }: Props) {
    const locale = useLocale();
    if (!active || !payload || payload.length === 0) {
        return null;
    }
    const visible = payload.filter((entry) => !String(entry.dataKey).startsWith('ghost'));
    if (visible.length === 0) {
        return null;
    }

    const cashValue = visible.find((e) => e.dataKey === 'cashBalance')?.value;
    const assetValue = visible.find((e) => e.dataKey === 'assetValue')?.value;
    const entries =
        typeof cashValue === 'number' && typeof assetValue === 'number'
            ? visible.map((e) => (e.dataKey === 'assetValue' ? { ...e, value: cashValue + (e.value as number) } : e))
            : visible;

    const colEntry = entries.find((e) => e.dataKey === 'costOfLiving');
    const diffEntry = entries.find((e) => e.dataKey === 'costOfLivingRichDiff');
    const combinedEntry =
        colEntry && diffEntry
            ? {
                  color: colEntry.color,
                  name: colEntry.name,
                  low: colEntry.value as number,
                  high: (colEntry.value as number) + (diffEntry.value as number),
              }
            : null;

    const otherEntries = entries.filter((e) => e.dataKey !== 'costOfLiving' && e.dataKey !== 'costOfLivingRichDiff');

    return (
        <div
            style={{
                background: '#1e293b',
                border: '1px solid #334155',
                fontSize: 12,
                padding: '6px 10px',
                borderRadius: 4,
            }}
        >
            <p style={{ color: '#94a3b8', marginBottom: 4 }}>
                {labelFormatter ? labelFormatter(label as number) : label}
            </p>
            {combinedEntry ? (
                <div
                    style={{
                        color: '#e2e8f0',
                        margin: '1px 0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                    }}
                >
                    <span style={{ color: combinedEntry.color }}>{combinedEntry.name}</span>
                    <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {formatNumberWithUnit(combinedEntry.low, 'currency', planetId, locale)}
                        {' — '}
                        {formatNumberWithUnit(combinedEntry.high, 'currency', planetId, locale)}
                    </span>
                </div>
            ) : null}
            {otherEntries.map((entry) => (
                <div
                    key={entry.dataKey}
                    style={{
                        color: '#e2e8f0',
                        margin: '1px 0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                    }}
                >
                    <span style={{ color: entry.color }}>{entry.name}</span>
                    <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {entry.value !== null && entry.value !== undefined
                            ? formatNumberWithUnit(entry.value, 'currency', planetId, locale)
                            : ''}
                    </span>
                </div>
            ))}
        </div>
    );
}
