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
    variant?: 'loan' | 'payback' | 'starter';
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
    variant = 'loan',
    planetId,
}: CreditButtonProps): React.ReactElement {
    const currencyKey = currencyAssetKey(planetId);

    const isGreen = variant === 'loan' || variant === 'starter';
    const size = variant === 'starter' ? 14 : 14;

    /* Fill fraction: 1 = full, 0.5 = half, 0.25 = quarter */
    const fillFraction = isFull ? 1 : label === '50 %' ? 0.5 : 0.25;

    return (
        <Button
            variant='outline'
            className={cn(
                'w-full flex flex-col gap-0.5 relative overflow-hidden text-outline-strong border',
                isGreen
                    ? 'border-green-600 bg-transparent hover:bg-green-50 dark:border-green-500 dark:hover:bg-green-600'
                    : 'border-amber-600 bg-transparent hover:bg-amber-50 dark:border-amber-500 dark:hover:bg-amber-600',
            )}
            style={{ height: variant === 'starter' ? size * 3 : size * 3 }}
            disabled={disabled || isPending}
            onClick={onClick}
        >
            {/* Fill bar */}
            {fillFraction > 0 && (
                <span
                    className={cn(
                        'absolute bottom-0 left-0 right-0 pointer-events-none',
                        isGreen ? 'bg-green-600/20 dark:bg-green-500/20' : 'bg-amber-600/20 dark:bg-amber-500/20',
                    )}
                    style={{ height: `${fillFraction * 100}%` }}
                />
            )}

            {/* Content */}
            <span className='relative z-10 flex flex-row items-center'>
                {amount && !isPending && <span style={{ fontSize: size, lineHeight: 1 }}>{amount}</span>}
                {variant === 'starter' && !isPending && <span style={{ fontSize: size, lineHeight: 1 }}>{label}</span>}
                <ProductIcon productName={currencyKey} size={size} />
            </span>
        </Button>
    );
}
