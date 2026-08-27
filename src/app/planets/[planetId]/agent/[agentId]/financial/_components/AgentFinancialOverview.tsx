'use client';

import { Stat } from '@/components/client/Stat';
import { formatNumberWithUnit } from '@/lib/utils';
import type { MonthAccumulator } from '@/simulation/planet/planet';
import {
    Coins,
    Landmark,
    Package,
    Percent,
    Scale,
    ShoppingCart,
    Trash,
    TrendingDown,
    TrendingUp,
    Users,
} from 'lucide-react';
import React from 'react';
import { GoRocket } from 'react-icons/go';
import { TbBuildingFactory2 } from 'react-icons/tb';

type Props = {
    deposits: number;
    loans: number;
    loanConditions: {
        lastMonthlyRevenue: number;
        lastMonthlyWages: number;
        lastMonthlyPurchases: number;
        lastMonthlyClaimPayments: number;
        monthlyNetCashFlow: number;
        shipsCollateral: number;
        storageCollateral: number;
        facilitiesCollateral: number;
    };
    monthAcc: MonthAccumulator;
    lastMonthAcc: MonthAccumulator;
    planetId: string;
    agentId: string;
};

function ValueWithSub({
    value,
    subValue,
    planetId,
    subValueClassName,
}: {
    value: number;
    subValue: number;
    planetId: string;
    subValueClassName?: string;
}): React.ReactElement {
    return (
        <span className='inline-flex flex-row items-center flex-baseline gap-1'>
            <span>{formatNumberWithUnit(value, 'currency', planetId)}</span>
            <span className={`text-[10px] w-[50px] text-right ${subValueClassName ?? 'text-muted-foreground'}`}>
                ({formatNumberWithUnit(subValue, 'currency', planetId)})
            </span>
        </span>
    );
}

function cashFlowColor(value: number): string {
    if (value === 0) {
        return 'text-muted-foreground';
    }
    if (value > 0) {
        return 'text-green-600';
    }
    return 'text-red-500';
}

function mutedCashFlowColor(value: number): string {
    if (value === 0) {
        return 'text-muted-foreground';
    }
    if (value > 0) {
        return 'text-green-600/50';
    }
    return 'text-red-500/50';
}

export default function AgentFinancialOverview({
    deposits,
    loans,
    loanConditions,
    monthAcc,
    lastMonthAcc,
    planetId,
}: Props): React.ReactElement {
    const netPosition = deposits - loans;

    const currentMonthlyRevenue = monthAcc.revenue;
    const currentMonthlyWages = monthAcc.wages;
    const currentMonthlyPurchases = monthAcc.purchases;
    const currentMonthlyClaimPayments = monthAcc.claimPayments;

    const lastMonthlyDepreciation = Object.values(lastMonthAcc.depreciatedServices).reduce(
        (sum, entry) => sum + entry.value,
        0,
    );
    const currentMonthlyInterest = monthAcc.interestPaid;
    const lastMonthlyInterest = lastMonthAcc.interestPaid;
    const currentMonthlyWealthTax = monthAcc.wealthTaxPaid;
    const lastMonthlyWealthTax = lastMonthAcc.wealthTaxPaid;
    const currentNetCashFlow =
        currentMonthlyRevenue -
        currentMonthlyWages -
        currentMonthlyPurchases -
        currentMonthlyClaimPayments -
        currentMonthlyInterest -
        currentMonthlyWealthTax;
    const lastNetCashFlow =
        loanConditions.lastMonthlyRevenue -
        loanConditions.lastMonthlyWages -
        loanConditions.lastMonthlyPurchases -
        loanConditions.lastMonthlyClaimPayments -
        lastMonthlyInterest -
        lastMonthlyWealthTax;

    return (
        <div className='space-y-3' data-tour='financial-overview'>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 items-start'>
                <div className='grid grid-cols-1 gap-x-6 gap-y-1' data-tour='financial-cash-flow'>
                    <div className={`flex justify-between gap-2`}>
                        <span className=' text-xs font-semibold text-muted-foreground'>Monthly flow</span>
                        <span className='inline-flex flex-row items-center flex-baseline gap-1 tabular-nums whitespace-nowrap text-xs'>
                            <span className='text-foreground'>current</span>
                            <span className={`text-[10px] w-[50px] text-right text-muted-foreground `}>(last)</span>
                        </span>
                    </div>
                    <Stat
                        label='Revenue'
                        value={
                            <ValueWithSub
                                value={currentMonthlyRevenue}
                                subValue={loanConditions.lastMonthlyRevenue}
                                planetId={planetId}
                            />
                        }
                        icon={<TrendingUp className='h-3 w-3' />}
                    />
                    <Stat
                        label='Wages'
                        value={
                            <ValueWithSub
                                value={currentMonthlyWages}
                                subValue={loanConditions.lastMonthlyWages}
                                planetId={planetId}
                                subValueClassName={
                                    currentMonthlyWages === 0 ? 'text-muted-foreground' : 'text-amber-500/50'
                                }
                            />
                        }
                        icon={<Users className='h-3 w-3' />}
                        valueClassName={currentMonthlyWages === 0 ? 'text-muted-foreground' : 'text-amber-500'}
                    />
                    <Stat
                        label='Purchases'
                        value={
                            <ValueWithSub
                                value={currentMonthlyPurchases}
                                subValue={loanConditions.lastMonthlyPurchases}
                                planetId={planetId}
                                subValueClassName={
                                    currentMonthlyPurchases === 0 ? 'text-muted-foreground' : 'text-amber-500/50'
                                }
                            />
                        }
                        icon={<ShoppingCart className='h-3 w-3' />}
                        valueClassName={currentMonthlyPurchases === 0 ? 'text-muted-foreground' : 'text-amber-500'}
                    />
                    <Stat
                        label='Claims'
                        value={
                            <ValueWithSub
                                value={currentMonthlyClaimPayments}
                                subValue={loanConditions.lastMonthlyClaimPayments}
                                planetId={planetId}
                                subValueClassName={
                                    currentMonthlyClaimPayments === 0 ? 'text-muted-foreground' : 'text-amber-500/50'
                                }
                            />
                        }
                        icon={<Scale className='h-3 w-3' />}
                        valueClassName={currentMonthlyClaimPayments === 0 ? 'text-muted-foreground' : 'text-amber-500'}
                    />
                    <Stat
                        label='Interest'
                        value={
                            <ValueWithSub
                                value={currentMonthlyInterest}
                                subValue={lastMonthlyInterest}
                                planetId={planetId}
                                subValueClassName={
                                    currentMonthlyInterest === 0 ? 'text-muted-foreground' : 'text-amber-500/50'
                                }
                            />
                        }
                        icon={<Percent className='h-3 w-3' />}
                        valueClassName={currentMonthlyInterest === 0 ? 'text-muted-foreground' : 'text-amber-500'}
                    />
                    <Stat
                        label='Wealth tax'
                        value={
                            <ValueWithSub
                                value={currentMonthlyWealthTax}
                                subValue={lastMonthlyWealthTax}
                                planetId={planetId}
                                subValueClassName={
                                    currentMonthlyWealthTax === 0 ? 'text-muted-foreground' : 'text-amber-500/50'
                                }
                            />
                        }
                        icon={<Landmark className='h-3 w-3' />}
                        valueClassName={currentMonthlyWealthTax === 0 ? 'text-muted-foreground' : 'text-amber-500'}
                    />
                    <Stat
                        label='Net cash flow'
                        value={
                            <ValueWithSub
                                value={currentNetCashFlow}
                                subValue={lastNetCashFlow}
                                planetId={planetId}
                                subValueClassName={mutedCashFlowColor(lastNetCashFlow)}
                            />
                        }
                        icon={
                            currentNetCashFlow >= 0 ? (
                                <TrendingUp className='h-3 w-3' />
                            ) : (
                                <TrendingDown className='h-3 w-3' />
                            )
                        }
                        valueClassName={cashFlowColor(currentNetCashFlow)}
                    />
                </div>
                <div className='grid grid-cols-1 gap-y-1' data-tour='financial-positions'>
                    <span className=' text-xs font-semibold text-muted-foreground'>Positions </span>
                    <Stat
                        label='Firm deposits'
                        value={formatNumberWithUnit(deposits, 'currency', planetId)}
                        icon={<Coins className='h-3 w-3' />}
                        valueClassName={
                            deposits < loans ? 'text-amber-600' : deposits === 0 ? 'text-muted-foreground' : ''
                        }
                    />
                    <Stat
                        label='Outstanding loans'
                        value={formatNumberWithUnit(loans, 'currency', planetId)}
                        icon={<TrendingDown className='h-3 w-3' />}
                        valueClassName={
                            loans === 0 ? 'text-muted-foreground' : loans > deposits ? 'text-red-600' : 'text-amber-600'
                        }
                    />
                    <Stat
                        label='Net position (deposits − loans)'
                        value={formatNumberWithUnit(netPosition, 'currency', planetId)}
                        icon={
                            netPosition >= 0 ? <TrendingUp className='h-3 w-3' /> : <TrendingDown className='h-3 w-3' />
                        }
                        valueClassName={
                            netPosition < 0
                                ? 'text-red-500'
                                : netPosition > 0
                                  ? 'text-green-600'
                                  : 'text-muted-foreground'
                        }
                    />
                    <Stat
                        label='Facilities value'
                        value={formatNumberWithUnit(loanConditions.facilitiesCollateral, 'currency', planetId)}
                        icon={<TbBuildingFactory2 className='h-3 w-3' />}
                        valueClassName={'text-muted-foreground'}
                    />
                    <Stat
                        label='Ships value'
                        value={formatNumberWithUnit(loanConditions.shipsCollateral, 'currency', planetId)}
                        icon={<GoRocket className='h-3 w-3' />}
                        valueClassName={'text-muted-foreground'}
                    />
                    <Stat
                        label='Storage value'
                        value={formatNumberWithUnit(loanConditions.storageCollateral, 'currency', planetId)}
                        icon={<Package className='h-3 w-3' />}
                        valueClassName={'text-muted-foreground'}
                    />
                    <Stat
                        label='Depreciation* (last month)'
                        value={formatNumberWithUnit(lastMonthlyDepreciation, 'currency', planetId)}
                        icon={<Trash className='h-3 w-3' />}
                        valueClassName={mutedCashFlowColor(-lastMonthlyDepreciation)}
                    />
                </div>
            </div>
        </div>
    );
}
