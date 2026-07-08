'use client';

import React from 'react';
import { Slider } from '@/components/ui/slider';
import { formatNumberWithUnit } from '@/lib/utils';

interface LogSliderProps {
    /** The discrete values corresponding to each slider step, e.g. [1, 10, 100, 1000] */
    values: number[];
    /** Currently selected index into `values` */
    value: number;
    /** Called with the new index when the user drags the slider */
    onValueChange: (index: number) => void;
    disabled?: boolean;
    /** Optional formatter for the label text. Defaults to `String(value)`. */
    formatLabel?: (value: number) => string;
    className?: string;
}

export function LogSlider({
    values,
    value,
    onValueChange,
    disabled = false,
    formatLabel,
    className,
}: LogSliderProps): React.ReactElement {
    const labelFormatter = formatLabel ?? ((v: number) => formatNumberWithUnit(v, 'none'));

    // Degenerate case: fewer than 2 values → render a disabled, minimal slider stub
    if (values.length < 2) {
        return (
            <div className={className}>
                <Slider min={0} max={1} step={1} value={[0]} disabled />
                <div className='relative h-4 text-[10px] text-muted-foreground mt-2'>
                    {values.length === 1 && (
                        <span className='absolute' style={{ left: '50%', transform: 'translateX(-50%)' }}>
                            {labelFormatter(values[0]!)}
                        </span>
                    )}
                </div>
            </div>
        );
    }

    const maxIndex = values.length - 1;

    return (
        <div className={className}>
            <Slider
                min={0}
                max={maxIndex}
                step={1}
                value={[value]}
                onValueChange={([v]) => onValueChange(v ?? 0)}
                disabled={disabled}
            />
            <div className='relative h-4 text-[10px] text-muted-foreground mt-2'>
                {values.map((v, i) => {
                    const midpoint = maxIndex / 2;
                    // Spread labels apart from the centre to reduce overlap when values
                    // grow exponentially while slider positions are linear.
                    const pct = (i / maxIndex) * 100 - (i - midpoint) * 0.3;
                    const translate = i === maxIndex ? '-80%' : '-40%';
                    return (
                        <span
                            key={i}
                            className='absolute'
                            style={{ left: `${pct}%`, transform: `translateX(${translate})` }}
                        >
                            {labelFormatter(v)}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
