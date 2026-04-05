'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, BadgeDollarSign, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTRPC } from '@/lib/trpc';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { formatNumbers } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

type Props = {
    agentId: string;
    planetId: string;
};

/* ------------------------------------------------------------------ */
/*  Stat row helper (mirrors AgentFinancialPanel)                     */
/* ------------------------------------------------------------------ */

function Stat({
    label,
    value,
    valueClassName,
}: {
    label: string;
    value: React.ReactNode;
    valueClassName?: string;
}): React.ReactElement {
    return (
        <div className='flex items-baseline justify-between gap-2'>
            <span className='text-xs text-muted-foreground truncate'>{label}</span>
            <span className={`tabular-nums whitespace-nowrap text-xs font-medium ${valueClassName ?? ''}`}>
                {value}
            </span>
        </div>
    );
}

export default function LoanPanel({ agentId, planetId }: Props): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const { data: conditionsData, isLoading } = useSimulationQuery(
        trpc.simulation.getLoanConditions.queryOptions({ agentId, planetId }),
    );

    const conditions = conditionsData?.conditions ?? null;

    const requestLoanMutation = useMutation(
        trpc.requestLoan.mutationOptions({
            onSuccess: (result) => {
                setSuccessMsg(
                    `Loan of ${formatNumbers(result.grantedAmount)} approved! Funds will appear after the next tick.`,
                );
                setErrorMsg(null);
                // Invalidate the loan-conditions query so the panel refreshes
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getLoanConditions.queryKey({ agentId, planetId }),
                });
            },
            onError: (err) => {
                setErrorMsg(err instanceof Error ? err.message : 'Loan request failed');
                setSuccessMsg(null);
            },
        }),
    );

    return (
        <div className='space-y-3'>
            {/* Credit conditions */}
            {isLoading && <p className='text-xs text-muted-foreground'>Loading credit conditions…</p>}

            {!isLoading && conditions === null && (
                <p className='text-xs text-muted-foreground'>
                    Credit conditions unavailable. The agent or planet may not be loaded yet.
                </p>
            )}

            {conditions && (
                <div className='space-y-1'>
                    <Stat
                        label='Annual interest rate'
                        value={`${(conditions.annualInterestRate * 100).toFixed(2)} %`}
                    />

                    {!conditions.isNewAgent && (
                        <>
                            <Stat
                                label='Existing loans'
                                value={formatNumbers(conditions.existingLoans)}
                                valueClassName={conditions.existingLoans > 0 ? 'text-amber-500' : ''}
                            />
                            <Stat
                                label='Monthly revenue (blended)'
                                value={formatNumbers(conditions.blendedMonthlyRevenue)}
                            />
                            <Stat
                                label='Monthly wage cost (blended)'
                                value={formatNumbers(conditions.blendedMonthlyWages)}
                            />
                            <Stat
                                label='Net monthly cash flow'
                                value={formatNumbers(conditions.monthlyNetCashFlow)}
                                valueClassName={conditions.monthlyNetCashFlow >= 0 ? 'text-green-600' : 'text-red-500'}
                            />
                            <Stat label='Storage collateral' value={formatNumbers(conditions.storageCollateral)} />
                        </>
                    )}
                </div>
            )}

            {/* Feedback messages */}
            {successMsg && (
                <Alert className='border-green-500 bg-green-50 dark:bg-green-950'>
                    <CheckCircle2 className='h-4 w-4 text-green-600' />
                    <AlertDescription className='text-green-700 dark:text-green-300 text-xs'>
                        {successMsg}
                    </AlertDescription>
                </Alert>
            )}
            {errorMsg && (
                <Alert variant='destructive'>
                    <AlertCircle className='h-4 w-4' />
                    <AlertDescription className='text-xs'>{errorMsg}</AlertDescription>
                </Alert>
            )}

            {conditions && (conditions.maxLoanAmount > 0 || !conditions.isNewAgent) && (
                <div className='space-y-2'>
                    {conditions.isNewAgent ? (
                        <Button
                            className='w-full h-14 flex flex-col gap-0.5 bg-green-600 hover:bg-green-700 text-white dark:bg-green-700 dark:hover:bg-green-600'
                            disabled={requestLoanMutation.isPending}
                            onClick={() => {
                                setErrorMsg(null);
                                setSuccessMsg(null);
                                requestLoanMutation.mutate({ agentId, planetId, amount: conditions.maxLoanAmount });
                            }}
                        >
                            <BadgeDollarSign className='h-5 w-5' />
                            <span className='text-sm font-semibold leading-none'>
                                {requestLoanMutation.isPending
                                    ? 'Processing…'
                                    : `Take initial loan ${formatNumbers(conditions.maxLoanAmount)}`}
                            </span>
                        </Button>
                    ) : (
                        <>
                            <p className='text-xs text-muted-foreground font-medium'>Request a loan</p>
                            <div className='flex justify-between gap-2'>
                                {(
                                    [
                                        { label: '25 %', fraction: 0.25 },
                                        { label: '50 %', fraction: 0.5 },
                                        { label: '100 %', fraction: 1 },
                                    ] as const
                                ).map(({ label, fraction }) => {
                                    const amount = Math.floor(conditions.maxLoanAmount * fraction);
                                    const isFull = fraction === 1;
                                    return (
                                        <Button
                                            key={label}
                                            className={`flex-1 h-14 flex flex-col gap-0.5 ${
                                                isFull
                                                    ? 'bg-green-600 hover:bg-green-700 text-white dark:bg-green-700 dark:hover:bg-green-600'
                                                    : 'border border-green-600 text-green-700 bg-transparent hover:bg-green-50 dark:text-green-400 dark:border-green-500 dark:hover:bg-green-950'
                                            }`}
                                            disabled={requestLoanMutation.isPending || conditions.maxLoanAmount === 0}
                                            onClick={() => {
                                                setErrorMsg(null);
                                                setSuccessMsg(null);
                                                requestLoanMutation.mutate({ agentId, planetId, amount });
                                            }}
                                        >
                                            <BadgeDollarSign className='h-4 w-4' />
                                            <span className='text-xs font-semibold leading-none'>{label}</span>
                                            <span className='text-[10px] leading-none opacity-75'>
                                                {formatNumbers(amount)}
                                            </span>
                                        </Button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}

            {conditions && conditions.maxLoanAmount === 0 && !conditions.isNewAgent ? (
                <p className='text-xs text-muted-foreground'>
                    The bank is not offering additional credit at this time. Improve your cash flow (increase revenue or
                    reduce costs) to unlock further borrowing.
                </p>
            ) : (
                <p className='text-xs text-muted-foreground'>
                    The funds will be credited to your account after the current tick completes.
                </p>
            )}
        </div>
    );
}
