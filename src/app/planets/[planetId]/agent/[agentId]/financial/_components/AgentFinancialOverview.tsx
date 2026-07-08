'use client';

import { Stat } from '@/components/client/Stat';
import { formatNumberWithUnit } from '@/lib/utils';
import { Coins, TrendingDown, TrendingUp } from 'lucide-react';
import { TbBuildingFactory2 } from 'react-icons/tb';
import React from 'react';

type Props = {
    deposits: number;
    loans: number;
    loanConditions: {
        lastMonthlyRevenue: number;
        lastMonthlyExpenses: number;
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
    const totalAssetsValue =
        loanConditions.shipsCollateral + loanConditions.storageCollateral + loanConditions.facilitiesCollateral;

    return (
        <div className='space-y-3' data-tour='financial-overview'>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2'>
                <div className='grid grid-cols-1 gap-y-1'>
                    <Stat
                        label='Firm deposits'
                        value={formatNumberWithUnit(deposits, 'currency', planetId)}
                        icon={<Coins className='h-3 w-3' />}
                        valueClassName={
                            deposits < loans ? 'text-amber-600' : deposits === 0 ? 'text-muted-foreground' : ''
                        }
                    />
                    <Stat
                        label='Asset value'
                        value={formatNumberWithUnit(totalAssetsValue, 'currency', planetId)}
                        icon={<TbBuildingFactory2 className='h-3 w-3' />}
                        valueClassName={
                            totalAssetsValue + deposits < loans
                                ? 'text-red-600'
                                : totalAssetsValue > 0
                                  ? 'text-green-600'
                                  : 'text-muted-foreground'
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
                </div>
                <div className='grid grid-cols-1 gap-x-6 gap-y-1'>
                    <Stat
                        label='Monthly revenue (last month)'
                        value={formatNumberWithUnit(loanConditions.lastMonthlyRevenue, 'currency', planetId)}
                    />
                    <Stat
                        label='Monthly expenses (last month)'
                        value={formatNumberWithUnit(loanConditions.lastMonthlyExpenses, 'currency', planetId)}
                        valueClassName={
                            loanConditions.lastMonthlyExpenses === 0
                                ? 'text-muted-foreground'
                                : loanConditions.lastMonthlyExpenses > loanConditions.lastMonthlyRevenue
                                  ? 'text-red-500'
                                  : 'text-amber-500'
                        }
                    />
                    <Stat
                        label='Net monthly cash flow (last month)'
                        value={formatNumberWithUnit(loanConditions.monthlyNetCashFlow, 'currency', planetId)}
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
