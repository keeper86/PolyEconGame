'use client';

import { useAddPendingAction } from '@/hooks/useActionOverlay';
import { useTRPC } from '@/lib/trpc';
import { useQueryClient } from '@tanstack/react-query';

export function useShipDispatch(agentId: string, planetId: string, shipId: string): (processedAtTick: number) => void {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const addPending = useAddPendingAction();

    return (processedAtTick: number) => {
        addPending({ type: 'shipDispatch', agentId, planetId, shipId, triggerTick: processedAtTick });
        void queryClient.invalidateQueries({ queryKey: trpc.simulation.listAgentShips.queryKey({ agentId }) });
    };
}
