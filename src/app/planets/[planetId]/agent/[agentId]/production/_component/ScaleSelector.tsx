'use client';

import React from 'react';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';

const MAX_SCALE = 100;

export function ScaleSelector({
    value,
    min,
    onChange,
}: {
    value: number;
    min: number;
    onChange: (v: number) => void;
}): React.ReactElement {
    return (
        <div className='flex items-center gap-2'>
            <Slider
                min={min}
                max={MAX_SCALE}
                step={1}
                value={[value]}
                onValueChange={([v]) => onChange(v)}
                className='flex-1'
            />
            <Input
                type='number'
                min={min}
                max={MAX_SCALE}
                value={value}
                onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n)) {
                        onChange(Math.max(min, Math.min(MAX_SCALE, n)));
                    }
                }}
                className='w-16 text-center tabular-nums'
            />
        </div>
    );
}
