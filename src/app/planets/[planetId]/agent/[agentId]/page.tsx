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
import { FacilitiesMaintenanceDebug } from './_component/FacilitiesMaintenanceDebug';
import AgentFinancialCharts from './financial/_components/AgentFinancialCharts';
import type { AgentPlanetAssets } from '@/simulation/planet/planet';
import { computeStorageThroughputMass } from '@/simulation/planet/facility';
import { HR_DEPARTMENT_NAME, LOGISTICS_DEPARTMENT_NAME } from '@/simulation/planet/specialFacilities';
import { termFor } from '@/i18n/terms';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { formatNumberWithUnit } from '@/lib/utils';
import { useLocale, useTranslations } from 'next-intl';

function FacilityBreakdown({ facilities }: { facilities: Facility[] }) {
    const tr = useTranslations('Agent');
    const groups = useMemo(() => {
        const map = new Map<string, number>();
        for (const f of facilities) {
            map.set(f.name, f.maxScale);
        }
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [facilities]);

    return (
        <div className='space-y-2'>
            <p className='text-xs font-semibold text-muted-foreground'>{tr('facilities')}</p>
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
    const tr = useTranslations('Agent');
    const groups = useMemo(() => {
        const map = new Map<string, number>();
        for (const ship of ships) {
            map.set(ship.type.name, (map.get(ship.type.name) ?? 0) + 1);
        }
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [ships]);

    return (
        <div className='space-y-2'>
            <p className='text-xs font-semibold text-muted-foreground'>{tr('ships')}</p>
            <div className='flex items-center flex-wrap gap-3'>
                {groups.map(([name, count]) => (
                    <FacilityOrShipListCard key={name} name={name} count={count} />
                ))}
                {groups.length === 0 && (
                    <FacilityOrShipListCard key={'no_ships'} name={tr('noShips', { planetId })} unknown />
                )}
            </div>
        </div>
    );
}

function pct(n: number): string {
    return `${Math.round(Math.min(n, 999) * 100)}%`;
}

function ServiceDepartmentsDebug({ assets }: { assets: AgentPlanetAssets }) {
    const locale = useLocale();
    const tr = useTranslations('Agent');
    const fmt = (n: number) => formatNumberWithUnit(n, 'units', undefined, locale);
    const hr = assets.humanResourcesDepartment;
    const stoDept = assets.storage.department;

    const hrDemand = assets.usedWorkers;
    const hrBufRatio = hrDemand > 0 ? (hr?.hrBuffer ?? 0) / hrDemand : Number.POSITIVE_INFINITY;
    const stoDemand = computeStorageThroughputMass(assets);
    const stoBufRatio = stoDemand > 0 ? (stoDept?.transportBuffer ?? 0) / stoDemand : Number.POSITIVE_INFINITY;

    const entry = (label: string, value: string) => (
        <span>
            {label}: <span className='font-mono'>{value}</span>
        </span>
    );

    return (
        <div className='rounded-lg border-2 border-orange-400/60 bg-orange-50/30 dark:bg-orange-950/10 p-4 space-y-3 text-xs'>
            <div className='flex items-center gap-2'>
                <Badge variant='outline' className='border-orange-400 text-orange-600 text-[10px] font-bold'>
                    TEMP DEBUG
                </Badge>
                <span className='font-semibold text-orange-700 dark:text-orange-400'>{tr('serviceDepartments')}</span>
            </div>

            <div>
                <h3 className='font-bold uppercase text-muted-foreground mb-1'>
                    {termFor(locale, HR_DEPARTMENT_NAME)}
                </h3>
                {!hr ? (
                    <p className='italic text-muted-foreground'>{tr('notBuilt')}</p>
                ) : (
                    <div className='flex flex-wrap gap-x-4 gap-y-0.5'>
                        {entry('Scale', `${fmt(hr.scale)} / ${fmt(hr.maxScale)}`)}
                        {entry('hrBuffer', `${fmt(hr.hrBuffer)}`)}
                        {entry('Buffer/Demand', isFinite(hrBufRatio) ? hrBufRatio.toFixed(2) : '∞')}
                        {entry('Prod.Mult', pct(assets.hrProductivityMultiplier))}
                        {entry('Eff', pct(hr.lastTickResults.overallEfficiency))}
                        {entry('WageCosts', fmt(hr.lastTickResults.wageCosts))}
                        {entry('InputCosts', fmt(hr.lastTickResults.inputCosts))}
                        {entry('CostBalance', fmt(hr.lastTickResults.costBalance))}
                        {hr.construction &&
                            entry(
                                'Constr',
                                `${hr.construction.type}→${hr.construction.constructionTargetMaxScale} ${fmt(hr.construction.progress)}/${fmt(hr.construction.totalConstructionServiceRequired)}`,
                            )}
                    </div>
                )}
            </div>

            <Separator />

            <div>
                <h3 className='font-bold uppercase text-muted-foreground mb-1'>
                    {termFor(locale, LOGISTICS_DEPARTMENT_NAME)}
                </h3>
                {!stoDept ? (
                    <p className='italic text-muted-foreground'>{tr('notBuilt')}</p>
                ) : (
                    <div className='flex flex-wrap gap-x-4 gap-y-0.5'>
                        {entry('Scale', `${fmt(stoDept.scale)} / ${fmt(stoDept.maxScale)}`)}
                        {entry('transportBuffer', fmt(stoDept.transportBuffer))}
                        {entry('starvation', (stoDept.transportStarvation ?? 0).toFixed(4))}
                        {entry('Buffer/Demand', isFinite(stoBufRatio) ? stoBufRatio.toFixed(2) : '∞')}
                        {entry('Eff', pct(stoDept.lastTickResults.overallEfficiency))}
                        {entry('WageCosts', fmt(stoDept.lastTickResults.wageCosts))}
                        {entry('InputCosts', fmt(stoDept.lastTickResults.inputCosts))}
                        {entry('CostBalance', fmt(stoDept.lastTickResults.costBalance))}
                        {stoDept.construction &&
                            entry(
                                'Constr',
                                `${stoDept.construction.type}→${stoDept.construction.constructionTargetMaxScale} ${fmt(stoDept.construction.progress)}/${fmt(stoDept.construction.totalConstructionServiceRequired)}`,
                            )}
                    </div>
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

    const tr = useTranslations('Agent');
    const locale = useLocale();

    const subPageHref = (segment: string) =>
        `/planets/${encodeURIComponent(planetId)}/agent/${encodeURIComponent(agentId)}/${segment}` as unknown as '/';

    const facilities = assets?.productionFacilities ?? [];
    return (
        <div className='space-y-8'>
            {/* ── Public profile section (always visible) ── */}
            <div className='space-y-4'>
                <div>
                    <h1 className='text-2xl font-bold tracking-tight'>{detail?.agentName ?? tr('company')}</h1>
                    <p className='text-sm text-muted-foreground'>
                        {tr('basedOn', { planetId })}
                        {detail && detail.foundedTick > 0 && (
                            <>
                                {' · '}
                                {tr('founded', { date: mapTickToDate(detail.foundedTick, false, locale) })}
                            </>
                        )}
                    </p>
                </div>

                <div className='grid sm:grid-cols-2 grid-cols-1 gap-3'>
                    <FacilityBreakdown facilities={facilities} />
                    <ShipFleet ships={ships} planetId={planetId} />
                </div>

                <div className='rounded-lg border p-3'>
                    <AgentFinancialCharts agentId={agentId} planetId={planetId} onlyBalances={true} />
                </div>

                {assets && (
                    <div className='space-y-4'>
                        <FacilitiesMaintenanceDebug assets={assets} />
                        <ServiceDepartmentsDebug assets={assets} />
                    </div>
                )}
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
                        <h2 className='text-lg font-semibold'>{tr('management')}</h2>
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
