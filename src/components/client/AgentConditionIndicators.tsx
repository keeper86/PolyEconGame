'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAgentId } from '@/hooks/useAgentId';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { Users, Warehouse } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Spinner } from '../ui/spinner';

export function hrProductivityColor(value: number): string {
    if (value < 0.8) {
        return 'text-red-600';
    }
    if (value < 0.95) {
        return 'text-amber-600';
    }
    return 'text-green-600';
}

export function storageStarvationColor(ss: number): string {
    if (ss > 0.75) {
        return 'text-red-700';
    }
    if (ss > 0.5) {
        return 'text-red-600';
    }
    if (ss > 0.25) {
        return 'text-orange-500';
    }
    if (ss > 0.1) {
        return 'text-yellow-500';
    }
    return 'text-green-600';
}

export default function AgentConditionIndicators() {
    const params = useParams<'/planets/[planetId]'>();
    const planetId = params.planetId;
    const { agentId, isLoading: agentLoading } = useAgentId();
    if (agentLoading) {
        return <Spinner />;
    }
    if (!planetId || !agentId) {
        return null;
    }
    return <ConditionIndicators agentId={agentId} planetId={planetId} />;
}

function ConditionIndicators({ agentId, planetId }: { agentId: string; planetId: string }) {
    const trpc = useTRPC();
    const t = useTranslations('Agent');
    const { data, isLoading } = useSimulationQuery(
        trpc.simulation.getAgentConditions.queryOptions({ agentId, planetId }),
    );
    if (isLoading) {
        return <Spinner />;
    }
    if (!data) {
        return null;
    }

    const hr = data.hrProductivityMultiplier;
    const ss = data.storageStarvation;

    return (
        <div className='flex items-center gap-2'>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Link
                        href={`/planets/${planetId}/agent/${agentId}/workforce` as never}
                        className='flex items-center'
                    >
                        <Users className={`h-5 w-5 ${hrProductivityColor(hr)}`} />
                    </Link>
                </TooltipTrigger>
                <TooltipContent>
                    <span className={hrProductivityColor(hr)}>
                        {t('hrProductivity', { percent: Math.round(hr * 100) })}
                    </span>
                </TooltipContent>
            </Tooltip>

            <Tooltip>
                <TooltipTrigger asChild>
                    <Link href={`/planets/${planetId}/agent/${agentId}/storage` as never} className='flex items-center'>
                        <Warehouse className={`h-5 w-5 ${storageStarvationColor(ss)}`} />
                    </Link>
                </TooltipTrigger>
                <TooltipContent>
                    <span className={storageStarvationColor(ss)}>
                        {t('storageHealth', { percent: Math.round((1 - ss) * 100) })}
                    </span>
                </TooltipContent>
            </Tooltip>
        </div>
    );
}
