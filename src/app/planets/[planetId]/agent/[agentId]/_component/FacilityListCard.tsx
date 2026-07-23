import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { Card, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function FacilityOrShipListCard({
    name,
    count,
    subtitle,
    className,
    unknown,
}: {
    name: string;
    count?: number;
    subtitle?: string;
    className?: string;
    unknown?: boolean;
}): React.ReactElement {
    const displayName = name.replace(/_/g, ' ');
    return (
        <Card className={cn('overflow-hidden flex flex-col min-w-[155px]', className)}>
            <CardHeader className='p-1 pb-2'>
                <span className='flex flex-col items-center gap-1 flex-wrap-reverse text-sm'>
                    <FacilityOrShipIcon facilityOrShipName={unknown ? 'unknown' : name} size={150} badge={count} />
                    {displayName}
                    {subtitle && <span className='text-[10px] text-muted-foreground'>{subtitle}</span>}
                </span>
            </CardHeader>
        </Card>
    );
}
