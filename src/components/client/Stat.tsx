'use client';

import React from 'react';

export function Stat({
    label,
    value,
    icon,
    valueClassName,
    indent,
    bold,
}: {
    label: React.ReactNode;
    value: React.ReactNode;
    icon?: React.ReactNode;
    valueClassName?: string;
    indent?: boolean;
    bold?: boolean;
}): React.ReactElement {
    return (
        <div className={`flex justify-between gap-2 ${indent ? 'pl-3' : ''}`}>
            <span
                className={`flex items-center gap-1 text-xs truncate ${bold ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
            >
                {icon}
                {label}
            </span>
            <span
                className={`tabular-nums whitespace-nowrap text-xs ${bold ? 'font-semibold' : 'font-medium'} ${valueClassName ?? ''}`}
            >
                {value}
            </span>
        </div>
    );
}
