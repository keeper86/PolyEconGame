import { defaultHeight } from '@/components/client/FacilityOrShipIcon';
import React from 'react';

export function CardHeaderBlock({
    title,
    titleClassName,
    badge,
    details,
}: {
    title: React.ReactNode;
    titleClassName: string;
    badge: React.ReactNode;
    details: React.ReactNode;
}): React.ReactElement {
    return (
        <span className='flex flex-col space-between gap-2' style={{ minHeight: `${defaultHeight}px` }}>
            <div className='flex items-center gap-1 flex-col mb-1'>
                <h3 className={`font-semibold leading-tight ${titleClassName}`}>{title}</h3>
                <span className='flex flex-col items-center gap-1'>{badge}</span>
            </div>
            {details !== null && <span className='flex flex-col text-muted-foreground text-xs gap-2'>{details}</span>}
        </span>
    );
}
