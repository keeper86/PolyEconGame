import type { PendingAction } from '@/hooks/useActionOverlay';

export type PendingShipyardBuild = {
    facilityId?: string;
    name: string | null;
};

export function selectPendingShipyardBuilds(actions: PendingAction[]): PendingShipyardBuild[] {
    return actions
        .filter((a) => a.type === 'shipBuild')
        .map((a) => ({ facilityId: a.facilityId, name: a.facilityName ?? null }));
}
