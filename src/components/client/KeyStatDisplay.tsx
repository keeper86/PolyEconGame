'use client';

import { useAgentId } from '@/hooks/useAgentId';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { useParams } from 'next/navigation';
import { Spinner } from '../ui/spinner';
import { formatNumberWithUnit } from '@/lib/utils';
import { getAssetPath } from '@/lib/assetManifest';
import Image from 'next/image';

export default function KeyStatDisplay() {
    const params = useParams<'/planets/[planetId]'>();
    const planetId = params.planetId;
    const { agentId, isLoading: agentLoading } = useAgentId();
    if (agentLoading) {
        return <Spinner />;
    }

    if (!planetId || !agentId) {
        return <div>—</div>;
    }

    return <MoneyDisplay agentId={agentId} planetId={planetId} />;
}

function MoneyDisplay({ agentId, planetId }: { agentId: string; planetId: string }) {
    const trpc = useTRPC();
    const { data, isLoading } = useSimulationQuery(
        trpc.simulation.getAgentFinancials.queryOptions({ agentId, planetId }),
    );
    if (isLoading) {
        return <Spinner />;
    }
    if (!data) {
        return <div>—</div>;
    }

    const currencyIconKey = `cur_${planetId}`;
    const currencyIconPath = getAssetPath(currencyIconKey);

    return (
        <div className='flex items-center text-sm text-muted-foreground text-outline-strong'>
            <span className='pr-2'>Balance</span>
            <span className='tabular-nums whitespace-nowrap font-bold text-foreground text-md'>
                {formatNumberWithUnit(data.deposits, 'none')}
            </span>
            <Image src={currencyIconPath} alt='' width={11} height={11} className='shrink-0' aria-hidden />
        </div>
    );
}
