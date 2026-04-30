'use client';

import { DataTableColumnHeader } from '@/components/dataTableColumnHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import type { AgentListSummary } from '@/simulation/snapshotRepository';
import Link from 'next/link';
import { useState } from 'react';

type SortKey = 'balance' | 'totalWorkers' | 'facilityCount' | 'shipCount';
type SortDir = 'asc' | 'desc';

function sortAgents(agents: AgentListSummary[], key: SortKey, dir: SortDir): AgentListSummary[] {
    return [...agents].sort((a, b) => {
        const diff = a[key] - b[key];
        return dir === 'asc' ? diff : -diff;
    });
}

export default function AgentLeaderboard() {
    const trpc = useTRPC();
    const { isLoading, data } = useSimulationQuery(trpc.simulation.getAgentListSummaries.queryOptions());

    const [sortKey, setSortKey] = useState<SortKey>('balance');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    const agents = data?.agents ?? [];
    const sorted = sortAgents(agents, sortKey, sortDir);

    const col = (key: SortKey) => ({
        sortable: true as const,
        isSorted: sortKey === key,
        sortDir,
        onSort: () => handleSort(key),
    });

    if (isLoading) {
        return <div className='text-sm text-muted-foreground'>Waiting for simulation data…</div>;
    }

    if (agents.length === 0) {
        return <div className='text-sm text-muted-foreground'>No companies found.</div>;
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className='w-12'>#</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Home Planet</TableHead>
                    <TableHead>
                        <DataTableColumnHeader title='Net Balance' {...col('balance')} />
                    </TableHead>
                    <TableHead>
                        <DataTableColumnHeader title='Workers' {...col('totalWorkers')} />
                    </TableHead>
                    <TableHead>
                        <DataTableColumnHeader title='Facilities' {...col('facilityCount')} />
                    </TableHead>
                    <TableHead>
                        <DataTableColumnHeader title='Ships' {...col('shipCount')} />
                    </TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {sorted.map((agent, i) => (
                    <TableRow key={agent.agentId}>
                        <TableCell className='text-muted-foreground tabular-nums'>{i + 1}</TableCell>
                        <TableCell>
                            <Link
                                href={`/agents/${encodeURIComponent(agent.agentId)}` as never}
                                className='font-medium hover:underline'
                            >
                                {agent.name}
                            </Link>
                        </TableCell>
                        <TableCell className='text-muted-foreground'>{agent.associatedPlanetId}</TableCell>
                        <TableCell className='tabular-nums'>
                            {formatNumberWithUnit(agent.balance, 'currency', agent.associatedPlanetId)}
                        </TableCell>
                        <TableCell className='tabular-nums'>
                            {formatNumberWithUnit(agent.totalWorkers, 'persons')}
                        </TableCell>
                        <TableCell className='tabular-nums'>{agent.facilityCount}</TableCell>
                        <TableCell className='tabular-nums'>{agent.shipCount}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
