import { ProductIcon } from '@/components/client/ProductIcon';
import { formatNumbers } from '@/lib/utils';

import { resourceNameToSlug } from '../../app/planets/[planetId]/agent/[agentId]/market/_components/marketHelpers';
import Link from 'next/link';

export type ResourceEntry = { resource: { name: string }; quantity: number };

export function fillColor(efficiency: number, isLimiting: boolean): string {
    if (isLimiting) {
        return 'bg-red-500/30';
    }
    if (efficiency < 0.95) {
        return 'bg-amber-400/30';
    }
    return 'bg-green-500/30';
}

export function borderColor(efficiency: number, isLimiting: boolean): string {
    if (isLimiting) {
        return 'border border-red-500';
    }
    if (efficiency < 0.95) {
        return 'border border-amber-400';
    }
    return 'border border-green-500';
}

export function ProductQuantity({
    resource,
    quantity,
    efficiency,
    isLimiting,
    planetId,
    agentId,
    quantityLabel,
}: ResourceEntry & {
    efficiency: number;
    isLimiting: boolean;
    planetId: string | null;
    agentId: string | null;
    quantityLabel?: string;
}): React.ReactElement {
    const href =
        planetId && agentId
            ? `/planets/${planetId}/agent/${agentId}/market#${resourceNameToSlug(resource.name)}`
            : null;
    const isUnknown = quantityLabel !== undefined;
    return (
        <Link
            href={(href ?? '#') as never}
            className={`relative inline-flex flex-col items-center gap-1.5 rounded bg-muted px-2 py-1 overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all ${borderColor(efficiency, isLimiting)}`}
        >
            {!isUnknown && (
                <span
                    className={`absolute bottom-0 left-0 right-0 ${fillColor(efficiency, isLimiting)}  transition-all`}
                    style={{ height: `${Math.round(efficiency * 100)}%` }}
                />
            )}
            <span className='relative z-10 inline-flex flex-col items-center gap-1.5 text-xs text-outline-strong'>
                <ProductIcon productName={resource.name} />
                {isUnknown ? <span className='text-muted-foreground'>{quantityLabel}</span> : formatNumbers(quantity)}
            </span>
        </Link>
    );
}
