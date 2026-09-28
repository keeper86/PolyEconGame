'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import ProductionFacilitiesPanel from './_component/ProductionFacilitiesPanel';
import { Page } from '@/components/client/Page';
import { useTranslations } from 'next-intl';

export default function ProductionPage() {
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
    } = useAgentPlanetDetail();

    return (
        <Page title={t('Production Management')}>
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
                {assets ? (
                    <div data-tour='production-facilities'>
                        <ProductionFacilitiesPanel assets={assets} agentId={agentId} planetId={planetId} />
                    </div>
                ) : null}
            </AgentAccessGuard>
        </Page>
    );
}
