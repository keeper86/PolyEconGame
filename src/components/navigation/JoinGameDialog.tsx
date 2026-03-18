'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useTRPC } from '@/lib/trpc';
import { Gamepad2 } from 'lucide-react';

export function JoinGameDialog() {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [agentName, setAgentName] = useState('');
    const [planetId, setPlanetId] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Fetch available planets to populate the selector
    const planetsQuery = useQuery(
        trpc.simulation.getLatestPlanetSummaries.queryOptions(undefined, {
            enabled: open,
        }),
    );

    // Auto-select the first planet once data is available
    useEffect(() => {
        if (!planetId && planetsQuery.data?.planets.length) {
            setPlanetId(planetsQuery.data.planets[0].planetId);
        }
    }, [planetId, planetsQuery.data]);

    const createAgentMutation = useMutation(
        trpc.createAgent.mutationOptions({
            onSuccess: () => {
                // Invalidate the current user query so nav re-reads updated agentId
                void queryClient.invalidateQueries({ queryKey: trpc.getUser.queryKey() });
                setOpen(false);
            },
            onError: (err: unknown) => {
                setError(err instanceof Error ? err.message : 'Failed to create agent');
            },
        }),
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!agentName.trim()) {
            setError('Company name is required');
            return;
        }
        if (!planetId) {
            setError('Please select a planet');
            return;
        }
        createAgentMutation.mutate({ agentName: agentName.trim(), planetId });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant='outline' size='sm' className='gap-2'>
                    <Gamepad2 width={14} height={14} />
                    Join the Game
                </Button>
            </DialogTrigger>
            <DialogContent className='sm:max-w-[420px]'>
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Join the Game</DialogTitle>
                        <DialogDescription>
                            Found your own company and start participating in the planetary economy.
                        </DialogDescription>
                    </DialogHeader>

                    <div className='grid gap-4 py-4'>
                        <div className='grid gap-2'>
                            <Label htmlFor='company-name'>Company Name</Label>
                            <Input
                                id='company-name'
                                placeholder='e.g. Stellar Enterprises'
                                value={agentName}
                                onChange={(e) => setAgentName(e.target.value)}
                                maxLength={64}
                                required
                                disabled={createAgentMutation.isPending}
                            />
                        </div>

                        <div className='grid gap-2'>
                            <Label htmlFor='planet-select'>Home Planet</Label>
                            <Select
                                value={planetId}
                                onValueChange={setPlanetId}
                                disabled={createAgentMutation.isPending}
                            >
                                <SelectTrigger id='planet-select'>
                                    <SelectValue
                                        placeholder={planetsQuery.isLoading ? 'Loading planets…' : 'Select a planet'}
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    {planetsQuery.data?.planets.map((p) => (
                                        <SelectItem key={p.planetId} value={p.planetId}>
                                            {p.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {error && <p className='text-sm text-destructive'>{error}</p>}
                    </div>

                    <DialogFooter>
                        <Button
                            type='button'
                            variant='ghost'
                            onClick={() => setOpen(false)}
                            disabled={createAgentMutation.isPending}
                        >
                            Cancel
                        </Button>
                        <Button type='submit' disabled={createAgentMutation.isPending}>
                            {createAgentMutation.isPending ? (
                                <>
                                    <Spinner className='mr-2 h-4 w-4' />
                                    Founding…
                                </>
                            ) : (
                                'Found Company'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
