import { describe, expect, it } from 'vitest';
import type { PendingAction } from '@/hooks/useActionOverlay';
import { selectPendingShipyardBuilds } from './shipyardHelpers';

function action(patch: Partial<PendingAction>): PendingAction {
    return { agentId: 'a1', planetId: 'p1', triggerTick: 1, type: 'shipBuild', ...patch };
}

describe('selectPendingShipyardBuilds', () => {
    it('keeps each pending shipyard build apart', () => {
        const builds = selectPendingShipyardBuilds([
            action({ facilityId: 'f1', facilityName: 'Alpha' }),
            action({ facilityId: 'f2', facilityName: 'Beta' }),
        ]);
        expect(builds).toEqual([
            { facilityId: 'f1', name: 'Alpha' },
            { facilityId: 'f2', name: 'Beta' },
        ]);
    });

    it('ignores other pending action types', () => {
        const builds = selectPendingShipyardBuilds([
            action({ facilityId: 'f1', facilityName: 'Alpha' }),
            action({ type: 'shipExpand', facilityId: 'f1' }),
            action({ type: 'shipSetTarget', facilityId: 'f1' }),
        ]);
        expect(builds).toHaveLength(1);
    });

    it('leaves the name empty when none was submitted', () => {
        expect(selectPendingShipyardBuilds([action({ facilityId: 'f1' })])[0].name).toBe(null);
    });
});
