'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Page } from '@/components/client/Page';
import TickDisplay from '@/components/client/TickDisplay';
import PlanetAssetCard from '@/app/agents/PlanetAssetCard';
import { useTRPC } from '@/lib/trpc';
import Link from 'next/link';
import { ArrowLeft, Globe, Ship, Wallet } from 'lucide-react';

const REFETCH_INTERVAL_MS = 1000;

const fmtNumber = (n: number): string =>
    n >= 1_000_000
        ? `${(n / 1_000_000).toFixed(1)}M`
        : n >= 1_000
          ? `${(n / 1_000).toFixed(1)}k`
          : String(Math.round(n));

export default function AgentDetailPage() {
    const params = useParams<'/agents/[agentId]'>();
    const agentId = params.agentId;
    const trpc = useTRPC();

    const { data, isLoading } = useQuery({
        ...trpc.simulation.getAgentOverview.queryOptions({ agentId }),
        refetchInterval: REFETCH_INTERVAL_MS,
    });

    const tick = data?.tick ?? 0;
    const overview = data?.overview;

    return (
        <Page
            title={overview?.name ?? 'Agent'}
            headerComponent={
                <Link
                    href={'/agents' as never}
                    className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors'
                >
                    <ArrowLeft className='h-4 w-4' />
                    All agents
                </Link>
            }
        >
            <div className='mb-4'>
                <TickDisplay tick={tick} />
            </div>

            {!isLoading && tick > 0 && overview ? (
                <div className='space-y-6'>
                    {/* Top-level agent stats */}
                    <div className='grid grid-cols-2 sm:grid-cols-3 gap-4'>
                        <div className='space-y-1'>
                            <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                                <Wallet className='h-3.5 w-3.5' />
                                Wealth
                            </div>
                            <div className='text-lg font-semibold tabular-nums'>{fmtNumber(overview.wealth)}</div>
                        </div>
                        <div className='space-y-1'>
                            <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                                <Globe className='h-3.5 w-3.5' />
                                Home planet
                            </div>
                            <div className='text-lg font-semibold'>{overview.associatedPlanetId}</div>
                        </div>
                        <div className='space-y-1'>
                            <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                                <Ship className='h-3.5 w-3.5' />
                                Transport ships
                            </div>
                            <div className='text-lg font-semibold tabular-nums'>{overview.shipCount}</div>
                        </div>
                    </div>

                    {/* Planet asset cards */}
                    <div>
                        <h2 className='text-sm font-medium text-muted-foreground mb-3'>
                            Assets by planet ({overview.planets.length})
                        </h2>
                        <div className='flex flex-wrap gap-3'>
                            {overview.planets.map((p) => (
                                <PlanetAssetCard
                                    key={p.planetId}
                                    agentId={overview.agentId}
                                    planet={p}
                                    isHomePlanet={p.planetId === overview.associatedPlanetId}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            ) : isLoading ? (
                <div className='text-sm text-muted-foreground'>Loading agent data…</div>
            ) : (
                <div className='text-sm text-muted-foreground'>
                    Agent not found.{' '}
                    <Link href={'/agents' as never} className='underline'>
                        Back to agents
                    </Link>
                </div>
            )}
        </Page>
    );
}
