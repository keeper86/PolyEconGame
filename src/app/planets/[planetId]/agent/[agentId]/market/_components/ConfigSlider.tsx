'use client';

import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';

function fmt(v: number, isPercent: boolean, dt?: (v: number) => number): string {
    const display = dt ? dt(v) : v;
    if (isPercent) {
        return `${Math.round(display * 100)}%`;
    }
    return display.toFixed(display % 1 === 0 ? 0 : 2);
}

export function ConfigSlider({
    label,
    value,
    committed,
    min,
    max,
    step,
    onChange,
    disabled,
    displayTransform,
    inverted,
    isPercent,
}: {
    label: string;
    value: number;
    committed?: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
    disabled: boolean;
    displayTransform?: (v: number) => number;
    inverted?: boolean;
    isPercent?: boolean;
}): React.ReactElement {
    const clamped = Math.max(min, Math.min(max, value));
    const committedClamped = committed !== undefined ? Math.max(min, Math.min(max, committed)) : undefined;
    const committedFrac = committedClamped !== undefined ? (committedClamped - min) / (max - min) : undefined;
    const committedFracInverted = committedFrac !== undefined ? 1 - committedFrac : undefined;
    const invertedSliderVal = inverted ? max - clamped + min : clamped;
    const showCommitted = committed !== undefined && committed !== clamped;

    return (
        <div className={`space-y-1${disabled ? ' opacity-50' : ''}`}>
            <div className='flex items-center justify-between'>
                <Label className='text-[11px] text-muted-foreground'>{label}</Label>
                <span className='text-[11px] tabular-nums font-medium'>
                    {fmt(clamped, !!isPercent, displayTransform)}
                    <span className='ml-1 text-[9px] text-muted-foreground'>
                        {showCommitted ? `(now ${fmt(committed!, !!isPercent, displayTransform)})` : ''}
                    </span>
                </span>
            </div>
            <div className='relative'>
                <Slider
                    min={min}
                    max={max}
                    step={step}
                    value={[invertedSliderVal]}
                    onValueChange={([v]) => {
                        if (v !== undefined) {
                            const actualVal = inverted ? max - v + min : v;
                            onChange(actualVal);
                        }
                    }}
                    disabled={disabled}
                    className='w-full'
                    inverted={inverted}
                />
                <div
                    className={`absolute top-0 w-0.5 h-4 bg-foreground/40 rounded-full pointer-events-none ${
                        committedFrac !== undefined ? '' : 'opacity-0'
                    }`}
                    style={{
                        left: `${((inverted ? committedFracInverted : committedFrac) ?? 0) * 100}%`,
                        transform: 'translateX(-50%)',
                        top: '2px',
                    }}
                />
            </div>
            <div className='flex justify-between text-[9px] text-muted-foreground'>
                <span>{fmt(min, !!isPercent, displayTransform)}</span>
                <span>{fmt(max, !!isPercent, displayTransform)}</span>
            </div>
        </div>
    );
}

export function ConfigRangeSlider({
    label,
    valueLow,
    valueHigh,
    committedLow,
    committedHigh,
    min,
    max,
    step,
    onChange,
    disabled,
    isPercent,
}: {
    label: string;
    valueLow: number;
    valueHigh: number;
    committedLow?: number;
    committedHigh?: number;
    min: number;
    max: number;
    step: number;
    onChange: (low: number, high: number) => void;
    disabled: boolean;
    isPercent?: boolean;
}): React.ReactElement {
    const clampedLow = Math.max(min, Math.min(max, valueLow));
    const clampedHigh = Math.max(min, Math.min(max, valueHigh));

    const committedClampedLow = committedLow !== undefined ? Math.max(min, Math.min(max, committedLow)) : undefined;
    const committedClampedHigh = committedHigh !== undefined ? Math.max(min, Math.min(max, committedHigh)) : undefined;
    const commitFracLow = committedClampedLow !== undefined ? (committedClampedLow - min) / (max - min) : undefined;
    const commitFracHigh = committedClampedHigh !== undefined ? (committedClampedHigh - min) / (max - min) : undefined;

    const showCommittedLow = committedLow !== undefined && committedLow !== clampedLow;
    const showCommittedHigh = committedHigh !== undefined && committedHigh !== clampedHigh;

    const fmt = (v: number): string => {
        if (isPercent) {
            return `${Math.round(v * 100)}%`;
        }
        return v.toFixed(v % 1 === 0 ? 0 : 2);
    };

    return (
        <div className='space-y-1'>
            <div className='flex items-center justify-between'>
                <Label className='text-[11px] text-muted-foreground'>{label}</Label>
                <span className='text-[11px] tabular-nums font-medium'>
                    {fmt(clampedLow)} — {fmt(clampedHigh)}
                    <span className='ml-1 text-[9px] text-muted-foreground'>
                        {showCommittedLow || showCommittedHigh
                            ? `(current: ${showCommittedLow ? fmt(committedLow!) : fmt(clampedLow)} — ${showCommittedHigh ? fmt(committedHigh!) : fmt(clampedHigh)})`
                            : ''}
                    </span>
                </span>
            </div>
            <div className='relative'>
                <Slider
                    min={min}
                    max={max}
                    step={step}
                    value={[clampedLow, clampedHigh]}
                    onValueChange={([low, high]) => {
                        if (low !== undefined && high !== undefined) {
                            onChange(low, high);
                        }
                    }}
                    disabled={disabled}
                    className='w-full'
                />
                <div
                    className={`absolute top-0 w-0.5 h-4 bg-foreground/40 rounded-full pointer-events-none ${
                        commitFracLow !== undefined ? '' : 'opacity-0'
                    }`}
                    style={{
                        left: `${(commitFracLow ?? 0) * 100}%`,
                        transform: 'translateX(-50%)',
                        top: '2px',
                    }}
                />
                <div
                    className={`absolute top-0 w-0.5 h-4 bg-foreground/40 rounded-full pointer-events-none ${
                        commitFracHigh !== undefined ? '' : 'opacity-0'
                    }`}
                    style={{
                        left: `${(commitFracHigh ?? 0) * 100}%`,
                        transform: 'translateX(-50%)',
                        top: '2px',
                    }}
                />
            </div>
            <div className='flex justify-between text-[9px] text-muted-foreground'>
                <span>{fmt(min)}</span>
                <span>{fmt(max)}</span>
            </div>
        </div>
    );
}
