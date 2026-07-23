'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { mapTickToDate } from '@/components/client/TickDisplay';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AGENT_SUB_PAGES } from '@/lib/appRoutes';
import type { Facility } from '@/simulation/planet/facility';
import { Globe } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { FacilityOrShipListCard } from './_component/FacilityListCard';
import AgentFinancialCharts from './financial/_components/AgentFinancialCharts';

function FacilityBreakdown({ facilities }: { facilities: Facility[] }) {
    const groups = useMemo(() => {
        const map = new Map<string, number>();
        for (const f of facilities) {
            map.set(f.name, f.maxScale);
        }
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [facilities]);

    return (
        <div className='space-y-2'>
            <p className='text-xs font-semibold text-muted-foreground'>Facilities</p>
            <div className='flex items-center gap-3 flex-wrap'>
                {groups.map(([name, count]) => (
                    <FacilityOrShipListCard key={name} name={name} count={count} />
                ))}
                {groups.length === 0 && <FacilityOrShipListCard key={'no_facilities'} name={'No facilities'} unknown />}
            </div>
        </div>
    );
}

function ShipFleet({
    planetId,
    ships,
}: {
    planetId: string;
    ships: { id: string; type: { type: string; name: string }; state: { type: string; planetId: string } }[];
}) {
    return (
        <div className='space-y-2'>
            <p className='text-xs font-semibold text-muted-foreground'>Ships</p>
            <div className='flex items-center flex-wrap gap-3'>
                {ships.map((ship) => (
                    <FacilityOrShipListCard
                        key={ship.id}
                        name={ship.type.name}
                        subtitle={`${ship.state.type}${ship.state.planetId ? ` at ${ship.state.planetId}` : ''}`}
                    />
                ))}
                {ships.length === 0 && (
                    <FacilityOrShipListCard key={'no_ships'} name={'No ships (on ' + planetId + ')'} unknown />
                )}
            </div>
        </div>
    );
}

export default function AgentPlanetOverviewPage() {
    const {
        agentId,
        planetId,
        detail,
        assets,
        ships,
        isLoading,
        hasNoAssets,
        isOwnAgent,
        isOwnAgentUnknown,
        isAuthenticatedWithoutAgentId,
        myAgentId,
    } = useAgentPlanetDetail();

    const subPageHref = (segment: string) =>
        `/planets/${encodeURIComponent(planetId)}/agent/${encodeURIComponent(agentId)}/${segment}` as unknown as '/';

    const facilities = assets?.productionFacilities ?? [];
    return (
        <div className='space-y-8'>
            {/* ── Public profile section (always visible) ── */}
            <div className='space-y-4'>
                <div>
                    <h1 className='text-2xl font-bold tracking-tight'>{detail?.agentName ?? 'Company'}</h1>
                    <p className='text-sm text-muted-foreground'>
                        Based on {planetId}
                        {detail && detail.foundedTick > 0 && (
                            <>
                                {' · '}Founded {mapTickToDate(detail.foundedTick)}
                            </>
                        )}
                    </p>
                </div>

                <FacilityBreakdown facilities={facilities} />

                <ShipFleet ships={ships} planetId={planetId} />

                <div className='rounded-lg border p-3'>
                    <AgentFinancialCharts agentId={agentId} planetId={planetId} onlyBalances={true} />
                </div>
            </div>

            {/* ── Owner-only management section ── */}
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
                <div className='space-y-6 border-t pt-6'>
                    <div className='flex items-center gap-2'>
                        <Globe className='h-4 w-4 text-muted-foreground' />
                        <h2 className='text-lg font-semibold'>Management</h2>
                    </div>

                    <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
                        {AGENT_SUB_PAGES.map(({ segment, label, icon: Icon }) => (
                            <Link key={segment} href={subPageHref(segment)}>
                                <Card className='hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer'>
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
                </div>
            </AgentAccessGuard>
        </div>
    );
}
