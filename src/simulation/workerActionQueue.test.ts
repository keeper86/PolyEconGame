import { describe, it, expect, beforeEach } from 'vitest';
import type { GameState } from './planet/planet';
import { createInitialGameState } from './initialUniverse';

describe('Worker action queue hybrid model', () => {
    let mockState: GameState;
    let pendingActions: Array<{ type: string }> = [];
    let processingTick = false;
    let drainCallCount = 0;

    beforeEach(() => {
        mockState = createInitialGameState();
        pendingActions = [];
        processingTick = false;
        drainCallCount = 0;
    });

    let drainActionQueue = () => {
        drainCallCount++;
        if (pendingActions.length === 0) {
            return;
        }

        pendingActions.splice(0);
    };

    function enqueueAction(action: { type: string }, triggerEagerDrain = true) {
        pendingActions.push(action);
        if (triggerEagerDrain && !processingTick) {
            drainActionQueue();
        }
    }

    function simulateTickBoundary() {
        processingTick = true;

        drainActionQueue();

        mockState.tick += 1;

        processingTick = false;
    }

    describe('Eager draining', () => {
        it('should drain immediately when not processing tick', () => {
            enqueueAction({ type: 'test' });
            expect(pendingActions.length).toBe(0);
            expect(drainCallCount).toBe(1);
        });

        it('should not drain immediately when processing tick', () => {
            processingTick = true;
            enqueueAction({ type: 'test' });
            expect(pendingActions.length).toBe(1);
            expect(drainCallCount).toBe(0);
        });

        it('should preserve FIFO ordering with eager draining', () => {
            const actions = [{ type: 'action1' }, { type: 'action2' }, { type: 'action3' }];

            const processed: string[] = [];
            const originalDrain = drainActionQueue;
            drainActionQueue = () => {
                drainCallCount++;
                const actionsToProcess = pendingActions.splice(0);
                actionsToProcess.forEach((action) => processed.push(action.type));
            };

            actions.forEach((action) => enqueueAction(action));

            expect(processed).toEqual(['action1', 'action2', 'action3']);
            expect(pendingActions.length).toBe(0);

            drainActionQueue = originalDrain;
        });
    });

    describe('Tick boundary barrier', () => {
        it('should fully drain at tick boundary regardless of processingTick flag', () => {
            processingTick = true;
            enqueueAction({ type: 'test' }, false);
            expect(pendingActions.length).toBe(1);

            simulateTickBoundary();
            expect(pendingActions.length).toBe(0);
            expect(drainCallCount).toBe(1);
        });

        it('should ensure all actions present at tick start are applied in same tick', () => {
            enqueueAction({ type: 'action1' });
            enqueueAction({ type: 'action2' });

            drainCallCount = 0;

            simulateTickBoundary();

            expect(drainCallCount).toBe(1);
            expect(pendingActions.length).toBe(0);
        });

        it('should prevent eager draining during tick processing', () => {
            processingTick = true;

            enqueueAction({ type: 'actionDuringTick' });

            expect(pendingActions.length).toBe(1);
            expect(drainCallCount).toBe(0);

            processingTick = false;

            enqueueAction({ type: 'actionAfterTick' });
            expect(pendingActions.length).toBe(0);
            expect(drainCallCount).toBe(1);
        });
    });

    describe('Mutual exclusion', () => {
        it('should protect advanceTick and snapshot creation from eager draining', () => {
            processingTick = true;

            const actionsDuringProcessing = [{ type: 'action1' }, { type: 'action2' }];

            actionsDuringProcessing.forEach((action) => enqueueAction(action));
            expect(pendingActions.length).toBe(2);
            expect(drainCallCount).toBe(0);

            drainActionQueue();
            expect(pendingActions.length).toBe(0);
            expect(drainCallCount).toBe(1);

            enqueueAction({ type: 'actionDuringAdvance' });
            expect(pendingActions.length).toBe(1);
            expect(drainCallCount).toBe(1);

            processingTick = false;

            enqueueAction({ type: 'actionAfterTick' });
            expect(pendingActions.length).toBe(0);
            expect(drainCallCount).toBe(2);
        });
    });

    describe('Deterministic tick grouping', () => {
        it('should group all actions present at tick start in same tick', () => {
            const tickActions: string[] = [];

            const originalDrain = drainActionQueue;
            let currentTick = mockState.tick;
            drainActionQueue = () => {
                drainCallCount++;
                const actions = pendingActions.splice(0);
                actions.forEach((action) => {
                    tickActions.push(`Tick ${currentTick}: ${action.type}`);
                });
            };

            enqueueAction({ type: 'action1' });
            enqueueAction({ type: 'action2' });

            simulateTickBoundary();
            currentTick = mockState.tick;

            enqueueAction({ type: 'action3' });

            simulateTickBoundary();
            currentTick = mockState.tick;

            enqueueAction({ type: 'action4' });
            enqueueAction({ type: 'action5' });

            simulateTickBoundary();

            expect(tickActions).toEqual([
                'Tick 0: action1',
                'Tick 0: action2',
                'Tick 1: action3',
                'Tick 2: action4',
                'Tick 2: action5',
            ]);

            drainActionQueue = originalDrain;
        });
    });
});
