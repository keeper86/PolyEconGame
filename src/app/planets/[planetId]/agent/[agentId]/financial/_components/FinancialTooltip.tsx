'use client';

import { formatNumberWithUnit } from '@/lib/utils';
import type { TooltipProps } from 'recharts';

type Props = TooltipProps<number, string> & {
    labelFormatter?: (label: number) => string;
    planetId?: string;
};

export function FinancialTooltip({ active, payload, label, labelFormatter, planetId }: Props) {
    if (!active || !payload || payload.length === 0) {
        return null;
    }
    const visible = payload.filter((entry) => !String(entry.dataKey).startsWith('ghost'));
    if (visible.length === 0) {
        return null;
    }
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
            {visible.map((entry) => (
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
                            ? formatNumberWithUnit(entry.value, 'currency', planetId)
                            : ''}
                    </span>
                </div>
            ))}
        </div>
    );
}
