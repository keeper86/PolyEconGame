'use client';

import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import type { EducationLevelType } from '@/simulation/population/education';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AllocationTargets = Record<EducationLevelType, number>;

type Props = {
    agentId: string;
    planetId: string;
    /** Current allocated workers from the live snapshot. */
    allocatedWorkers: Partial<AllocationTargets>;
    /** Whether automatic worker allocation is enabled. When true this panel is advisory only. */
    automateWorkerAllocation: boolean;
};

const EDU_LEVELS: { key: EducationLevelType; label: string; description: string }[] = [
    { key: 'none', label: 'Uneducated', description: 'Workers with no formal education' },
    { key: 'primary', label: 'Primary', description: 'Workers with primary school education' },
    { key: 'secondary', label: 'Secondary', description: 'Workers with secondary / high-school education' },
    { key: 'tertiary', label: 'Tertiary', description: 'Workers with a university degree' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function WorkerAllocationPanel({
    agentId,
    planetId,
    allocatedWorkers,
    automateWorkerAllocation,
}: Props): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const [expanded, setExpanded] = useState(false);
    const [targets, setTargets] = useState<AllocationTargets>({
        none: allocatedWorkers.none ?? 0,
        primary: allocatedWorkers.primary ?? 0,
        secondary: allocatedWorkers.secondary ?? 0,
        tertiary: allocatedWorkers.tertiary ?? 0,
    });
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Keep local state in sync when the parent re-renders with a fresh snapshot
    useEffect(() => {
        setTargets({
            none: allocatedWorkers.none ?? 0,
            primary: allocatedWorkers.primary ?? 0,
            secondary: allocatedWorkers.secondary ?? 0,
            tertiary: allocatedWorkers.tertiary ?? 0,
        });
    }, [allocatedWorkers.none, allocatedWorkers.primary, allocatedWorkers.secondary, allocatedWorkers.tertiary]);

    const mutation = useMutation(
        trpc.setWorkerAllocationTargets.mutationOptions({
            onSuccess: () => {
                setSuccessMsg('Workforce targets saved. Changes take effect on the next hire tick.');
                setErrorMsg(null);
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getAgentPlanetDetail.queryKey(),
                });
            },
            onError: (err) => {
                setErrorMsg(err instanceof Error ? err.message : 'Failed to update workforce targets');
                setSuccessMsg(null);
            },
        }),
    );

    const handleChange = (edu: EducationLevelType, raw: string) => {
        const parsed = parseInt(raw, 10);
        setTargets((prev) => ({ ...prev, [edu]: isNaN(parsed) || parsed < 0 ? 0 : parsed }));
    };

    const handleSave = () => {
        setSuccessMsg(null);
        setErrorMsg(null);
        mutation.mutate({ agentId, planetId, targets });
    };

    const totalTarget = Object.values(targets).reduce((s, v) => s + v, 0);

    return (
        <div className='border rounded-md p-3 space-y-3'>
            {/* Header */}
            <button
                type='button'
                className='w-full flex items-center justify-between gap-2 cursor-pointer'
                onClick={() => setExpanded((v) => !v)}
            >
                <div className='flex items-center gap-2'>
                    <Users className='h-4 w-4 text-muted-foreground' />
                    <span className='text-sm font-semibold'>Workforce Allocation Targets</span>
                    {automateWorkerAllocation && (
                        <span className='text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded px-1.5 py-0.5 font-medium'>
                            AI managed
                        </span>
                    )}
                </div>
                {expanded ? (
                    <ChevronUp className='h-4 w-4 text-muted-foreground' />
                ) : (
                    <ChevronDown className='h-4 w-4 text-muted-foreground' />
                )}
            </button>

            {expanded && (
                <div className='space-y-4'>
                    {automateWorkerAllocation ? (
                        <p className='text-xs text-muted-foreground'>
                            Automatic worker allocation is enabled. The AI sets these targets each tick. Disable
                            automation in the Automation Controls panel above to take manual control.
                        </p>
                    ) : (
                        <p className='text-xs text-muted-foreground'>
                            Set the desired headcount per education level. The simulation will hire or fire workers each
                            month to reach these targets. Enable automation in the Automation Controls panel above to
                            let the AI manage this.
                        </p>
                    )}

                    {/* Input grid */}
                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                        {EDU_LEVELS.map(({ key, label, description }) => (
                            <div key={key} className='space-y-1'>
                                <Label htmlFor={`worker-target-${key}`} className='text-xs font-medium'>
                                    {label}
                                </Label>
                                <p className='text-[11px] text-muted-foreground'>{description}</p>
                                <Input
                                    id={`worker-target-${key}`}
                                    type='number'
                                    min={0}
                                    step={1}
                                    value={targets[key]}
                                    disabled={automateWorkerAllocation || mutation.isPending}
                                    onChange={(e) => handleChange(key, e.target.value)}
                                    className='h-8 text-sm tabular-nums'
                                />
                            </div>
                        ))}
                    </div>

                    <div className='flex items-center justify-between gap-2'>
                        <span className='text-xs text-muted-foreground tabular-nums'>
                            Total target:{' '}
                            <span className='font-medium text-foreground'>
                                {formatNumberWithUnit(totalTarget, 'persons')}
                            </span>
                        </span>
                        <Button
                            size='sm'
                            onClick={handleSave}
                            disabled={automateWorkerAllocation || mutation.isPending}
                        >
                            {mutation.isPending ? 'Saving…' : 'Apply targets'}
                        </Button>
                    </div>

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
