'use client';

import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Bot, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useTRPC } from '@/lib/trpc';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

type Props = {
    agentId: string;
    /** Current server-side state (from the last getAgentPlanetDetail query). */
    automateWorkerAllocation: boolean;
    automatePricing: boolean;
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function AutomationPanel({
    agentId,
    automateWorkerAllocation: initialWorker,
    automatePricing: initialPricing,
}: Props): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const [expanded, setExpanded] = useState(false);
    const [workerAuto, setWorkerAuto] = useState(initialWorker);
    const [pricingAuto, setPricingAuto] = useState(initialPricing);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Keep local state in sync when the parent re-renders with a fresh snapshot
    useEffect(() => {
        setWorkerAuto(initialWorker);
    }, [initialWorker]);
    useEffect(() => {
        setPricingAuto(initialPricing);
    }, [initialPricing]);

    // ------------------------------------------------------------------
    // Mutation
    // ------------------------------------------------------------------
    const setAutomationMutation = useMutation(
        trpc.setAutomation.mutationOptions({
            onSuccess: () => {
                setSuccessMsg('Automation settings saved. Changes take effect on the next tick.');
                setErrorMsg(null);
                // Invalidate agent detail queries so the parent re-fetches
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getAgentPlanetDetail.queryKey(),
                });
            },
            onError: (err) => {
                setErrorMsg(err instanceof Error ? err.message : 'Failed to update automation settings');
                setSuccessMsg(null);
            },
        }),
    );

    const handleToggle = (field: 'worker' | 'pricing', value: boolean) => {
        const next = {
            automateWorkerAllocation: field === 'worker' ? value : workerAuto,
            automatePricing: field === 'pricing' ? value : pricingAuto,
        };

        // Optimistically update local state
        if (field === 'worker') {
            setWorkerAuto(value);
        } else {
            setPricingAuto(value);
        }
        setSuccessMsg(null);
        setErrorMsg(null);

        setAutomationMutation.mutate({
            agentId,
            ...next,
        });
    };

    // ------------------------------------------------------------------
    // Render
    // ------------------------------------------------------------------
    return (
        <div className='border rounded-md p-3 space-y-3'>
            {/* Header / toggle */}
            <button
                type='button'
                className='w-full flex items-center justify-between gap-2 cursor-pointer'
                onClick={() => setExpanded((v) => !v)}
            >
                <div className='flex items-center gap-2'>
                    <Bot className='h-4 w-4 text-muted-foreground' />
                    <span className='text-sm font-semibold'>Automation Controls</span>
                </div>
                {expanded ? (
                    <ChevronUp className='h-4 w-4 text-muted-foreground' />
                ) : (
                    <ChevronDown className='h-4 w-4 text-muted-foreground' />
                )}
            </button>

            {expanded && (
                <div className='space-y-3'>
                    <p className='text-xs text-muted-foreground'>
                        Enable AI assistance for specific management tasks. Disabled tasks must be handled manually each
                        tick.
                    </p>

                    {/* Worker allocation toggle */}
                    <div className='flex items-center justify-between gap-3'>
                        <div className='space-y-0.5'>
                            <Label htmlFor='worker-auto-toggle' className='text-xs font-medium cursor-pointer'>
                                Automatic worker allocation
                            </Label>
                            <p className='text-[11px] text-muted-foreground'>
                                {workerAuto
                                    ? 'The AI computes optimal headcount targets each tick based on facility requirements.'
                                    : 'You control worker allocation targets. The AI will not touch them.'}
                            </p>
                        </div>
                        <Switch
                            id='worker-auto-toggle'
                            checked={workerAuto}
                            disabled={setAutomationMutation.isPending}
                            onCheckedChange={(v) => handleToggle('worker', v)}
                        />
                    </div>

                    {/* Pricing toggle */}
                    <div className='flex items-center justify-between gap-3'>
                        <div className='space-y-0.5'>
                            <Label htmlFor='pricing-auto-toggle' className='text-xs font-medium cursor-pointer'>
                                Automatic sell-price adjustment
                            </Label>
                            <p className='text-[11px] text-muted-foreground'>
                                {pricingAuto
                                    ? 'The AI adjusts sell prices each tick using tâtonnement (sell-through targeting).'
                                    : 'You set your own sell prices. The AI will not adjust them.'}
                            </p>
                        </div>
                        <Switch
                            id='pricing-auto-toggle'
                            checked={pricingAuto}
                            disabled={setAutomationMutation.isPending}
                            onCheckedChange={(v) => handleToggle('pricing', v)}
                        />
                    </div>

                    {/* Feedback */}
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
                </div>
            )}
        </div>
    );
}
