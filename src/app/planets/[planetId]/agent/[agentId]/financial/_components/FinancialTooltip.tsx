'use client';

import { formatNumbers } from '@/lib/utils';
import type { TooltipProps } from 'recharts';

type Props = TooltipProps<number, string> & {
    labelFormatter?: (label: number) => string;
};

export function FinancialTooltip({ active, payload, label, labelFormatter }: Props) {
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
                <p key={entry.dataKey} style={{ color: '#e2e8f0', margin: '1px 0' }}>
                    <span style={{ color: entry.color }}>{entry.name}</span>:{' '}
                    {entry.value !== null && entry.value !== undefined ? formatNumbers(entry.value) : ''}
                </p>
            ))}
        </div>
    );
}
