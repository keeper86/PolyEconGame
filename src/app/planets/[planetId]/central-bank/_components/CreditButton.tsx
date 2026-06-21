'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ProductIcon } from '@/components/client/ProductIcon';

type CreditButtonProps = {
    label: string;

    amount?: string;

    isFull?: boolean;

    disabled?: boolean;

    isPending?: boolean;

    onClick: () => void;

    variant?: 'loan' | 'payback' | 'starter';

    planetId: string;
};

function currencyAssetKey(planetId: string): string {
    const normalized = planetId.toLowerCase().replace(/-/g, '_');
    return `cur_${normalized}`;
}

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

    const fillFraction = isFull ? 1 : label === '50 %' ? 0.5 : 0.25;

    return (
        <Button
            variant='outline'
            data-tour='starter-loan'
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
            {fillFraction > 0 && (
                <span
                    className={cn(
                        'absolute bottom-0 left-0 right-0 pointer-events-none',
                        isGreen ? 'bg-green-600/20 dark:bg-green-500/20' : 'bg-amber-600/20 dark:bg-amber-500/20',
                    )}
                    style={{ height: `${fillFraction * 100}%` }}
                />
            )}

            <span className='relative z-10 flex flex-row items-center'>
                {amount && !isPending && <span style={{ fontSize: size, lineHeight: 1 }}>{amount}</span>}
                {variant === 'starter' && !isPending && <span style={{ fontSize: size, lineHeight: 1 }}>{label}</span>}
                <ProductIcon productName={currencyKey} size={size} />
            </span>
        </Button>
    );
}
