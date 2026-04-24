'use client';

import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { TICKS_PER_YEAR } from '@/simulation/constants';
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

function GranularityButton({
    active,
    disabled,
    onClick,
    children,
}: {
    active: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={[
                'px-2 py-0.5 rounded text-[11px] transition-colors',
                active
                    ? 'bg-slate-600 text-slate-100'
                    : disabled
                      ? 'text-slate-600 cursor-not-allowed'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700',
            ].join(' ')}
        >
            {children}
        </button>
    );
}

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
    const foundedTick = monthlyData?.foundedTick ?? yearlyData?.foundedTick ?? decadeData?.foundedTick ?? 0;
    const ticksElapsed = currentTick - foundedTick;
    const showYearly = ticksElapsed >= 2 * TICKS_PER_YEAR;
    const showDecade = ticksElapsed >= 11 * TICKS_PER_YEAR;

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

    function selectGranularity(g: Granularity) {
        if (g === 'yearly' && !showYearly) {
            return;
        }
        if (g === 'decade' && !showDecade) {
            return;
        }
        setGranularity(g);
    }

    return (
        <div className='space-y-4'>
            <div className='flex gap-1 items-center'>
                <span className='text-xs text-muted-foreground mr-1'>Granularity:</span>
                <GranularityButton active={granularity === 'monthly'} onClick={() => selectGranularity('monthly')}>
                    Monthly
                </GranularityButton>
                <GranularityButton
                    active={granularity === 'yearly'}
                    disabled={!showYearly}
                    onClick={() => selectGranularity('yearly')}
                >
                    Yearly
                </GranularityButton>
                <GranularityButton
                    active={granularity === 'decade'}
                    disabled={!showDecade}
                    onClick={() => selectGranularity('decade')}
                >
                    Decade
                </GranularityButton>
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
