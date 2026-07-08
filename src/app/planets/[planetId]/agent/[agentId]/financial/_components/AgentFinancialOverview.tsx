'use client';

import { Stat } from '@/components/client/Stat';
import { formatNumberWithUnit } from '@/lib/utils';
import { Coins, ShoppingCart, Scale, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { TbBuildingFactory2 } from 'react-icons/tb';
import React from 'react';
import { GoRocket } from 'react-icons/go';

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
    planetId: string;
    agentId: string;
};

export default function AgentFinancialOverview({
    deposits,
    loans,
    loanConditions,
    planetId,
}: Props): React.ReactElement {
    const totalAssetsValue = loanConditions.shipsCollateral;
    const netPosition = deposits - loans;

    return (
        <div className='space-y-3' data-tour='financial-overview'>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                <div className='grid grid-cols-1 gap-y-1'>
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
                </div>
                <div className='grid grid-cols-1 gap-x-6 gap-y-1'>
                    <span className=' text-xs font-semibold text-muted-foreground'>Monthly flow (last) </span>
                    <Stat
                        label='Revenue'
                        value={formatNumberWithUnit(loanConditions.lastMonthlyRevenue, 'currency', planetId)}
                        icon={<TrendingUp className='h-3 w-3' />}
                    />
                    <Stat
                        label='Wages'
                        value={formatNumberWithUnit(loanConditions.lastMonthlyWages, 'currency', planetId)}
                        icon={<Users className='h-3 w-3' />}
                        valueClassName={
                            loanConditions.lastMonthlyWages === 0 ? 'text-muted-foreground' : 'text-amber-500'
                        }
                    />
                    <Stat
                        label='Purchases'
                        value={formatNumberWithUnit(loanConditions.lastMonthlyPurchases, 'currency', planetId)}
                        icon={<ShoppingCart className='h-3 w-3' />}
                        valueClassName={
                            loanConditions.lastMonthlyPurchases === 0 ? 'text-muted-foreground' : 'text-amber-500'
                        }
                    />
                    <Stat
                        label='Claims'
                        value={formatNumberWithUnit(loanConditions.lastMonthlyClaimPayments, 'currency', planetId)}
                        icon={<Scale className='h-3 w-3' />}
                        valueClassName={
                            loanConditions.lastMonthlyClaimPayments === 0 ? 'text-muted-foreground' : 'text-amber-500'
                        }
                    />
                    <Stat
                        label='Net cash flow'
                        value={formatNumberWithUnit(loanConditions.monthlyNetCashFlow, 'currency', planetId)}
                        icon={
                            loanConditions.monthlyNetCashFlow >= 0 ? (
                                <TrendingUp className='h-3 w-3' />
                            ) : (
                                <TrendingDown className='h-3 w-3' />
                            )
                        }
                        valueClassName={
                            loanConditions.monthlyNetCashFlow === 0
                                ? 'text-muted-foreground'
                                : loanConditions.monthlyNetCashFlow > 0
                                  ? 'text-green-600'
                                  : 'text-red-500'
                        }
                    />
                </div>
            </div>
        </div>
    );
}
