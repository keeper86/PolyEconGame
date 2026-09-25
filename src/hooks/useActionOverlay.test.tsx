import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    PendingActionProvider,
    useAddPendingAction,
    usePendingActions,
    useRemovePendingByShip,
} from './useActionOverlay';

vi.mock('./useSimulationQuery', () => ({ useSimulationTick: () => 0 }));

function wrapper({ children }: { children: React.ReactNode }) {
    return <PendingActionProvider>{children}</PendingActionProvider>;
}

function renderPending() {
    return renderHook(
        () => ({
            add: useAddPendingAction(),
            pending: usePendingActions('a1', 'p1'),
            removeByShip: useRemovePendingByShip(),
        }),
        { wrapper },
    );
}

describe('useActionOverlay ship actions', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('keeps ship actions for different ships apart', () => {
        const { result } = renderPending();
        act(() => {
            result.current.add({ agentId: 'a1', planetId: 'p1', triggerTick: 1, type: 'shipList', shipId: 'ship-1' });
            result.current.add({ agentId: 'a1', planetId: 'p1', triggerTick: 1, type: 'shipList', shipId: 'ship-2' });
        });
        expect(result.current.pending).toHaveLength(2);
    });

    it('replaces a duplicate ship action for the same ship and type', () => {
        const { result } = renderPending();
        act(() => {
            result.current.add({ agentId: 'a1', planetId: 'p1', triggerTick: 1, type: 'shipList', shipId: 'ship-1' });
            result.current.add({ agentId: 'a1', planetId: 'p1', triggerTick: 2, type: 'shipList', shipId: 'ship-1' });
        });
        expect(result.current.pending).toHaveLength(1);
        expect(result.current.pending[0].triggerTick).toBe(2);
    });

    it('removePendingByShip removes only that ship', () => {
        const { result } = renderPending();
        act(() => {
            result.current.add({ agentId: 'a1', planetId: 'p1', triggerTick: 1, type: 'shipList', shipId: 'ship-1' });
            result.current.add({
                agentId: 'a1',
                planetId: 'p1',
                triggerTick: 1,
                type: 'shipDispatch',
                shipId: 'ship-2',
            });
        });
        act(() => result.current.removeByShip('a1', 'p1', 'ship-1'));
        expect(result.current.pending).toHaveLength(1);
        expect(result.current.pending[0].shipId).toBe('ship-2');
    });

    it('persists ship actions across provider remounts', () => {
        const first = renderPending();
        act(() => {
            first.result.current.add({ agentId: 'a1', planetId: 'p1', triggerTick: 1, type: 'shipAcceptBuyOffer' });
        });
        const second = renderPending();
        expect(second.result.current.pending).toHaveLength(1);
    });
});
