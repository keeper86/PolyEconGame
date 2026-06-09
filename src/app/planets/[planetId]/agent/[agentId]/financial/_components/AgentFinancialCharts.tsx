'use client';

import { GranularityButtonGroup } from '@/components/client/GranularityButtonGroup';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import React, { useMemo, useState } from 'react';
import { BalanceFlowChart } from './BalanceFlowChart';
import { ExpensesRevenueChart } from './ExpensesRevenueChart';
import {
    computeFinancialGhostData,
    computeFinancialMonthlyData,
    type FinancialChartPoint,
    type FinancialPoint,
    type Granularity,
} from './financialChartLogic';

export default function AgentFinancialCharts({ agentId, planetId }: { agentId: string; planetId: string }) {
    const trpc = useTRPC();
    const [granularity, setGranularity] = useState<Granularity>('monthly');

    const { data: monthlyData, isLoading: loadingMonthly } = useSimulationQuery(
        trpc.simulation.getAgentFinancialHistory.queryOptions(
            { agentId, planetId, granularity: 'monthly', limit: 13 },
            { enabled: granularity === 'monthly' },
        ),
    );

    const { data: yearlyData, isLoading: loadingYearly } = useSimulationQuery(
        trpc.simulation.getAgentFinancialHistory.queryOptions(
            { agentId, planetId, granularity: 'yearly', limit: 11 },
            { enabled: granularity === 'yearly' },
        ),
    );
    const { data: decadeData, isLoading: loadingDecade } = useSimulationQuery(
        trpc.simulation.getAgentFinancialHistory.queryOptions(
            { agentId, planetId, granularity: 'decade', limit: 100 },
            { enabled: granularity === 'decade' },
        ),
    );
    const currentTickData = useSimulationQuery(trpc.simulation.getCurrentTick.queryOptions());

    const currentTick = currentTickData?.data?.tick ?? 0;
    const isLoading =
        (granularity === 'monthly' && loadingMonthly) ||
        (granularity === 'yearly' && loadingYearly) ||
        (granularity === 'decade' && loadingDecade);

    const monthlyHistory = useMemo(() => monthlyData?.history ?? [], [monthlyData]);
    const activeMonthlyData = useMemo(
        () => (currentTick > 0 ? computeFinancialMonthlyData(monthlyHistory, currentTick) : []),
        [monthlyHistory, currentTick],
    );
    const activeGhostData = useMemo(
        () => (currentTick > 0 ? computeFinancialGhostData(monthlyHistory, currentTick) : []),
        [monthlyHistory, currentTick],
    );

    const activeData: FinancialPoint[] | FinancialChartPoint[] =
        granularity === 'monthly'
            ? activeMonthlyData
            : granularity === 'yearly'
              ? (yearlyData?.history ?? [])
              : (decadeData?.history ?? []);

    return (
        <div className='space-y-4'>
            <div className='flex gap-1 items-center'>
                <span className='text-xs text-muted-foreground mr-1'>Granularity:</span>
                <GranularityButtonGroup granularity={granularity} onChange={setGranularity} currentTick={currentTick} />
            </div>
            <div
                className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${isLoading ? 'opacity-40 animate-pulse pointer-events-none select-none' : ''}`}
            >
                <ExpensesRevenueChart
                    data={activeData}
                    ghostData={granularity === 'monthly' ? activeGhostData : undefined}
                    granularity={granularity}
                />
                <BalanceFlowChart
                    data={activeData}
                    ghostData={granularity === 'monthly' ? activeGhostData : undefined}
                    granularity={granularity}
                />
            </div>
        </div>
    );
}
