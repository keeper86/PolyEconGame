'use client';

import { mapTickToDate } from '@/components/client/TickDisplay';
import { useSimulationQuery, useSimulationTick } from '@/hooks/useSimulationQuery';
import { useAddPendingAction, usePendingActions, useRemovePendingByKey } from '@/hooks/useActionOverlay';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import { LOAN_TERM_TICKS, type Loan } from '@/simulation/financial/loanTypes';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, ChevronDown, HandCoins, Landmark } from 'lucide-react';
import React from 'react';
import { toast } from 'sonner';
import CreditButton from './CreditButton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { useTour } from '@/components/tour/TourContext';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/i18n/errors';
import { useLocale, useTranslations } from 'next-intl';

type Props = {
    agentId: string;
    planetId: string;
    deposits: number;
};

type LoanTypeKey =
    | 'starter'
    | 'discretionary'
    | 'wageCoverage'
    | 'emergency'
    | 'governmentSupport'
    | 'rollover'
    | 'bufferCoverage'
    | 'claimCoverage'
    | 'shipPenaltyCoverage'
    | 'licenseBootstrap'
    | 'forexWorkingCapital'
    | 'shipbuilderBootstrap'
    | 'consolidated';

const LOAN_TYPE_LABEL_KEYS: Record<Loan['type'], LoanTypeKey> = {
    starter: 'starter',
    discretionary: 'discretionary',
    wageCoverage: 'wageCoverage',
    emergency: 'emergency',
    governmentSupport: 'governmentSupport',
    rollover: 'rollover',
    bufferCoverage: 'bufferCoverage',
    claimCoverage: 'claimCoverage',
    shipPenaltyCoverage: 'shipPenaltyCoverage',
    licenseBootstrap: 'licenseBootstrap',
    forexWorkingCapital: 'forexWorkingCapital',
    shipbuilderBootstrap: 'shipbuilderBootstrap',
    consolidated: 'consolidated',
};

const LOAN_REQUEST_PENDING_KEY = '__loan_request__';

type OverlayMessageKey = 'sendingRequest' | 'awaitingNextDay';

function overlayMessage(
    t: (key: OverlayMessageKey) => string,
    isSending: boolean,
    isAwaitingTick: boolean,
): string | null {
    if (isSending) {
        return t('sendingRequest');
    }
    if (isAwaitingTick) {
        return t('awaitingNextDay');
    }
    return null;
}

function PendingOverlay({ message }: { message: string }) {
    return (
        <div className='absolute inset-0 z-10 flex items-center justify-center bg-background/95 dark:bg-card shadow-inner rounded-lg pointer-events-none'>
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
    onError: (error: unknown) => void;
}) {
    const locale = useLocale();
    const t = useTranslations('Financial');
    const tLoanType = useTranslations('Financial.loanTypes');
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const addPending = useAddPendingAction();

    const repayPendingKey = `__loan_repay__${loan.id}`;

    const pendingActions = usePendingActions(agentId, planetId);
    const hasPendingRepay = pendingActions.some(
        (a) => a.type === 'loanRepay' && a.loanId === loan.id && a.facilityKey === repayPendingKey,
    );

    const repayMutation = useMutation(
        trpc.repayLoan.mutationOptions({
            onSuccess: (result) => {
                onRepaid(result.repaidAmount);
                addPending({
                    type: 'loanRepay',
                    agentId,
                    planetId,
                    triggerTick: result.processedAtTick,
                    facilityKey: repayPendingKey,
                    loanId: loan.id,
                });
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getLoanConditions.queryKey({ agentId, planetId }),
                });
            },
            onError: (err) => {
                onError(err);
            },
        }),
    );

    const pct = loan.annualInterestRate * 100;
    const monthlyInterest = (loan.remainingPrincipal * loan.annualInterestRate) / 12;

    const isSending = repayMutation.isPending;
    const isAwaitingTick = hasPendingRepay && !isSending;
    const overlayMsg = overlayMessage(t, isSending, isAwaitingTick);

    return (
        <div className='space-y-2 relative'>
            <div className='text-xs'>
                <div className='flex items-center justify-between gap-2'>
                    <span className='flex items-center'>
                        <span className='font-medium text-foreground'>
                            {tLoanType(LOAN_TYPE_LABEL_KEYS[loan.type])}
                        </span>
                    </span>
                    <span>
                        {t('loanRate', {
                            rate: pct.toFixed(1),
                            monthly: formatNumberWithUnit(monthlyInterest, 'currency', planetId, locale),
                        })}
                    </span>
                    {loan.maturityTick > 0 && <span>{t('matures', { date: mapTickToDate(loan.maturityTick) })}</span>}
                    {!loan.earlyRepaymentAllowed && <span className='italic'>{t('noEarlyRepayment')}</span>}
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
                                amount={formatNumberWithUnit(amount, 'units', planetId, locale)}
                                isFull={fraction === 1}
                                disabled={
                                    repayMutation.isPending || !canAfford || amount === 0 || !loan.earlyRepaymentAllowed
                                }
                                planetId={planetId}
                                onClick={() => {
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
    const locale = useLocale();
    const t = useTranslations('Toasts');
    const tf = useTranslations('Financial');
    const showError = useErrorMessage();
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
                    t('loanRequested', {
                        amount: formatNumberWithUnit(result.grantedAmount, 'currency', planetId, locale),
                    }),
                );

                addPending({
                    type: 'loanRequest',
                    agentId,
                    planetId,
                    triggerTick: result.processedAtTick,
                    facilityKey: LOAN_REQUEST_PENDING_KEY,
                });

                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getLoanConditions.queryKey({ agentId, planetId }),
                });

                if (isTourActive && conditions?.isNewAgent) {
                    markActionCompleted('starter-loan');
                }
            },
            onError: (err) => {
                removePendingByKey(agentId, planetId, LOAN_REQUEST_PENDING_KEY);
                toast.error(err instanceof Error ? showError(err) : t('loanRequestFailed'));
            },
        }),
    );

    const isSendingLoan = requestLoanMutation.isPending;
    const isAwaitingLoan = hasPendingLoanRequest && !isSendingLoan;
    const loanOverlayMsg = overlayMessage(tf, isSendingLoan, isAwaitingLoan);

    return (
        <div className='space-y-3' data-tour='financial-loan-panel'>
            {}
            {isLoading && <p className='text-xs text-muted-foreground'>{tf('loadingConditions')}</p>}

            {!isLoading && conditions === null && (
                <p className='text-xs text-muted-foreground'>{tf('conditionsUnavailable')}</p>
            )}

            <p className='text-sm font-semibold flex items-center gap-2'>
                <HandCoins className='h-4 w-4 text-muted-foreground' />
                {tf('requestLoan')}
            </p>
            {conditions && (
                <p className='text-xs text-muted-foreground'>
                    {tf('interestOnNewLoans')}{' '}
                    <span className='text-foreground'>
                        {tf('interestRateValue', { rate: (conditions.annualInterestRate * 100).toFixed(1) })}
                    </span>
                </p>
            )}
            {conditions && (conditions.maxLoanAmount > 0 || conditions.isNewAgent) && (
                <div className='space-y-2 relative'>
                    {conditions.isNewAgent ? (
                        <>
                            <span data-tour='starter-loan'>
                                <CreditButton
                                    variant='starter'
                                    planetId={planetId}
                                    isFull={true}
                                    label={tf('takeInitialLoan', {
                                        amount: formatNumberWithUnit(
                                            conditions.maxLoanAmount,
                                            'units',
                                            planetId,
                                            locale,
                                        ),
                                    })}
                                    isPending={requestLoanMutation.isPending}
                                    disabled={conditions.maxLoanAmount === 0}
                                    onClick={() => {
                                        requestLoanMutation.mutate({
                                            agentId,
                                            planetId,
                                            amount: conditions.maxLoanAmount,
                                        });
                                    }}
                                />
                            </span>
                            <p className='text-xs text-muted-foreground'>
                                {tf('maturity', { date: mapTickToDate(currentTick + LOAN_TERM_TICKS.starter) })}
                            </p>
                        </>
                    ) : (
                        <>
                            <p className='text-xs text-muted-foreground '>
                                {tf('maturity', { date: mapTickToDate(currentTick + LOAN_TERM_TICKS.discretionary) })}
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
                                            amount={formatNumberWithUnit(amount, 'units', planetId, locale)}
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
                        <Ban className='h-5 w-5 text-muted-foreground' />
                        <span className='text-md'>{tf('noAdditionalCredit')}</span>
                    </Button>
                    <span className='text-[10px] right-0 text-muted-foreground'>{tf('improveCashFlow')}</span>
                </div>
            ) : (
                <p className='text-xs text-muted-foreground'>{tf('fundsCredited')}</p>
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
    const locale = useLocale();
    const t = useTranslations('Toasts');
    const tf = useTranslations('Financial');
    const showError = useErrorMessage();
    return (
        <Collapsible defaultOpen={false} className={'space-y-2 '} disabled={activeLoans.length === 0}>
            <CollapsibleTrigger
                className={`text-sm font-semibold flex items-center gap-2 hover:opacity-80 transition-opacity [&[data-state=closed]>svg:last-child]:rotate-0 [&[data-state=open]>svg:last-child]:rotate-180 ${activeLoans.length === 0 ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            >
                <Landmark className='h-4 w-4 text-muted-foreground' />
                {tf('outstandingLoansCount', { count: activeLoans.length })}
                <ChevronDown className='h-4 w-4 text-muted-foreground transition-transform duration-200' />
            </CollapsibleTrigger>
            <CollapsibleContent>
                <p className='text-xs text-muted-foreground'>{tf('payBackEarly')}</p>
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
                                    t('loanRepaid', {
                                        amount: formatNumberWithUnit(amount, 'currency', planetId, locale),
                                    }),
                                );
                            }}
                            onError={showError}
                        />
                    ))}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}
