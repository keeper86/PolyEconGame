import { describe, it, expect, beforeEach } from 'vitest';
import type { GameState } from './planet/planet';
import { createInitialGameState } from './utils/initialWorld';

// Mock the worker module to test the action queue logic
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

    // Helper functions that mimic the worker logic
    let drainActionQueue = () => {
        drainCallCount++;
        if (pendingActions.length === 0) {
            return;
        }
        // Simulate processing actions
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
        // Full drain at tick boundary
        drainActionQueue();
        // Simulate advanceTick
        mockState.tick += 1;
        // Simulate snapshot creation
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

            // Mock drain to track order
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

            // Restore
            drainActionQueue = originalDrain;
        });
    });

    describe('Tick boundary barrier', () => {
        it('should fully drain at tick boundary regardless of processingTick flag', () => {
            processingTick = true;
            enqueueAction({ type: 'test' }, false); // Don't trigger eager drain
            expect(pendingActions.length).toBe(1);

            simulateTickBoundary();
            expect(pendingActions.length).toBe(0);
            expect(drainCallCount).toBe(1);
        });

        it('should ensure all actions present at tick start are applied in same tick', () => {
            // Add actions before tick
            enqueueAction({ type: 'action1' });
            enqueueAction({ type: 'action2' });

            // Reset drain count to track tick boundary drain
            drainCallCount = 0;

            // Simulate tick boundary
            simulateTickBoundary();

            expect(drainCallCount).toBe(1);
            expect(pendingActions.length).toBe(0);
        });

        it('should prevent eager draining during tick processing', () => {
            // Start tick processing
            processingTick = true;

            // Action arrives during tick processing
            enqueueAction({ type: 'actionDuringTick' });

            expect(pendingActions.length).toBe(1); // Should be queued, not drained
            expect(drainCallCount).toBe(0); // No eager drain during tick

            // Complete tick processing
            processingTick = false;

            // Now eager draining should work again
            enqueueAction({ type: 'actionAfterTick' });
            expect(pendingActions.length).toBe(0); // Should be drained
            expect(drainCallCount).toBe(1); // One drain call for the second action
        });
    });

    describe('Mutual exclusion', () => {
        it('should protect advanceTick and snapshot creation from eager draining', () => {
            // Simulate tick processing
            processingTick = true;

            // These simulate what happens during scheduleTick
            const actionsDuringProcessing = [{ type: 'action1' }, { type: 'action2' }];

            // Actions should queue but not drain
            actionsDuringProcessing.forEach((action) => enqueueAction(action));
            expect(pendingActions.length).toBe(2);
            expect(drainCallCount).toBe(0);

            // Simulate the mandatory full drain at tick boundary
            // (This happens at the START of scheduleTick, before advanceTick)
            drainActionQueue();
            expect(pendingActions.length).toBe(0);
            expect(drainCallCount).toBe(1);

            // Now simulate advanceTick and snapshot creation
            // (processingTick remains true during this period)

            // Action arrives during advanceTick
            enqueueAction({ type: 'actionDuringAdvance' });
            expect(pendingActions.length).toBe(1); // Queued, not drained
            expect(drainCallCount).toBe(1); // No additional drain

            // Complete tick processing
            processingTick = false;

            // Now eager draining resumes
            enqueueAction({ type: 'actionAfterTick' });
            expect(pendingActions.length).toBe(0); // Drained
            expect(drainCallCount).toBe(2); // One more drain call
        });
    });

    describe('Deterministic tick grouping', () => {
        it('should group all actions present at tick start in same tick', () => {
            const tickActions: string[] = [];

            // Track which tick actions are processed in
            const originalDrain = drainActionQueue;
            let currentTick = mockState.tick;
            drainActionQueue = () => {
                drainCallCount++;
                const actions = pendingActions.splice(0);
                actions.forEach((action) => {
                    tickActions.push(`Tick ${currentTick}: ${action.type}`);
                });
            };

            // Actions before tick 1
            enqueueAction({ type: 'action1' });
            enqueueAction({ type: 'action2' });

            // Tick 1 boundary
            simulateTickBoundary();
            currentTick = mockState.tick;

            // Actions before tick 2
            enqueueAction({ type: 'action3' });

            // Tick 2 boundary
            simulateTickBoundary();
            currentTick = mockState.tick;

            // Actions before tick 3
            enqueueAction({ type: 'action4' });
            enqueueAction({ type: 'action5' });

            // Tick 3 boundary
            simulateTickBoundary();

            expect(tickActions).toEqual([
                'Tick 0: action1',
                'Tick 0: action2',
                'Tick 1: action3',
                'Tick 2: action4',
                'Tick 2: action5',
            ]);

            // Restore
            drainActionQueue = originalDrain;
        });
    });
});
