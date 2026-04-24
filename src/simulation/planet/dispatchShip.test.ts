import { describe, it, expect, beforeEach } from 'vitest';
import { handleDispatchShip } from '../workerClient/shipContractActions';
import type { PendingAction, OutboundMessage } from '../workerClient/messages';
import type { GameState } from './planet';
import { makeAgent, makeAgentPlanetAssets, makeStorageFacility } from '../utils/testHelper';
import { steelResourceType } from './resources';
import { shiptypes } from '../ships/ships';
import type { TransportShip } from '../ships/ships';
import { putIntoStorageFacility } from './facility';

function makeGameState(agents: ReturnType<typeof makeAgent>[], planetIds: string[]): GameState {
    const planets = new Map(
        planetIds.map((id) => [id, { id } as GameState['planets'] extends Map<string, infer V> ? V : never]),
    );
    const agentsMap = new Map(agents.map((a) => [a.id, a]));
    return { tick: 0, planets, agents: agentsMap } as unknown as GameState;
}

function makeTransportShip(name: string, planetId: string): TransportShip {
    return {
        name,
        builtAtTick: 0,
        maintainanceStatus: 1,
        maxMaintenance: 1,
        cumulativeRepairAcc: 0,
        type: shiptypes.solid.bulkCarrier1,
        state: { type: 'idle', planetId },
    };
}

describe('handleDispatchShip', () => {
    let messages: OutboundMessage[];
    function postMessage(msg: OutboundMessage) {
        messages.push(msg);
    }

    beforeEach(() => {
        messages = [];
    });

    function dispatch(
        state: GameState,
        partial: Partial<Extract<PendingAction, { type: 'dispatchShip' }>> &
            Pick<
                Extract<PendingAction, { type: 'dispatchShip' }>,
                'agentId' | 'fromPlanetId' | 'toPlanetId' | 'shipName'
            >,
    ) {
        handleDispatchShip(
            state,
            {
                type: 'dispatchShip',
                requestId: 'req-1',
                cargoGoal: null,
                ...partial,
            },
            postMessage,
        );
    }

    it('fails when agent not found', () => {
        const state = makeGameState([], ['p1', 'p2']);
        dispatch(state, { agentId: 'missing', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'S1' });
        expect(messages[0]).toMatchObject({ type: 'shipDispatchFailed', reason: 'Agent not found' });
    });

    it('fails when destination planet not found', () => {
        const agent = makeAgent('a1', 'p1');
        const state = makeGameState([agent], ['p1']);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'S1' });
        expect(messages[0]).toMatchObject({ type: 'shipDispatchFailed' });
    });

    it('fails when ship not found', () => {
        const agent = makeAgent('a1', 'p1');
        const state = makeGameState([agent], ['p1', 'p2']);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'Ghost' });
        expect(messages[0]).toMatchObject({ type: 'shipDispatchFailed', reason: expect.stringContaining('Ghost') });
    });

    it('fails when ship is not idle', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');
        ship.state = { type: 'transporting', from: 'p1', to: 'p2', cargo: null, arrivalTick: 100 };
        agent.ships.push(ship);
        const state = makeGameState([agent], ['p1', 'p2']);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'S1' });
        expect(messages[0]).toMatchObject({ type: 'shipDispatchFailed', reason: 'Ship is not idle' });
    });

    it('fails when ship is not on departure planet', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p2');
        agent.ships.push(ship);
        const state = makeGameState([agent], ['p1', 'p2']);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'S1' });
        expect(messages[0]).toMatchObject({ type: 'shipDispatchFailed' });
    });

    it('dispatches ferry mode (no cargo) directly to transporting', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');
        agent.ships.push(ship);
        const state = makeGameState([agent], ['p1', 'p2']);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'S1', cargoGoal: null });
        expect(messages[0]).toMatchObject({ type: 'shipDispatched', agentId: 'a1', shipName: 'S1' });
        expect(ship.state.type).toBe('transporting');
        if (ship.state.type === 'transporting') {
            expect(ship.state.to).toBe('p2');
            expect(ship.state.cargo).toBeNull();
        }
    });

    it('fails when cargo goal specified but no storage facility', () => {
        const assets = makeAgentPlanetAssets('p1', { storageFacility: undefined as never });
        const agent = makeAgent('a1', 'p1', 'Agent', { assets: { p1: assets } });
        const ship = makeTransportShip('S1', 'p1');
        agent.ships.push(ship);
        const state = makeGameState([agent], ['p1', 'p2']);
        dispatch(state, {
            agentId: 'a1',
            fromPlanetId: 'p1',
            toPlanetId: 'p2',
            shipName: 'S1',
            cargoGoal: { resourceName: 'Steel', quantity: 100 },
        });
        expect(messages[0]).toMatchObject({ type: 'shipDispatchFailed' });
    });

    it('fails when resource not in storage', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');
        agent.ships.push(ship);
        const state = makeGameState([agent], ['p1', 'p2']);
        dispatch(state, {
            agentId: 'a1',
            fromPlanetId: 'p1',
            toPlanetId: 'p2',
            shipName: 'S1',
            cargoGoal: { resourceName: 'Steel', quantity: 100 },
        });
        expect(messages[0]).toMatchObject({ type: 'shipDispatchFailed', reason: expect.stringContaining('Steel') });
    });

    it('fails when insufficient cargo in storage', () => {
        const storage = makeStorageFacility({ planetId: 'p1' });
        putIntoStorageFacility(storage, steelResourceType, 50);
        const assets = makeAgentPlanetAssets('p1', { storageFacility: storage });
        const agent = makeAgent('a1', 'p1', 'Agent', { assets: { p1: assets } });
        const ship = makeTransportShip('S1', 'p1');
        agent.ships.push(ship);
        const state = makeGameState([agent], ['p1', 'p2']);
        dispatch(state, {
            agentId: 'a1',
            fromPlanetId: 'p1',
            toPlanetId: 'p2',
            shipName: 'S1',
            cargoGoal: { resourceName: 'Steel', quantity: 200 },
        });
        expect(messages[0]).toMatchObject({
            type: 'shipDispatchFailed',
            reason: 'Insufficient cargo quantity in storage',
        });
    });

    it('dispatches with cargo into loading state and cargo drawn from own storage', () => {
        const storage = makeStorageFacility({ planetId: 'p1' });
        putIntoStorageFacility(storage, steelResourceType, 500);
        const assets = makeAgentPlanetAssets('p1', { storageFacility: storage });
        const agent = makeAgent('a1', 'p1', 'Agent', { assets: { p1: assets } });
        const ship = makeTransportShip('S1', 'p1');
        agent.ships.push(ship);
        const state = makeGameState([agent], ['p1', 'p2']);
        dispatch(state, {
            agentId: 'a1',
            fromPlanetId: 'p1',
            toPlanetId: 'p2',
            shipName: 'S1',
            cargoGoal: { resourceName: 'Steel', quantity: 300 },
        });
        expect(messages[0]).toMatchObject({ type: 'shipDispatched', shipName: 'S1' });
        expect(ship.state.type).toBe('loading');
        if (ship.state.type === 'loading') {
            expect(ship.state.to).toBe('p2');
            expect(ship.state.contractId).toBeUndefined();
            expect(ship.state.posterAgentId).toBeUndefined();
            expect(ship.state.cargoGoal?.quantity).toBe(300);
            expect(ship.state.cargoGoal?.resource.name).toBe('Steel');
        }
    });
});
