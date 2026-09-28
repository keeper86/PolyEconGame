'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import LogisticsDepartment from '@/app/planets/[planetId]/agent/[agentId]/storage/_components/StorageDepartment';
import StorageShellsPanel from '@/app/planets/[planetId]/agent/[agentId]/storage/_components/StorageShellsPanel';
import { ResourceMicroCardGrid } from '@/app/planets/[planetId]/agent/[agentId]/storage/_components/ResourceMicroCardGrid';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { Page } from '@/components/client/Page';
import { useTranslations } from 'next-intl';

export default function StoragePage() {
    const t = useTranslations('Nav');
    const {
        agentId,
        planetId,
        assets,
        isLoading,
        hasNoAssets,
        isOwnAgent,
        isOwnAgentUnknown,
        isAuthenticatedWithoutAgentId,
        myAgentId,
        tick,
    } = useAgentPlanetDetail();

    return (
        <Page title={t('Storage Overview')}>
            <AgentAccessGuard
                isLoading={myAgentId.isLoading}
                isOwnAgent={isOwnAgent}
                isOwnAgentUnknown={isOwnAgentUnknown}
                isAuthenticatedWithoutAgentId={isAuthenticatedWithoutAgentId}
                hasNoAssets={hasNoAssets}
                detailLoading={isLoading}
                agentId={agentId}
                planetId={planetId}
            >
                {assets?.storage ? (
                    <div className='space-y-4'>
                        <span className='flex flex-row flex-wrap gap-2'>
                            <LogisticsDepartment agentId={agentId} planetId={planetId} assets={assets} />
                            <StorageShellsPanel agentId={agentId} planetId={planetId} assets={assets} />
                        </span>
                        <ResourceMicroCardGrid assets={assets} tick={tick} />
                    </div>
                ) : null}
            </AgentAccessGuard>
        </Page>
    );
}
