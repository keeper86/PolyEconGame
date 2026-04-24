'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { ALL_RESOURCES } from '@/simulation/planet/resourceCatalog';
import type { TransportableResourceType } from '@/simulation/planet/claims';
import { ProductIcon } from './ProductIcon';

type Props = {
    agentId: string;
    planetId: string;
    /** If provided, only resources whose form matches one of these types will be shown */
    allowedTypes?: TransportableResourceType[];
    value: string;
    onValueChange: (value: string) => void;
    required?: boolean;
    placeholder?: string;
};

export function StorageResourceSelect({
    agentId,
    planetId,
    allowedTypes,
    value,
    onValueChange,
    required,
    placeholder = 'Select resource…',
}: Props) {
    const trpc = useTRPC();
    const { data: storage } = useSimulationQuery(trpc.getAgentPlanetStorage.queryOptions({ agentId, planetId }));

    const options = Object.entries(storage ?? {})
        .filter(([resourceName, qty]) => {
            if (qty <= 0) {
                return false;
            }
            const resource = ALL_RESOURCES.find((r) => r.name === resourceName);
            if (!resource) {
                return false;
            }
            if (resource.form === 'services' || resource.form === 'landBoundResource') {
                return false;
            }
            if (allowedTypes && !allowedTypes.includes(resource.form as TransportableResourceType)) {
                return false;
            }
            return true;
        })
        .sort(([a], [b]) => a.localeCompare(b));

    return (
        <Select value={value} onValueChange={onValueChange} required={required}>
            <SelectTrigger>
                {value ? (
                    <span className='flex items-center gap-2'>
                        <ProductIcon productName={value} size={24} />
                        <span>{value}</span>
                    </span>
                ) : (
                    <SelectValue placeholder={placeholder} />
                )}
            </SelectTrigger>
            <SelectContent>
                {options.length === 0 && (
                    <div className='px-2 py-1.5 text-sm text-muted-foreground'>No matching resources in storage</div>
                )}
                {options.map(([resourceName, qty]) => (
                    <SelectItem key={resourceName} value={resourceName}>
                        <span className='flex items-center gap-2'>
                            <ProductIcon productName={resourceName} size={24} />
                            <span>{resourceName}</span>
                            <span className='ml-auto text-xs text-muted-foreground'>{qty.toLocaleString()}</span>
                        </span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
