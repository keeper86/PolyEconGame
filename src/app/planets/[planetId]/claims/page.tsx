'use client';

import { useAgentId } from '@/hooks/useAgentId';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import type { AgentClaimEntry } from '@/server/controller/planet';
import { useParams } from 'next/navigation';
import { ActiveClaimCard } from './_components/ActiveClaimCard';
import { LeaseClaimCard } from './_components/LeaseClaimCard';
import { ReadOnlyClaimCard } from './_components/ReadOnlyClaimCard';

function ClaimsContent({ planetId }: { planetId: string }) {
    const trpc = useTRPC();
    const { agentId } = useAgentId();

    const { data: planetClaimsData, isLoading: planetClaimsLoading } = useSimulationQuery(
        trpc.simulation.getPlanetClaims.queryOptions({ planetId }),
    );

    const { data: agentClaimsData, isLoading: agentClaimsLoading } = useSimulationQuery(
        trpc.simulation.getAgentClaims.queryOptions({ agentId: agentId ?? '', planetId }, { enabled: !!agentId }),
    );

    if (planetClaimsLoading || agentClaimsLoading) {
        return <div className='text-sm text-muted-foreground'>Loading claims data…</div>;
    }

    const resources = planetClaimsData?.resources ?? [];

    if (resources.length === 0) {
        return <div className='text-sm text-muted-foreground'>No land-bound claims on this planet.</div>;
    }

    const agentClaimsMap = new Map<string, AgentClaimEntry>();
    for (const claim of agentClaimsData?.claims ?? []) {
        agentClaimsMap.set(claim.resourceName, claim);
    }

    return (
        <div className='space-y-4'>
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                {resources.map((summary) => {
                    const activeClaim = agentClaimsMap.get(summary.resourceName);
                    if (activeClaim) {
                        return (
                            <ActiveClaimCard
                                key={summary.resourceName}
                                claim={activeClaim}
                                summary={summary}
                                agentId={agentId!}
                                planetId={planetId}
                            />
                        );
                    }
                    if (agentId && summary.availableCapacity > 0) {
                        return (
                            <LeaseClaimCard
                                key={summary.resourceName}
                                summary={summary}
                                agentId={agentId}
                                planetId={planetId}
                            />
                        );
                    }
                    return <ReadOnlyClaimCard key={summary.resourceName} summary={summary} />;
                })}
            </div>
        </div>
    );
}

export default function PlanetClaimsPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';

    return (
        <div className='space-y-4'>
            <div>
                <h3 className='text-base font-semibold'>Land Claims</h3>
                <p className='text-sm text-muted-foreground'>All land-bound resource plots on this planet.</p>
            </div>
            <ClaimsContent planetId={planetId} />
        </div>
    );
}
