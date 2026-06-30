'use client';

import { Page } from '@/components/client/Page';
import { useParams } from 'next/navigation';

import { DataTableColumnHeader } from '@/components/dataTableColumnHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import type { AgentListSummary } from '@/simulation/snapshotRepository';
import Link from 'next/link';
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

type AgentRow = AgentListSummary & { normalizedBalance: number };

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

    const trpc = useTRPC();
    const { isLoading, data } = useSimulationQuery(
        trpc.simulation.getAgentListSummaries.queryOptions({ planetId, showAll }),
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

    const agents: AgentRow[] = data?.agents ?? [];
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
        <Page
            title='Companies'
            headerComponent={
                <>
                    <Label htmlFor='show-all-companies' className='text-xs text-muted-foreground cursor-pointer'>
                        Show all companies
                    </Label>
                    <Switch id='show-all-companies' checked={showAll} onCheckedChange={setShowAll} />{' '}
                </>
            }
        >
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className='w-12'>#</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Home Planet</TableHead>
                        <TableHead>
                            <DataTableColumnHeader title='Net Balance' {...col('normalizedBalance')} />
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
                                {formatNumberWithUnit(agent.normalizedBalance, 'currency', planetId)}
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

            {data?.diagnostic && (
                <div className='mt-4 text-xs text-muted-foreground space-y-0.5 border-t pt-2'>
                    <div className='font-medium'>Monetary Conservation Check</div>
                    <div>
                        Σ(deposits):{' '}
                        <span className='tabular-nums'>{data.diagnostic.sumPerPlanetDeposits.toFixed(2)}</span>
                    </div>
                    <div>
                        Σ(loans): <span className='tabular-nums'>{data.diagnostic.sumPerPlanetLoans.toFixed(2)}</span>
                    </div>
                    <div>
                        Σ(depositHold):{' '}
                        <span className='tabular-nums'>{data.diagnostic.sumPerPlanetDepositHold.toFixed(2)}</span>
                    </div>
                    <div>
                        householdDeposits:{' '}
                        <span className='tabular-nums'>{data.diagnostic.householdDeposits.toFixed(2)}</span>
                    </div>
                    <div>
                        effective firms deposits (incl. depositHold):{' '}
                        <span className='tabular-nums'>
                            {(data.diagnostic.sumPerPlanetDeposits + data.diagnostic.sumPerPlanetDepositHold).toFixed(2)}
                        </span>
                    </div>
                    <div>
                        residual (householdDeposits + effectiveDeposits - loans, should be ~0):{' '}
                        <span
                            className={`tabular-nums ${
                                Math.abs(data.diagnostic.residual) > 0.01 ? 'text-red-500 font-bold' : ''
                            }`}
                        >
                            {data.diagnostic.residual.toFixed(4)} (
                            {data.diagnostic.sumPerPlanetLoans > 0
                                ? (data.diagnostic.residual / data.diagnostic.sumPerPlanetLoans).toFixed(2)
                                : '0.00'}
                            )
                        </span>
                    </div>
                </div>
            )}
        </Page>
    );
}
