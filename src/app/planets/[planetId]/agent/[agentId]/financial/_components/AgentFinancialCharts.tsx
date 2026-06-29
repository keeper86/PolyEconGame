'use client';

import { GranularityHeader, useGranularity } from '@/components/client/GranularityButtonGroup';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { Search } from 'lucide-react';
import { useMemo } from 'react';
import { BalanceFlowChart } from './BalanceFlowChart';
import { ExpensesRevenueChart } from './ExpensesRevenueChart';
import {
    computeFinancialGhostData,
    computeFinancialMonthlyData,
    type FinancialChartPoint,
    type FinancialPoint,
} from './financialChartLogic';

export default function AgentFinancialCharts({ agentId, planetId }: { agentId: string; planetId: string }) {
    const trpc = useTRPC();
    const { granularity, setGranularity, currentTick } = useGranularity();

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
        <div className='space-y-2'>
            <GranularityHeader
                title='Details'
                icon={<Search className='h-4 w-4 text-muted-foreground' />}
                granularity={granularity}
                onGranularityChange={setGranularity}
                currentTick={currentTick}
            />
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
