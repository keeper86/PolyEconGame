'use client';

import { Page } from '@/components/client/Page';
import { useParams } from 'next/navigation';

import { CompanyLogo } from '@/components/client/CompanyLogo';
import { PlanetIcon } from '@/components/client/PlanetIcon';
import { DataTableColumnHeader } from '@/components/dataTableColumnHeader';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import type { AgentListSummary } from '@/simulation/snapshotRepository';
import Link from 'next/link';
import { useState } from 'react';

type AgentRow = AgentListSummary & { normalizedBalance: number; rank: number };

type SortKey = 'normalizedBalance' | 'totalWorkers' | 'facilityCount' | 'shipCount';
type SortDir = 'asc' | 'desc';

function sortAgents(agents: AgentRow[], key: SortKey, dir: SortDir): AgentRow[] {
    return [...agents].sort((a, b) => {
        const diff = a[key] - b[key];
        return dir === 'asc' ? diff : -diff;
    });
}

export default function PlanetAgentsLeaderboardPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';

    const [showAll, setShowAll] = useState(false);
    const [hideAutomated, setHideAutomated] = useState(true);

    const trpc = useTRPC();
    const { isLoading, data } = useSimulationQuery(
        trpc.simulation.getAgentListSummaries.queryOptions({ planetId, showAll, hideAutomated: false }),
    );

    const [sortKey, setSortKey] = useState<SortKey>('normalizedBalance');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    // Build rows with pre-filter ranks, then sort, then apply client-side filter
    const agentsWithBalance: AgentRow[] = (data?.agents ?? []).map((a, i) => ({
        ...a,
        normalizedBalance: a.normalizedBalance,
        rank: i + 1,
    }));

    // Sort and assign ranks based on current sort
    let sorted = sortAgents(agentsWithBalance, sortKey, sortDir);
    sorted = sorted.map((agent, i) => ({ ...agent, rank: i + 1 }));

    // Filter out automated / role-based agents client-side, keeping original ranks
    const filtered = hideAutomated ? sorted.filter((a) => !a.automated && !a.agentRole) : sorted;

    const col = (key: SortKey) => ({
        sortable: true as const,
        isSorted: sortKey === key,
        sortDir,
        onSort: () => handleSort(key),
    });

    if (isLoading) {
        return <div className='text-sm text-muted-foreground'>Waiting for simulation data…</div>;
    }

    if (agentsWithBalance.length === 0) {
        return <div className='text-sm text-muted-foreground'>No companies found.</div>;
    }

    return (
        <Page
            title='Companies'
            headerComponent={
                <span className='flex flex-col items-end gap-2'>
                    <span className='flex items-center gap-2'>
                        <Label htmlFor='show-all-companies' className='text-xs text-muted-foreground cursor-pointer'>
                            Show all companies
                        </Label>
                        <Switch id='show-all-companies' checked={showAll} onCheckedChange={setShowAll} />{' '}
                    </span>
                    <span className='flex items-center gap-2'>
                        <Label
                            htmlFor='hide-automated-companies'
                            className='text-xs text-muted-foreground cursor-pointer'
                        >
                            Hide automated agents
                        </Label>
                        <Switch
                            id='hide-automated-companies'
                            checked={hideAutomated}
                            onCheckedChange={setHideAutomated}
                        />
                    </span>
                </span>
            }
        >
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className='w-12 text-right'>#</TableHead>
                        <TableHead className='w-10' />
                        <TableHead>Company</TableHead>
                        <TableHead className='text-right'>
                            <DataTableColumnHeader
                                title='Net Worth'
                                className='justify-end'
                                {...col('normalizedBalance')}
                            />
                        </TableHead>
                        <TableHead className='w-10' />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filtered.map((agent) => (
                        <TableRow key={agent.agentId}>
                            <TableCell className='text-muted-foreground tabular-nums text-right'>{agent.rank}</TableCell>
                            <TableCell>
                                <Link
                                    href={
                                        `/planets/${encodeURIComponent(planetId)}/agent/${encodeURIComponent(agent.agentId)}` as never
                                    }
                                    className='font-medium hover:scale-110 transition-all'
                                >
                                    <CompanyLogo logoKey={agent.logo} size={28} />
                                </Link>
                            </TableCell>
                            <TableCell>
                                <Link
                                    href={
                                        `/planets/${encodeURIComponent(planetId)}/agent/${encodeURIComponent(agent.agentId)}` as never
                                    }
                                    className='font-medium hover:underline'
                                >
                                    {agent.name}
                                </Link>
                            </TableCell>
                            <TableCell className='tabular-nums text-right'>
                                {formatNumberWithUnit(agent.normalizedBalance, 'currency', planetId)}
                            </TableCell>
                            <TableCell>
                                <PlanetIcon planetId={agent.associatedPlanetId} size={24} />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Page>
    );
}
