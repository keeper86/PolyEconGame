'use client';

import { useTour } from '@/components/tour/TourContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Bot, CheckCircle2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';

type Props = {
    agentId: string;

    automateWorkerAllocation: boolean;
};

export default function AutomationPanel({
    agentId,
    automateWorkerAllocation: initialWorker,
}: Props): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const { isTourActive, markActionCompleted } = useTour();

    const [workerAuto, setWorkerAuto] = useState(initialWorker);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        setWorkerAuto(initialWorker);
    }, [initialWorker]);

    const setAutomationMutation = useMutation(
        trpc.setAutomation.mutationOptions({
            onSuccess: () => {
                setSuccessMsg('Automation settings saved. Changes take effect on the next tick.');
                setErrorMsg(null);

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

    const handleToggle = (value: boolean) => {
        setWorkerAuto(value);
        setSuccessMsg(null);
        setErrorMsg(null);

        // Mark automation as completed when the user toggles it on during the tour
        if (value && isTourActive) {
            markActionCompleted('enable-automation');
        }

        setAutomationMutation.mutate({
            agentId,
            automateWorkerAllocation: value,
        });
    };

    return (
        <Card data-tour='workforce-automation'>
            <CardHeader className='p-3 pb-2'>
                <div className='flex justify-between items-center gap-3'>
                    <span className='flex items-center gap-2'>
                        <Bot className='h-4 w-4 text-muted-foreground' />
                        <Label htmlFor='worker-auto-toggle' className='text-xs font-medium cursor-pointer'>
                            Automatic worker allocation
                        </Label>
                    </span>
                    <Switch
                        id='worker-auto-toggle'
                        checked={workerAuto}
                        disabled={setAutomationMutation.isPending}
                        onCheckedChange={(v) => handleToggle(v)}
                    />
                </div>
            </CardHeader>
            <CardContent className='p-3'>
                <p className='text-[11px] text-muted-foreground'>
                    {workerAuto
                        ? 'The AI computes optimal headcount targets each tick based on facility requirements.'
                        : 'You control worker allocation targets. The AI will not touch them.'}
                </p>

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
            </CardContent>
        </Card>
    );
}
