'use client';

import { GranularityButtonGroup } from '@/components/client/GranularityButtonGroup';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import type { Bank } from '@/simulation/planet/planet';
import { Landmark, Percent, Scale, TrendingDown, Users, Wallet } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { PlanetCostOfLivingChart, type CostOfLivingPoint } from './PlanetCostOfLivingChart';
import { PlanetMacroChart, type EconomyPoint } from './PlanetMacroChart';

const pct = (n: number): string => `${(n * 100).toFixed(2)} %`;

function Stat({
    label,
    value,
    icon,
    valueClassName,
}: {
    label: string;
    value: React.ReactNode;
    icon?: React.ReactNode;
    valueClassName?: string;
}): React.ReactElement {
    return (
        <div className='flex items-baseline justify-between gap-2'>
            <span className='flex items-center gap-1 text-xs text-muted-foreground truncate'>
                {icon}
                {label}
            </span>
            <span className={`tabular-nums whitespace-nowrap text-xs font-medium ${valueClassName ?? ''}`}>
                {value}
            </span>
        </div>
    );
}

type Props = {
    bank: Bank;
    planetId: string;
};

export default function BankPanel({ bank, planetId }: Props): React.ReactElement | null {
    const trpc = useTRPC();
    const [granularity, setGranularity] = useState<'monthly' | 'yearly' | 'decade'>('monthly');

    const { data: economyData, isLoading: loadingEconomy } = useSimulationQuery(
        trpc.simulation.getPlanetEconomyHistory.queryOptions({ planetId, granularity, limit: 100 }, { enabled: true }),
    );

    const { data: currentTickData } = useSimulationQuery(trpc.simulation.getCurrentTick.queryOptions());
    const currentTick = currentTickData?.tick ?? 0;

    const isLoading = loadingEconomy || !economyData;

    const macroData: EconomyPoint[] = useMemo(
        () =>
            (economyData?.history ?? []).map((r) => ({
                bucket: r.bucket,
                avgGdp: r.avgGdp,
                avgBankEquity: r.avgBankEquity,
                avgMoneySupply: r.avgMoneySupply,
                avgPolicyRate: r.avgPolicyRate,
            })),
        [economyData],
    );

    const costOfLivingData: CostOfLivingPoint[] = useMemo(
        () =>
            (economyData?.history ?? []).map((r) => ({
                bucket: r.bucket,
                avgCostOfLiving: r.avgCostOfLiving,
                avgCostOfLivingRich: r.avgCostOfLivingRich,
                avgWageEdu0: r.avgWageEdu0,
                avgWageEdu1: r.avgWageEdu1,
                avgWageEdu2: r.avgWageEdu2,
                avgWageEdu3: r.avgWageEdu3,
            })),
        [economyData],
    );

    const equityColor = bank.equity < 0 ? 'text-red-500' : bank.equity > 0 ? 'text-green-600' : '';

    return (
        <>
            <p className='text-sm font-semibold flex items-center gap-2'>
                <Landmark className='h-4 w-4 text-muted-foreground' />
                Planetary Bank
            </p>

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2'>
                <div className='grid grid-cols-1 gap-y-1'>
                    <Stat
                        label='Outstanding loans'
                        value={formatNumberWithUnit(bank.loans, 'currency', planetId)}
                        icon={<TrendingDown className='h-3 w-3' />}
                        valueClassName={bank.loans > 0 ? 'text-amber-500' : ''}
                    />
                    <Stat
                        label='Firm deposits'
                        value={formatNumberWithUnit(bank.deposits - bank.householdDeposits, 'currency', planetId)}
                        icon={<Wallet className='h-3 w-3' />}
                    />
                    <Stat
                        label='Household deposits'
                        value={formatNumberWithUnit(bank.householdDeposits, 'currency', planetId)}
                        icon={<Users className='h-3 w-3' />}
                    />
                </div>
                <div className='grid grid-cols-1 gap-y-1'>
                    <Stat
                        label='Bank equity'
                        value={formatNumberWithUnit(bank.equity, 'currency', planetId)}
                        icon={<Scale className='h-3 w-3' />}
                        valueClassName={equityColor}
                    />
                    <Stat label='Loan rate' value={pct(bank.loanRate)} icon={<Percent className='h-3 w-3' />} />
                    <Stat label='Deposit rate' value={pct(bank.depositRate)} icon={<Percent className='h-3 w-3' />} />
                </div>
            </div>

            <div className='mt-4 border-t border-border pt-4'>
                <div className='flex gap-1 items-center mb-2'>
                    <span className='text-xs text-muted-foreground mr-1'>Granularity:</span>
                    <GranularityButtonGroup
                        granularity={granularity}
                        onChange={setGranularity}
                        currentTick={currentTick}
                    />
                </div>
                <div
                    className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${isLoading ? 'opacity-40 animate-pulse pointer-events-none select-none' : ''}`}
                >
                    <PlanetMacroChart
                        data={macroData}
                        granularity={granularity}
                        planetId={planetId}
                        currentTick={currentTick}
                    />
                    <PlanetCostOfLivingChart
                        data={costOfLivingData}
                        granularity={granularity}
                        planetId={planetId}
                        currentTick={currentTick}
                    />
                </div>
            </div>
        </>
    );
}