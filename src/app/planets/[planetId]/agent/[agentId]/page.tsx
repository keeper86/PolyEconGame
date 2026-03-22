'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { NoAssetsMessage } from '@/app/planets/[planetId]/agent/_component/NoAssetsMessage';
import { StorageOverview } from '@/app/planets/[planetId]/agent/_component/StorageOverview';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AGENT_SUB_PAGES } from '@/lib/appRoutes';
import { formatNumbers } from '@/lib/utils';
import { agriculturalProductResourceType } from '@/simulation/planet/resources';
import Link from 'next/link';
import { route } from 'nextjs-routes';

function QuickStatCard({ label, value }: { label: string; value: string }) {
    return (
        <div className='rounded-lg border p-3 space-y-0.5'>
            <p className='text-xs text-muted-foreground'>{label}</p>
            <p className='text-lg font-semibold tabular-nums'>{value}</p>
        </div>
    );
}

export default function AgentPlanetOverviewPage() {
    const { agentId, planetId, detail, assets, isLoading, hasNoAssets, isOwnAgent, myAgentId } = useAgentPlanetDetail();

    const subPageHref = (segment: string) =>
        `/planets/${encodeURIComponent(planetId)}/agent/${encodeURIComponent(agentId)}/${segment}` as unknown as '/';

    return (
        <AgentAccessGuard
            agentId={agentId}
            agentName={detail?.agentName ?? 'Agent'}
            isLoading={myAgentId.isLoading}
            isOwnAgent={isOwnAgent}
        >
            {hasNoAssets ? (
                <NoAssetsMessage planetName={planetId} agentId={agentId} />
            ) : !isLoading && assets ? (
                <div className='space-y-6'>
                    <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
                        <QuickStatCard label='Facilities' value={String(assets.productionFacilities?.length ?? 0)} />
                        <QuickStatCard
                            label='Workers'
                            value={formatNumbers(
                                Object.values(assets.allocatedWorkers ?? {}).reduce((s, v) => s + v, 0),
                            )}
                        />
                        <QuickStatCard label='Deposits' value={formatNumbers(assets.deposits ?? 0)} />
                        <QuickStatCard
                            label='Food price'
                            value={
                                assets.market?.sell[agriculturalProductResourceType.name]?.offerPrice !== undefined
                                    ? formatNumbers(
                                          assets.market.sell[agriculturalProductResourceType.name]!.offerPrice!,
                                      )
                                    : '—'
                            }
                        />
                    </div>

                    <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
                        {AGENT_SUB_PAGES.map(({ segment, label, icon: Icon }) => (
                            <Link key={segment} href={subPageHref(segment)}>
                                <Card className='hover:border-primary/50 transition-colors cursor-pointer'>
                                    <CardHeader className='pb-2 pt-4 px-4'>
                                        <CardTitle className='text-sm flex items-center gap-2'>
                                            <Icon className='h-4 w-4 text-muted-foreground' />
                                            {label}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className='px-4 pb-4' />
                                </Card>
                            </Link>
                        ))}
                    </div>

                    {assets.storageFacility && <StorageOverview storage={assets.storageFacility} />}

                    <div className='pt-2'>
                        <Link
                            href={route({ pathname: '/agents/[agentId]', query: { agentId } })}
                            className='text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors'
                        >
                            Public company profile
                        </Link>
                    </div>
                </div>
            ) : (
                <div className='text-sm text-muted-foreground'>Loading…</div>
            )}
        </AgentAccessGuard>
    );
}
