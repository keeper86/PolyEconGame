'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ProductIcon } from '@/components/client/ProductIcon';

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
    /** Planet id used to pick the correct currency image */
    planetId: string;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Maps a planet id to the asset key for its currency image. */
function currencyAssetKey(planetId: string): string {
    // The manifest keys are: cur_earth, cur_gune, cur_icedonia, cur_paradies, cur_suerte, cur_pandara, cur_alpha_centauri
    const normalized = planetId.toLowerCase().replace(/-/g, '_');
    return `cur_${normalized}`;
}

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
    planetId,
}: CreditButtonProps): React.ReactElement {
    const currencyKey = currencyAssetKey(planetId);

    if (variant === 'large') {
        return (
            <Button
                className='w-full h-14 flex flex-col gap-0.5 bg-green-600 hover:bg-green-700 text-white dark:bg-green-700 dark:hover:bg-green-600'
                disabled={disabled || isPending}
                onClick={onClick}
            >
                <ProductIcon productName={currencyKey} size={20} />
                <span className='text-sm font-semibold leading-none'>{isPending ? '…' : label}</span>
            </Button>
        );
    }

    /* Fill fraction: 1 = full, 0.5 = half, 0.25 = quarter */
    const fillFraction = isFull ? 1 : label === '50 %' ? 0.5 : 0.25;

    return (
        <Button
            className={cn(
                'flex-1 h-14 flex flex-col gap-0.5 relative overflow-hidden  text-outline-strong',
                'border border-green-600 bg-transparent hover:bg-green-50 dark:border-green-500 dark:hover:bg-green-600',
            )}
            disabled={disabled || isPending}
            onClick={onClick}
        >
            {/* Fill bar */}
            {fillFraction > 0 && (
                <span
                    className='absolute bottom-0 left-0 right-0 bg-green-600/20 dark:bg-green-500/20 pointer-events-none'
                    style={{ height: `${fillFraction * 100}%` }}
                />
            )}

            {/* Content */}
            <span className='relative z-10 flex flex-row items-center'>
                {amount && !isPending && <span className='text-[16px] leading-none'>{amount}</span>}
                <ProductIcon productName={currencyKey} size={16} />
            </span>
        </Button>
    );
}
