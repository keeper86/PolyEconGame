'use client';

import { mapTickToDate } from '@/components/client/TickDisplay';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import { LOAN_TERM_TICKS, type Loan } from '@/simulation/financial/loanTypes';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, HandCoins, Landmark } from 'lucide-react';
import React from 'react';
import { toast } from 'sonner';
import CreditButton from './CreditButton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';

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
    shipbuilderBootstrap: 'Shipbuilder bootstrap',
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
        <div className='text-xs'>
            <div className='flex items-center justify-between gap-2'>
                <span className='flex items-center'>
                    <span className='font-medium text-foreground'>{LOAN_TYPE_LABELS[loan.type]}</span>
                </span>

                <span>Loan Rate {pct.toFixed(1)} %</span>
                {loan.maturityTick > 0 && <span>Matures: {mapTickToDate(loan.maturityTick)}</span>}
                {!loan.earlyRepaymentAllowed && <span className='italic'>No early repayment</span>}
            </div>

            {loan.earlyRepaymentAllowed && (
                <div className='flex gap-1.5 mt-1'>
                    {([0.25, 0.5, 1] as const).map((fraction) => {
                        const amount = Math.floor(loan.remainingPrincipal * fraction);
                        const canAfford = deposits >= amount;
                        const label = fraction === 1 ? '100 %' : fraction === 0.5 ? '50 %' : '25 %';
                        return (
                            <CreditButton
                                key={fraction}
                                variant='payback'
                                label={label}
                                amount={formatNumberWithUnit(amount, 'units', planetId)}
                                isFull={fraction === 1}
                                disabled={
                                    repayMutation.isPending || !canAfford || amount === 0 || !loan.earlyRepaymentAllowed
                                }
                                planetId={planetId}
                                onClick={() => repayMutation.mutate({ agentId, planetId, loanId: loan.id, fraction })}
                            />
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

    const { data: conditionsData, isLoading } = useSimulationQuery(
        trpc.simulation.getLoanConditions.queryOptions({ agentId, planetId }),
    );

    const { data: currentTickData } = useSimulationQuery(trpc.simulation.getCurrentTick.queryOptions());
    const currentTick = currentTickData?.tick ?? 0;

    const conditions = conditionsData?.conditions ?? null;
    const activeLoans = conditionsData?.activeLoans ?? [];

    const requestLoanMutation = useMutation(
        trpc.requestLoan.mutationOptions({
            onSuccess: (result) => {
                toast.success(
                    `Loan request successful: ${formatNumberWithUnit(result.grantedAmount, 'currency', planetId)} will be credited after this tick.`,
                );
                // Invalidate the loan-conditions query so the panel refreshes
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getLoanConditions.queryKey({ agentId, planetId }),
                });
            },
            onError: (err) => {
                toast.error(err instanceof Error ? err.message : 'Loan request failed');
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

            {conditions && (conditions.maxLoanAmount > 0 || !conditions.isNewAgent) && (
                <div className='space-y-2'>
                    <p className='text-sm font-semibold flex items-center gap-2'>
                        <HandCoins className='h-4 w-4 text-muted-foreground' />
                        Request a loan
                    </p>
                    {conditions.isNewAgent ? (
                        <>
                            <p className='text-xs text-muted-foreground'>
                                Maturity: {mapTickToDate(currentTick + LOAN_TERM_TICKS.starter)}
                            </p>
                            <CreditButton
                                variant='starter'
                                planetId={planetId}
                                isFull={true}
                                label={`Take initial loan ${formatNumberWithUnit(conditions.maxLoanAmount, 'units', planetId)}`}
                                isPending={requestLoanMutation.isPending}
                                disabled={conditions.maxLoanAmount === 0}
                                onClick={() => {
                                    requestLoanMutation.mutate({ agentId, planetId, amount: conditions.maxLoanAmount });
                                }}
                            />
                        </>
                    ) : (
                        <>
                            <p className='text-xs text-muted-foreground '>
                                Maturity: {mapTickToDate(currentTick + LOAN_TERM_TICKS.discretionary)}
                            </p>
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
                                        <CreditButton
                                            key={label}
                                            label={label}
                                            amount={formatNumberWithUnit(amount, 'units', planetId)}
                                            isFull={isFull}
                                            isPending={requestLoanMutation.isPending}
                                            disabled={conditions.maxLoanAmount === 0}
                                            planetId={planetId}
                                            onClick={() => {
                                                requestLoanMutation.mutate({ agentId, planetId, amount });
                                            }}
                                        />
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

            <Separator />

            <OutstandingLoansSection
                activeLoans={activeLoans}
                deposits={deposits}
                agentId={agentId}
                planetId={planetId}
            />
        </div>
    );
}

function OutstandingLoansSection({
    activeLoans,
    deposits,
    agentId,
    planetId,
}: {
    activeLoans: Loan[];
    deposits: number;
    agentId: string;
    planetId: string;
}) {
    return (
        <Collapsible defaultOpen={false} className='space-y-2'>
            <CollapsibleTrigger className='text-sm font-semibold flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity [&[data-state=closed]>svg:last-child]:rotate-0 [&[data-state=open]>svg:last-child]:rotate-180'>
                <Landmark className='h-4 w-4 text-muted-foreground' />
                Outstanding loans ({activeLoans.length})
                <ChevronDown className='h-4 w-4 text-muted-foreground transition-transform duration-200' />
            </CollapsibleTrigger>
            <CollapsibleContent>
                <p className='text-xs text-muted-foreground'>Pay back early:</p>
                <div className='space-y-2 pt-1'>
                    {activeLoans.map((loan) => (
                        <LoanRow
                            key={loan.id}
                            loan={loan}
                            deposits={deposits}
                            agentId={agentId}
                            planetId={planetId}
                            onRepaid={(amount) => {
                                toast.success(
                                    `Repaid ${formatNumberWithUnit(amount, 'currency', planetId)} — loan partially or fully settled.`,
                                );
                            }}
                            onError={(msg) => {
                                toast.error(msg);
                            }}
                        />
                    ))}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}
