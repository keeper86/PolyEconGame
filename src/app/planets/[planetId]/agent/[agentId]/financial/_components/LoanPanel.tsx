'use client';

import { mapTickToDate } from '@/components/client/TickDisplay';
import { useSimulationQuery, useSimulationTick } from '@/hooks/useSimulationQuery';
import { useAddPendingAction, usePendingActions, useRemovePendingByKey } from '@/hooks/useActionOverlay';
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
import { useTour } from '@/components/tour/TourContext';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

type Props = {
    agentId: string;
    planetId: string;
    deposits: number;
};

const LOAN_TYPE_LABELS: Record<Loan['type'], string> = {
    starter: 'Starter',
    discretionary: 'Discretionary',
    wageCoverage: 'Wage coverage',
    rollover: 'Rollover',
    bufferCoverage: 'Buffer coverage',
    claimCoverage: 'Claim coverage',
    shipPenaltyCoverage: 'Ship penalty',
    licenseBootstrap: 'License bootstrap',
    forexWorkingCapital: 'Forex working capital',
    shipbuilderBootstrap: 'Shipbuilder bootstrap',
    consolidated: 'Consolidated',
};

const LOAN_REQUEST_PENDING_KEY = '__loan_request__';

function overlayMessage(isSending: boolean, isAwaitingTick: boolean): string | null {
    if (isSending) {
        return 'Sending request…';
    }
    if (isAwaitingTick) {
        return 'Awaiting next day…';
    }
    return null;
}

function PendingOverlay({ message }: { message: string }) {
    return (
        <div className='absolute inset-0 z-10 flex items-center justify-center bg-background/95 dark:bg-card shadow-inner rounded-lg'>
            <span className='flex items-center gap-2 text-sm font-medium text-foreground'>
                <Spinner className='h-4 w-4' />
                {message}
            </span>
        </div>
    );
}

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
    const addPending = useAddPendingAction();
    const removePendingByKey = useRemovePendingByKey();
    const currentTick = useSimulationTick();

    const repayPendingKey = `__loan_repay__${loan.id}`;

    const pendingActions = usePendingActions(agentId, planetId);
    const hasPendingRepay = pendingActions.some(
        (a) => a.type === 'loanRepay' && a.loanId === loan.id && a.facilityKey === repayPendingKey,
    );

    const repayMutation = useMutation(
        trpc.repayLoan.mutationOptions({
            onSuccess: (result) => {
                onRepaid(result.repaidAmount);
                removePendingByKey(agentId, planetId, repayPendingKey);
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getLoanConditions.queryKey({ agentId, planetId }),
                });
            },
            onError: (err) => {
                removePendingByKey(agentId, planetId, repayPendingKey);
                onError(err instanceof Error ? err.message : 'Repayment failed');
            },
        }),
    );

    const pct = loan.annualInterestRate * 100;

    const isSending = repayMutation.isPending;
    const isAwaitingTick = hasPendingRepay && !isSending;
    const overlayMsg = overlayMessage(isSending, isAwaitingTick);

    return (
        <div className='space-y-2 relative'>
            <div className='text-xs'>
                <div className='flex items-center justify-between gap-2'>
                    <span className='flex items-center'>
                        <span className='font-medium text-foreground'>{LOAN_TYPE_LABELS[loan.type]}</span>
                    </span>
                    <span>Loan Rate {pct.toFixed(1)} %</span>
                    {loan.maturityTick > 0 && <span>Matures: {mapTickToDate(loan.maturityTick)}</span>}
                    {!loan.earlyRepaymentAllowed && <span className='italic'>No early repayment</span>}
                </div>
            </div>

            {loan.earlyRepaymentAllowed && (
                <div className='flex gap-1.5'>
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
                                onClick={() => {
                                    addPending({
                                        type: 'loanRepay',
                                        agentId,
                                        planetId,
                                        triggerTick: currentTick,
                                        facilityKey: repayPendingKey,
                                        loanId: loan.id,
                                    });
                                    repayMutation.mutate({ agentId, planetId, loanId: loan.id, fraction });
                                }}
                            />
                        );
                    })}
                </div>
            )}

            {overlayMsg && <PendingOverlay message={overlayMsg} />}
        </div>
    );
}

export default function LoanPanel({ agentId, planetId, deposits }: Props): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const { isTourActive, markActionCompleted } = useTour();
    const addPending = useAddPendingAction();
    const removePendingByKey = useRemovePendingByKey();
    const currentTick = useSimulationTick();

    const { data: conditionsData, isLoading } = useSimulationQuery(
        trpc.simulation.getLoanConditions.queryOptions({ agentId, planetId }),
    );

    const conditions = conditionsData?.conditions ?? null;
    const activeLoans = conditionsData?.activeLoans ?? [];

    const pendingActions = usePendingActions(agentId, planetId);
    const hasPendingLoanRequest = pendingActions.some(
        (a) => a.type === 'loanRequest' && a.facilityKey === LOAN_REQUEST_PENDING_KEY,
    );

    const requestLoanMutation = useMutation(
        trpc.requestLoan.mutationOptions({
            onSuccess: (result) => {
                toast.success(
                    `Loan request successful: ${formatNumberWithUnit(result.grantedAmount, 'currency', planetId)} will be credited after this tick.`,
                );

                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getLoanConditions.queryKey({ agentId, planetId }),
                });

                // Mark the starter loan as completed so the blocking step is removed
                // and the tour advances to the "Loan taken successfully!" step.
                if (isTourActive && conditions?.isNewAgent) {
                    markActionCompleted('starter-loan');
                }
            },
            onError: (err) => {
                removePendingByKey(agentId, planetId, LOAN_REQUEST_PENDING_KEY);
                toast.error(err instanceof Error ? err.message : 'Loan request failed');
            },
        }),
    );

    const isSendingLoan = requestLoanMutation.isPending;
    const isAwaitingLoan = hasPendingLoanRequest && !isSendingLoan;
    const loanOverlayMsg = overlayMessage(isSendingLoan, isAwaitingLoan);

    return (
        <div className='space-y-3' data-tour='financial-loan-panel'>
            {}
            {isLoading && <p className='text-xs text-muted-foreground'>Loading credit conditions…</p>}

            {!isLoading && conditions === null && (
                <p className='text-xs text-muted-foreground'>
                    Credit conditions unavailable. The agent or planet may not be loaded yet.
                </p>
            )}

            <p className='text-sm font-semibold flex items-center gap-2'>
                <HandCoins className='h-4 w-4 text-muted-foreground' />
                Request a loan
            </p>
            {conditions && (conditions.maxLoanAmount > 0 || conditions.isNewAgent) && (
                <div className='space-y-2 relative'>
                    {conditions.isNewAgent ? (
                        <>
                            <span data-tour='starter-loan'>
                                <CreditButton
                                    variant='starter'
                                    planetId={planetId}
                                    isFull={true}
                                    label={`Take initial loan ${formatNumberWithUnit(conditions.maxLoanAmount, 'units', planetId)}`}
                                    isPending={requestLoanMutation.isPending}
                                    disabled={conditions.maxLoanAmount === 0}
                                    onClick={() => {
                                        addPending({
                                            type: 'loanRequest',
                                            agentId,
                                            planetId,
                                            triggerTick: currentTick,
                                            facilityKey: LOAN_REQUEST_PENDING_KEY,
                                        });
                                        requestLoanMutation.mutate({
                                            agentId,
                                            planetId,
                                            amount: conditions.maxLoanAmount,
                                        });
                                    }}
                                />
                            </span>
                            <p className='text-xs text-muted-foreground'>
                                Maturity: {mapTickToDate(currentTick + LOAN_TERM_TICKS.starter)}
                            </p>
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
                                                addPending({
                                                    type: 'loanRequest',
                                                    agentId,
                                                    planetId,
                                                    triggerTick: currentTick,
                                                    facilityKey: LOAN_REQUEST_PENDING_KEY,
                                                });
                                                requestLoanMutation.mutate({ agentId, planetId, amount });
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {loanOverlayMsg && <PendingOverlay message={loanOverlayMsg} />}
                </div>
            )}

            {conditions && conditions.maxLoanAmount === 0 && !conditions.isNewAgent ? (
                <div className='flex flex-col gap-2'>
                    <Button
                        variant='outline'
                        disabled
                        className='w-full h-[42px] flex items-center gap-2 border-muted-foreground/30 bg-muted/20 cursor-not-allowed'
                    >
                        <HandCoins className='h-[42px] w-[42px]' />
                        <span className='text-md'>No additional credit available</span>
                    </Button>
                    <span className='text-[10px] right-0 text-muted-foreground'>
                        Improve your cash flow (increase revenue or reduce costs) or raise your asset evaluation to
                        unlock further borrowing.
                    </span>
                </div>
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
        <Collapsible defaultOpen={false} className={'space-y-2 '} disabled={activeLoans.length === 0}>
            <CollapsibleTrigger
                className={`text-sm font-semibold flex items-center gap-2 hover:opacity-80 transition-opacity [&[data-state=closed]>svg:last-child]:rotate-0 [&[data-state=open]>svg:last-child]:rotate-180 ${activeLoans.length === 0 ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            >
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
