'use client';

import { useAgentId } from '@/hooks/useAgentId';
import { useTRPC } from '@/lib/trpc';
import { formatNumbers } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Building2, Globe, Package, Ship, Wallet } from 'lucide-react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import PlanetAssetCard from '@/app/planets/[planetId]/agent/_component/PlanetAssetCard';
import { Badge } from '@/components/ui/badge';

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
    return (
        <div className='rounded-lg border p-4 flex items-start gap-3'>
            <Icon className='h-5 w-5 text-muted-foreground mt-0.5 shrink-0' />
            <div className='space-y-0.5'>
                <p className='text-xs text-muted-foreground'>{label}</p>
                <p className='text-lg font-semibold tabular-nums'>{value}</p>
            </div>
        </div>
    );
}

export default function AgentPublicProfilePage() {
    const { agentId } = useParams<'/agents/[agentId]'>();
    const trpc = useTRPC();
    const myAgent = useAgentId();

    const overviewQuery = useQuery(trpc.simulation.getAgentOverview.queryOptions({ agentId }));

    const overview = overviewQuery.data?.overview;
    const isOwner = !myAgent.isLoading && myAgent.agentId === agentId;

    if (overviewQuery.isLoading) {
        return <div className='text-sm text-muted-foreground'>Loading…</div>;
    }

    if (!overview) {
        return (
            <div className='flex flex-col items-center justify-center gap-2 py-16 text-center'>
                <Building2 className='h-10 w-10 text-muted-foreground' />
                <p className='text-sm text-muted-foreground'>Company not found.</p>
            </div>
        );
    }

    return (
        <div className='space-y-8'>
            <div className='flex items-center gap-3'>
                <Building2 className='h-7 w-7 text-muted-foreground' />
                <div>
                    <h1 className='text-2xl font-bold'>{overview.name}</h1>
                    <div className='flex items-center gap-2 mt-1'>
                        <Badge variant='outline' className='gap-1 text-xs'>
                            <Globe className='h-3 w-3' />
                            {overview.associatedPlanetId}
                        </Badge>
                        {isOwner && (
                            <Badge variant='secondary' className='text-xs'>
                                Your Company
                            </Badge>
                        )}
                    </div>
                </div>
            </div>

            {isOwner && (
                <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
                    <StatCard label='Balance' value={formatNumbers(overview.balance)} icon={Wallet} />
                    <StatCard label='Ships' value={String(overview.shipCount)} icon={Ship} />
                    <StatCard label='Active Planets' value={String(overview.planets.length)} icon={Globe} />
                </div>
            )}

            {overview.planets.length > 0 && (
                <div className='space-y-3'>
                    <h2 className='text-sm font-semibold text-muted-foreground uppercase tracking-wide'>
                        {isOwner ? 'Your Assets by Planet' : 'Known Operations'}
                    </h2>
                    <div className='flex flex-wrap gap-3'>
                        {overview.planets.map((planet) => (
                            <PlanetAssetCard
                                key={planet.planetId}
                                agentId={agentId}
                                planet={planet}
                                isHomePlanet={planet.planetId === overview.associatedPlanetId}
                                isOwner={isOwner}
                            />
                        ))}
                    </div>
                </div>
            )}

            {!isOwner && (
                <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                    <Package className='h-4 w-4 shrink-0' />
                    <span>Detailed financial and operational data is classified.</span>
                </div>
            )}

            {isOwner && overview.planets.length === 0 && (
                <div className='rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground'>
                    You have no planetary assets yet. Select a planet to start building.
                </div>
            )}

            {isOwner && (
                <div className='pt-2'>
                    <Link
                        href={`/planets` as unknown as '/'}
                        className='text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors'
                    >
                        Browse planets
                    </Link>
                </div>
            )}
        </div>
    );
}
