'use client';

import { BadgeDollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

type CreditButtonProps = {
    /** Primary label displayed on the button (e.g. "25 %", "100 %", "Take initial loan …") */
    label: string;
    /** Formatted amount shown below the label (omitted for the large variant) */
    amount?: string;
    /** When true the button uses the filled green style; otherwise an outline */
    isFull?: boolean;
    /** Whether the button is disabled */
    disabled?: boolean;
    /** When true shows "Processing…" instead of the label */
    isPending?: boolean;
    /** Click handler */
    onClick: () => void;
    /** Visual size variant */
    variant?: 'default' | 'large';
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CreditButton({
    label,
    amount,
    isFull = false,
    disabled = false,
    isPending = false,
    onClick,
    variant = 'default',
}: CreditButtonProps): React.ReactElement {
    if (variant === 'large') {
        return (
            <Button
                className='w-full h-14 flex flex-col gap-0.5 bg-green-600 hover:bg-green-700 text-white dark:bg-green-700 dark:hover:bg-green-600'
                disabled={disabled || isPending}
                onClick={onClick}
            >
                <BadgeDollarSign className='h-5 w-5' />
                <span className='text-sm font-semibold leading-none'>{isPending ? 'Processing…' : label}</span>
            </Button>
        );
    }

    return (
        <Button
            className={`flex-1 h-14 flex flex-col gap-0.5 ${
                isFull
                    ? 'bg-green-600 hover:bg-green-700 text-white dark:bg-green-700 dark:hover:bg-green-600'
                    : 'border border-green-600 text-green-700 bg-transparent hover:bg-green-50 dark:text-green-400 dark:border-green-500 dark:hover:bg-green-950'
            }`}
            disabled={disabled || isPending}
            onClick={onClick}
        >
            <BadgeDollarSign className='h-4 w-4' />
            <span className='text-xs font-semibold leading-none'>{isPending ? 'Processing…' : label}</span>
            {amount && <span className='text-[10px] leading-none opacity-75'>{amount}</span>}
        </Button>
    );
}
