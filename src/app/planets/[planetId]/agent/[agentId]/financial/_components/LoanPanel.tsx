'use client';

import { mapTickToDate } from '@/components/client/TickDisplay';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import type { Loan } from '@/simulation/financial/loanTypes';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, BadgeDollarSign, CheckCircle2, Landmark } from 'lucide-react';
import React, { useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

type Props = {
    agentId: string;
    planetId: string;
    deposits: number;
};

const LOAN_TYPE_LABELS: Record<Loan['type'], string> = {
    starter: 'Starter',
    discretionary: 'Discretionary',
    wageCoverage: 'Wage coverage',
    bufferCoverage: 'Buffer coverage',
    claimCoverage: 'Claim coverage',
    shipPenaltyCoverage: 'Ship penalty',
    licenseBootstrap: 'License bootstrap',
    forexWorkingCapital: 'Forex working capital',
};

function LoanRow({
    loan,
    deposits,
    agentId,
    planetId,
    onRepaid,
    onError,
}: {
    loan: Loan;
    deposits: number;
    agentId: string;
    planetId: string;
    onRepaid: (amount: number) => void;
    onError: (msg: string) => void;
}) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const repayMutation = useMutation(
        trpc.repayLoan.mutationOptions({
            onSuccess: (result) => {
                onRepaid(result.repaidAmount);
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getLoanConditions.queryKey({ agentId, planetId }),
                });
            },
            onError: (err) => {
                onError(err instanceof Error ? err.message : 'Repayment failed');
            },
        }),
    );

    const pct = loan.annualInterestRate * 100;

    return (
        <div className='border rounded-md p-2.5 space-y-2 text-xs'>
            <div className='flex items-center justify-between gap-2'>
                <span className='font-medium text-foreground'>{LOAN_TYPE_LABELS[loan.type]}</span>
                <span className='text-muted-foreground tabular-nums'>
                    {formatNumberWithUnit(loan.remainingPrincipal, 'currency', planetId)}
                    {loan.remainingPrincipal !== loan.principal && (
                        <span className='opacity-60'>
                            {' / '}
                            {formatNumberWithUnit(loan.principal, 'currency', planetId)}
                        </span>
                    )}
                </span>
            </div>
            <div className='flex gap-3 text-muted-foreground'>
                <span>APR {pct.toFixed(1)} %</span>
                {loan.maturityTick > 0 && <span>Matures tick {mapTickToDate(loan.maturityTick)}</span>}
                {!loan.earlyRepaymentAllowed && <span className='italic'>No early repayment</span>}
            </div>
            {loan.earlyRepaymentAllowed && (
                <div className='flex gap-1.5'>
                    {([0.25, 0.5, 1] as const).map((fraction) => {
                        const amount = Math.floor(loan.remainingPrincipal * fraction);
                        const canAfford = deposits >= amount;
                        const label = fraction === 1 ? '100 %' : fraction === 0.5 ? '50 %' : '25 %';
                        return (
                            <Button
                                key={fraction}
                                size='sm'
                                variant={fraction === 1 ? 'default' : 'outline'}
                                className={`flex-1 h-8 text-[11px] ${fraction === 1 ? 'bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-700 dark:hover:bg-amber-600' : 'border-amber-600 text-amber-700 dark:text-amber-400 dark:border-amber-500'}`}
                                disabled={repayMutation.isPending || !canAfford || amount === 0}
                                onClick={() => repayMutation.mutate({ agentId, planetId, loanId: loan.id, fraction })}
                            >
                                <span>{label}</span>
                                <span className='opacity-75 ml-1'>
                                    {formatNumberWithUnit(amount, 'currency', planetId)}
                                </span>
                            </Button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default function LoanPanel({ agentId, planetId, deposits }: Props): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const { data: conditionsData, isLoading } = useSimulationQuery(
        trpc.simulation.getLoanConditions.queryOptions({ agentId, planetId }),
    );

    const conditions = conditionsData?.conditions ?? null;
    const activeLoans = conditionsData?.activeLoans ?? [];

    const requestLoanMutation = useMutation(
        trpc.requestLoan.mutationOptions({
            onSuccess: (result) => {
                setSuccessMsg(
                    `Loan of ${formatNumberWithUnit(result.grantedAmount, 'currency', planetId)} approved! Funds will appear after the next tick.`,
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
                                    : `Take initial loan ${formatNumberWithUnit(conditions.maxLoanAmount, 'currency', planetId)}`}
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
                                                {formatNumberWithUnit(amount, 'currency', planetId)}
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

            {/* Outstanding loans list */}
            {activeLoans.length > 0 && (
                <div className='space-y-2'>
                    <p className='text-xs text-muted-foreground font-medium flex items-center gap-1'>
                        <Landmark className='h-3.5 w-3.5' />
                        Outstanding loans
                    </p>
                    {activeLoans.map((loan) => (
                        <LoanRow
                            key={loan.id}
                            loan={loan}
                            deposits={deposits}
                            agentId={agentId}
                            planetId={planetId}
                            onRepaid={(amount) => {
                                setSuccessMsg(
                                    `Repaid ${formatNumberWithUnit(amount, 'currency', planetId)} — loan partially or fully settled.`,
                                );
                                setErrorMsg(null);
                            }}
                            onError={(msg) => {
                                setErrorMsg(msg);
                                setSuccessMsg(null);
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
