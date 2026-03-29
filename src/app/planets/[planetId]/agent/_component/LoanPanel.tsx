'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, BadgeDollarSign, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function LoanPanel({ agentId, planetId }: Props): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const [requestedAmount, setRequestedAmount] = useState('');
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // ------------------------------------------------------------------
    // Poll credit conditions from the simulation (read-only, live query)
    // ------------------------------------------------------------------
    const { data: conditionsData, isLoading } = useSimulationQuery(
        trpc.simulation.getLoanConditions.queryOptions({ agentId, planetId }),
    );

    const conditions = conditionsData?.conditions ?? null;

    // ------------------------------------------------------------------
    // Request-loan mutation
    // ------------------------------------------------------------------
    const requestLoanMutation = useMutation(
        trpc.requestLoan.mutationOptions({
            onSuccess: (result) => {
                setSuccessMsg(
                    `Loan of ${formatNumbers(result.grantedAmount)} approved! Funds will appear after the next tick.`,
                );
                setErrorMsg(null);
                setRequestedAmount('');
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

    const handleRequest = () => {
        const amount = parseInt(requestedAmount, 10);
        if (isNaN(amount) || amount <= 0) {
            setErrorMsg('Please enter a valid positive amount.');
            return;
        }
        setErrorMsg(null);
        requestLoanMutation.mutate({ agentId, planetId, amount });
    };

    const parsedAmount = parseInt(requestedAmount, 10);
    const amountValid =
        !isNaN(parsedAmount) && parsedAmount > 0 && conditions != null && parsedAmount <= conditions.maxLoanAmount;

    // ------------------------------------------------------------------
    // Render
    // ------------------------------------------------------------------
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
                    <p className='text-xs text-muted-foreground font-medium mb-1'>Bank offer</p>

                    <Stat
                        label='Maximum loan amount'
                        value={formatNumbers(conditions.maxLoanAmount)}
                        valueClassName={conditions.maxLoanAmount > 0 ? 'text-green-600' : 'text-muted-foreground'}
                    />
                    <Stat
                        label='Annual interest rate'
                        value={`${(conditions.annualInterestRate * 100).toFixed(2)} %`}
                    />
                    <Stat
                        label='Existing loans'
                        value={formatNumbers(conditions.existingDiscretionaryLoans)}
                        valueClassName={conditions.existingDiscretionaryLoans > 0 ? 'text-amber-500' : ''}
                    />

                    {conditions.isNewAgent ? (
                        <p className='text-xs text-muted-foreground mt-1'>Starter loan — no revenue history yet.</p>
                    ) : (
                        <>
                            <Stat
                                label='Monthly revenue (projected)'
                                value={formatNumbers(conditions.monthlyRevenue)}
                            />
                            <Stat
                                label='Monthly wage cost (projected)'
                                value={formatNumbers(conditions.monthlyWageBill)}
                            />
                            <Stat
                                label='Net monthly cash flow'
                                value={formatNumbers(conditions.monthlyNetCashFlow)}
                                valueClassName={conditions.monthlyNetCashFlow >= 0 ? 'text-green-600' : 'text-red-500'}
                            />
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

            {/* Borrow form */}
            {conditions && conditions.maxLoanAmount > 0 && (
                <div className='space-y-2'>
                    <p className='text-xs text-muted-foreground font-medium'>Request a loan</p>
                    <div className='flex gap-2 items-center'>
                        <Input
                            type='number'
                            min={1}
                            max={conditions.maxLoanAmount}
                            placeholder={`Max ${formatNumbers(conditions.maxLoanAmount)}`}
                            value={requestedAmount}
                            onChange={(e) => {
                                setRequestedAmount(e.target.value);
                                setErrorMsg(null);
                                setSuccessMsg(null);
                            }}
                            className='h-8 text-xs'
                        />
                        <Button
                            size='sm'
                            className='h-8 whitespace-nowrap'
                            disabled={!amountValid || requestLoanMutation.isPending}
                            onClick={handleRequest}
                        >
                            <BadgeDollarSign className='h-3.5 w-3.5 mr-1' />
                            {requestLoanMutation.isPending ? 'Processing…' : 'Borrow'}
                        </Button>
                    </div>
                    <p className='text-xs text-muted-foreground'>
                        The funds will be credited to your account after the current tick completes.
                    </p>
                </div>
            )}

            {conditions && conditions.maxLoanAmount === 0 && (
                <p className='text-xs text-muted-foreground'>
                    The bank is not offering additional credit at this time. Improve your cash flow (increase revenue or
                    reduce costs) to unlock further borrowing.
                </p>
            )}
        </div>
    );
}
