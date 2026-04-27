'use client';

import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { COMMERCIAL_LICENSE_COST, WORKFORCE_LICENSE_COST } from '@/simulation/constants';

type LicenseCardProps = {
    type: 'commercial' | 'workforce';
    held: boolean;
    frozen: boolean;
    agentId: string;
    planetId: string;
    isOwnAgent: boolean;
    description: string;
    icon: React.ElementType;
};

function LicenseCard({ type, held, frozen, agentId, planetId, isOwnAgent, description, icon: Icon }: LicenseCardProps) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const acquireMutation = useMutation(
        trpc.acquireLicense.mutationOptions({
            onSuccess: () => {
                // Invalidate agent detail queries to refresh license state
                void queryClient.invalidateQueries(
                    trpc.simulation.getAgentPlanetDetail.queryOptions({ agentId, planetId }),
                );
                void queryClient.invalidateQueries(trpc.simulation.getAgentOverview.queryOptions({ agentId }));
            },
        }),
    );

    const statusBadge = held ? (
        frozen ? (
            <Badge variant='destructive' className='text-xs'>
                Frozen
            </Badge>
        ) : (
            <Badge variant='outline' className='text-xs border-green-500 text-green-600'>
                Active
            </Badge>
        )
    ) : (
        <Badge variant='outline' className='text-xs border-dashed text-muted-foreground'>
            Not acquired
        </Badge>
    );

    return (
        <Card className={held && !frozen ? 'border-green-500/30' : held && frozen ? 'border-destructive/30' : ''}>
            <CardHeader className='pb-2 pt-4 px-4'>
                <div className='flex items-center justify-between'>
                    <CardTitle className='text-sm flex items-center gap-2'>
                        <Icon className='h-4 w-4 text-muted-foreground' />
                        {type === 'commercial' ? 'Commercial License' : 'Workforce License'}
                    </CardTitle>
                    {statusBadge}
                </div>
                <CardDescription className='text-xs'>{description}</CardDescription>
            </CardHeader>
            <CardContent className='px-4 pb-4'>
                {!held && isOwnAgent && (
                    <div className='flex items-center justify-between gap-2 mt-1'>
                        <span className='text-xs text-muted-foreground'>
                            Cost:{' '}
                            {formatNumberWithUnit(
                                type === 'commercial' ? COMMERCIAL_LICENSE_COST : WORKFORCE_LICENSE_COST,
                                'currency',
                                planetId,
                            )}{' '}
                            {type === 'commercial' && '(initial loan)'}
                        </span>
                        <Button
                            size='sm'
                            variant='outline'
                            className='h-6 text-xs'
                            disabled={acquireMutation.isPending}
                            onClick={() => acquireMutation.mutate({ agentId, planetId, licenseType: type })}
                        >
                            {acquireMutation.isPending ? 'Acquiring…' : 'Acquire'}
                        </Button>
                    </div>
                )}
                {acquireMutation.isError && (
                    <p className='text-xs text-destructive mt-1'>{acquireMutation.error.message}</p>
                )}
            </CardContent>
        </Card>
    );
}

type Props = {
    agentId: string;
    planetId: string;
    isOwnAgent: boolean;
    licenses?: {
        commercial?: { acquiredTick: number; frozen: boolean };
        workforce?: { acquiredTick: number; frozen: boolean };
    };
};

export function LicensePanel({ agentId, planetId, isOwnAgent, licenses }: Props) {
    const commercialLicense = licenses?.commercial;
    const workforceLicense = licenses?.workforce;

    return (
        <div className='space-y-2'>
            <h3 className='text-xs font-semibold text-muted-foreground uppercase tracking-wide'>Planetary Licenses</h3>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <LicenseCard
                    type='commercial'
                    held={!!commercialLicense}
                    frozen={commercialLicense?.frozen ?? false}
                    agentId={agentId}
                    planetId={planetId}
                    isOwnAgent={isOwnAgent}
                    description='Required for bank account, storage access and market participation.'
                    icon={Briefcase}
                />
                <span className={`${commercialLicense === undefined ? 'opacity-50 pointer-events-none' : ''}`}>
                    <LicenseCard
                        type='workforce'
                        held={!!workforceLicense}
                        frozen={workforceLicense?.frozen ?? false}
                        agentId={agentId}
                        planetId={planetId}
                        isOwnAgent={isOwnAgent}
                        description='Required to hire employees and run production facilities.'
                        icon={Users}
                    />
                </span>
            </div>
        </div>
    );
}
