'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Page } from './Page';
import { PlanetIcon } from './PlanetIcon';

export function FoundingPage() {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const router = useRouter();
    const [agentName, setAgentName] = useState('');
    const [planetId, setPlanetId] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitted, setSubmitted] = useState(false);

    const planetsQuery = useQuery(trpc.simulation.getLatestPlanetSummaries.queryOptions());

    useEffect(() => {
        if (!planetId && planetsQuery.data?.planets.length) {
            setPlanetId(planetsQuery.data.planets[0].planetId);
        }
    }, [planetId, planetsQuery.data]);

    const createAgentMutation = useMutation(
        trpc.createAgent.mutationOptions({
            onSuccess: (data) => {
                setSubmitted(true);
                void queryClient.invalidateQueries({ queryKey: trpc.getUser.queryKey() });
                router.push(
                    `/planets/${encodeURIComponent(planetId)}/agent/${encodeURIComponent(data.agentId)}/financial` as unknown as '/',
                );
            },
            onError: (err: unknown) => {
                setError(err instanceof Error ? err.message : 'Failed to found company');
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

    if (submitted) {
        return (
            <Page title='Found your Company'>
                <div className='flex items-center gap-3 text-muted-foreground'>
                    <Spinner className='h-5 w-5' />
                    <span>Redirecting…</span>
                </div>
            </Page>
        );
    }

    return (
        <Page title='Found your Company'>
            <form onSubmit={handleSubmit} className='grid gap-4 max-w-md'>
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
                    <Select value={planetId} onValueChange={setPlanetId} disabled={createAgentMutation.isPending}>
                        <SelectTrigger id='planet-select'>
                            <SelectValue
                                placeholder={planetsQuery.isLoading ? 'Loading planets…' : 'Select a planet'}
                            />
                        </SelectTrigger>
                        <SelectContent>
                            {planetsQuery.data?.planets.map((p) => (
                                <SelectItem key={p.planetId} value={p.planetId}>
                                    <span className='flex items-center gap-2'>
                                        <PlanetIcon planetId={p.planetId} size={20} />
                                        {p.name}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {error && <p className='text-sm text-destructive'>{error}</p>}

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
            </form>
        </Page>
    );
}
