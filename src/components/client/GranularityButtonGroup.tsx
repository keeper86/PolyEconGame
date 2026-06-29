'use client';

import { useSimulationTick } from '@/hooks/useSimulationQuery';
import { TICKS_PER_YEAR } from '@/simulation/constants';
import React, { useState } from 'react';

export type Granularity = 'monthly' | 'yearly' | 'decade';

function GranularityButton({
    active,
    disabled,
    onClick,
    children,
}: {
    active: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={[
                'px-2 py-0.5 rounded text-[11px] transition-colors',
                active
                    ? 'bg-slate-600 text-slate-100'
                    : disabled
                      ? 'text-slate-600 cursor-not-allowed'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700',
            ].join(' ')}
        >
            {children}
        </button>
    );
}

type GranularityButtonGroupProps = {
    granularity: Granularity;
    onChange: (g: Granularity) => void;
    currentTick: number;
};

export function GranularityButtonGroup({ granularity, onChange, currentTick }: GranularityButtonGroupProps) {
    const yearsElapsed = currentTick / TICKS_PER_YEAR;
    const showYearly = yearsElapsed >= 2;
    const showDecade = yearsElapsed >= 10;

    return (
        <div className='flex gap-1'>
            <GranularityButton active={granularity === 'monthly'} onClick={() => onChange('monthly')}>
                Monthly
            </GranularityButton>
            <GranularityButton
                active={granularity === 'yearly'}
                disabled={!showYearly}
                onClick={() => onChange('yearly')}
            >
                Yearly
            </GranularityButton>
            <GranularityButton
                active={granularity === 'decade'}
                disabled={!showDecade}
                onClick={() => onChange('decade')}
            >
                Decade
            </GranularityButton>
        </div>
    );
}

/** Hook that encapsulates the common granularity state + currentTick. */
export function useGranularity(): {
    granularity: Granularity;
    setGranularity: React.Dispatch<React.SetStateAction<Granularity>>;
    currentTick: number;
} {
    const [granularity, setGranularity] = useState<Granularity>('monthly');
    const currentTick = useSimulationTick();
    return { granularity, setGranularity, currentTick };
}

type GranularityHeaderProps = {
    title: string;
    icon?: React.ReactNode;
    granularity: Granularity;
    onGranularityChange: (g: Granularity) => void;
    currentTick: number;
    /** Additional class names for the container span (in addition to `flex justify-between items-center`). */
    className?: string;
    /** Class names for the title paragraph. Defaults to `text-sm font-semibold flex items-center gap-2`. */
    titleClassName?: string;
};

/** Renders the preferred flex justify-between layout with title + icon + granularity toggle. */
export function GranularityHeader({
    title,
    icon,
    granularity,
    onGranularityChange,
    currentTick,
    className,
    titleClassName,
}: GranularityHeaderProps) {
    return (
        <span className={`flex justify-between items-center${className ? ` ${className}` : ''}`}>
            <p className={titleClassName ?? 'text-sm font-semibold flex items-center gap-2'}>
                {icon}
                {title}
            </p>
            <GranularityButtonGroup
                granularity={granularity}
                onChange={onGranularityChange}
                currentTick={currentTick}
            />
        </span>
    );
}
