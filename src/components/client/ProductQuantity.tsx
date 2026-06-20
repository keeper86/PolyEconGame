import { ProductIcon } from '@/components/client/ProductIcon';
import { formatNumberWithUnit } from '@/lib/utils';

import type { ResourceQuantity } from '@/simulation/planet/claims';
import Link from 'next/link';
import { resourceNameToSlug } from '../../app/planets/[planetId]/agent/[agentId]/market/_components/marketHelpers';

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

function wrapInLink(children: React.ReactNode, href: string | null): React.ReactElement {
    if (href === null) {
        return <>{children}</>;
    }
    return <Link href={href as never}>{children}</Link>;
}

export function ProductQuantity({
    resource,
    quantity,
    efficiency,
    isLimiting,
    planetId,
    agentId,
    quantityLabel,
}: ResourceQuantity & {
    efficiency: number;
    isLimiting: boolean;
    planetId: string | null;
    agentId: string | null;
    quantityLabel?: string;
}): React.ReactElement {
    const getHref = () => {
        if (planetId) {
            if (resource.form === 'landBoundResource') {
                return `/planets/${planetId}/claims#${resourceNameToSlug(resource.name)}`;
            }
            if (agentId) {
                return `/planets/${planetId}/agent/${agentId}/market#${resourceNameToSlug(resource.name)}`;
            }
        }
        return null;
    };

    const isUnknown = quantityLabel !== undefined;
    const href = getHref();

    return wrapInLink(
        <div
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
                {isUnknown ? (
                    <span className='text-muted-foreground'>{quantityLabel}</span>
                ) : (
                    formatNumberWithUnit(quantity, 'units')
                )}
            </span>
        </div>,
        href,
    );
}
