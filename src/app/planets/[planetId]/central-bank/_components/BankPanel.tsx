'use client';

import { GranularityHeader, useGranularity } from '@/components/client/GranularityButtonGroup';
import { Stat } from '@/components/client/Stat';
import { Separator } from '@/components/ui/separator';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import type { Bank } from '@/simulation/planet/planet';
import { bankEquity } from '@/simulation/planet/planet';
import { FileX, Landmark, Percent, Scale, Search, TrendingDown, Users, Wallet } from 'lucide-react';
import React, { useMemo } from 'react';
import { PlanetCostOfLivingChart, type CostOfLivingPoint } from './PlanetCostOfLivingChart';
import { PlanetMacroChart, type EconomyPoint } from './PlanetMacroChart';
import type { CostOfLivingLive, MacroLive } from './financialChartLogic';

const pct = (n: number): string => `${(n * 100).toFixed(2)} %`;

type Props = {
    bank: Bank;
    planetId: string;
    governmentBalance: number;
};

export default function BankPanel({ bank, planetId, governmentBalance }: Props): React.ReactElement | null {
    const trpc = useTRPC();
    const { granularity, setGranularity, currentTick } = useGranularity();

    const { data: economyData, isLoading: loadingEconomy } = useSimulationQuery(
        trpc.simulation.getPlanetEconomyHistory.queryOptions({ planetId, granularity, limit: 100 }, { enabled: true }),
    );

    const { data: economySnapshot } = useSimulationQuery(trpc.simulation.getPlanetEconomy.queryOptions({ planetId }));

    const isLoading = loadingEconomy || !economyData;

    const economy = economySnapshot?.economy ?? null;

    const macroLive: MacroLive | undefined = useMemo(() => {
        if (!economy) {
            return undefined;
        }
        return {
            tick: economySnapshot?.tick ?? 0,
            gdp: economy.gdp,
            bankEquity: bankEquity(economy.bank),
            moneySupply: economy.moneySupply,
        };
    }, [economy, economySnapshot?.tick]);

    const costOfLivingLive: CostOfLivingLive | undefined = useMemo(() => {
        if (!economy) {
            return undefined;
        }
        const wages = economy.wagePerEdu ?? {};
        return {
            tick: economySnapshot?.tick ?? 0,
            costOfLiving: economy.costOfLiving,
            costOfLivingRich: economy.costOfLivingRich,
            wageEdu0: wages.none ?? 0,
            wageEdu1: wages.primary ?? 0,
            wageEdu2: wages.secondary ?? 0,
            wageEdu3: wages.tertiary ?? 0,
        };
    }, [economy, economySnapshot?.tick]);

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

    const equity = bankEquity(bank);
    const equityColor = equity < 0 ? 'text-red-500' : equity > 0 ? 'text-green-600' : '';

    return (
        <>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2' data-tour='bank-panel'>
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
                    <Stat
                        label='Government balance'
                        value={formatNumberWithUnit(governmentBalance, 'currency', planetId)}
                        icon={<Landmark className='h-3 w-3' />}
                    />
                </div>
                <div className='grid grid-cols-1 gap-y-1'>
                    <Stat
                        label='Bank equity'
                        value={formatNumberWithUnit(equity, 'currency', planetId)}
                        icon={<Scale className='h-3 w-3' />}
                        valueClassName={equityColor}
                    />
                    <Stat
                        label='Written-off debt (total)'
                        value={formatNumberWithUnit(bank.writeOffs, 'currency', planetId)}
                        icon={<FileX className='h-3 w-3' />}
                        valueClassName={bank.writeOffs > 0 ? 'text-red-500' : ''}
                    />
                    <Stat
                        label='Loan rate (new loans, p.a.)'
                        value={pct(bank.loanRatePerYear)}
                        icon={<Percent className='h-3 w-3' />}
                    />
                    <Stat
                        label='Interest collected'
                        value={formatNumberWithUnit(bank.interestCollected, 'currency', planetId)}
                        icon={<Percent className='h-3 w-3' />}
                    />
                </div>
            </div>

            <Separator />
            <GranularityHeader
                title='Details'
                icon={<Search className='h-4 w-4 text-muted-foreground' />}
                granularity={granularity}
                onGranularityChange={setGranularity}
                currentTick={currentTick}
            />

            <div className='mt-2'>
                <div
                    className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${isLoading ? 'opacity-40 animate-pulse pointer-events-none select-none' : ''}`}
                >
                    <PlanetMacroChart
                        data={macroData}
                        granularity={granularity}
                        planetId={planetId}
                        currentTick={currentTick}
                        live={macroLive}
                    />
                    <PlanetCostOfLivingChart
                        data={costOfLivingData}
                        granularity={granularity}
                        planetId={planetId}
                        currentTick={currentTick}
                        live={costOfLivingLive}
                    />
                </div>
            </div>
        </>
    );
}
