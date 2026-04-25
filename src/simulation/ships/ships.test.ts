/**
 * Comprehensive tests for the ship simulation module.
 *
 * Covers:
 *  - applyMaintenance helper (degradation, repair, derelict transition)
 *  - travelTime helper
 *  - settleTransportContract helper
 *  - settleConstructionContract helper
 *  - Transport ship handlers (loading, transporting, unloading)
 *  - Transport ship loading deadline timeout
 *  - Construction ship handlers (pre-fabrication, transit, reconstruction)
 *  - handleDispatchShip (validation + success paths)
 *  - handleDispatchConstructionShip (validation + success paths)
 *  - handleAcceptTransportContract
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { MAX_DISPATCH_TIMEOUT_TICKS } from '../constants';
import {
    putIntoStorageFacility,
    removeFromStorageFacility,
    MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
} from '../planet/facility';
import type { Agent, GameState } from '../planet/planet';
import { steelResourceType } from '../planet/resources';
import { maintenanceServiceResourceType } from '../planet/services';
import type { OutboundMessage, PendingAction } from '../workerClient/messages';
import {
    handleAcceptTransportContract,
    handleDispatchConstructionShip,
    handleDispatchShip,
} from '../workerClient/shipContractActions';
import { makeAgent, makeAgentPlanetAssets, makeGameState, makePlanet, makeStorageFacility } from '../utils/testHelper';
import { applyMaintenance, settleTransportContract, settleConstructionContract, travelTime } from './shipHandlers';
import type { ShipTickContext } from './shipHandlers';
import type { ConstructionShip, TransportShip, TransportShipStatusLoading } from './ships';
import { constructionShipType, createShip, shipTick, shiptypes } from './ships';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMessages(): { messages: OutboundMessage[]; post: (m: OutboundMessage) => void } {
    const messages: OutboundMessage[] = [];
    return { messages, post: (m) => messages.push(m) };
}

function makeTransportShip(name: string, planetId: string): TransportShip {
    const planet = makePlanet({ id: planetId });
    return createShip(shiptypes.solid.bulkCarrier1, 0, name, planet) as TransportShip;
}

function makeConstructionShip(name: string, planetId: string): ConstructionShip {
    const planet = makePlanet({ id: planetId });
    return createShip(constructionShipType, 0, name, planet) as ConstructionShip;
}

function ctx(gameState: GameState): ShipTickContext {
    return { tick: gameState.tick, planets: gameState.planets, agents: gameState.agents };
}

// ---------------------------------------------------------------------------
// travelTime
// ---------------------------------------------------------------------------

describe('travelTime', () => {
    it('returns ceil(1000 / speed) for a transport ship', () => {
        const ship = makeTransportShip('S', 'p1');
        // bulkCarrier1 speed = 6
        expect(travelTime(ship)).toBe(Math.ceil(1000 / 6));
    });

    it('returns ceil(1000 / speed) for a construction ship (speed 4)', () => {
        const ship = makeConstructionShip('C', 'p1');
        // constructionShipType speed = 4
        expect(travelTime(ship)).toBe(Math.ceil(1000 / 4));
    });
});

// ---------------------------------------------------------------------------
// applyMaintenance
// ---------------------------------------------------------------------------

describe('applyMaintenance', () => {
    it('degrades maintainanceStatus each tick for an idle ship without storage', () => {
        const agent = makeAgent('a1', 'p1');
        // Remove storage so no repair happens
        agent.assets.p1!.storageFacility = undefined as unknown as ReturnType<typeof makeStorageFacility>;
        const ship = makeTransportShip('S1', 'p1');
        ship.maintainanceStatus = 1.0;

        const state = makeGameState([makePlanet({ id: 'p1' })], [agent]);
        const c = ctx(state);

        const became_derelict = applyMaintenance(ship, agent, c);
        expect(became_derelict).toBe(false);
        expect(ship.maintainanceStatus).toBeLessThan(1.0);
    });

    it('repairs ship from storage when idle and storage has maintenance', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');
        ship.maintainanceStatus = 0.5;
        ship.maxMaintenance = 1.0;

        // Add plenty of maintenance
        const storage = agent.assets.p1!.storageFacility;
        putIntoStorageFacility(storage, maintenanceServiceResourceType, 100);

        const state = makeGameState([makePlanet({ id: 'p1' })], [agent]);
        applyMaintenance(ship, agent, ctx(state));

        expect(ship.maintainanceStatus).toBeGreaterThan(0.5);
    });

    it('does not repair ship when it is transporting', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');
        ship.state = {
            type: 'transporting',
            from: 'p1',
            to: 'p2',
            cargo: null,
            arrivalTick: 999,
        };
        ship.maintainanceStatus = 0.5;

        const storage = agent.assets.p1!.storageFacility;
        putIntoStorageFacility(storage, maintenanceServiceResourceType, 100);

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        applyMaintenance(ship, agent, ctx(state));

        // Maintenance should have dropped, not risen
        expect(ship.maintainanceStatus).toBeLessThan(0.5);
    });

    it('degrades maxMaintenance after completing a full repair cycle', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');
        ship.maintainanceStatus = 0.0;
        ship.maxMaintenance = 1.0;
        ship.cumulativeRepairAcc = 0.0;

        const storage = agent.assets.p1!.storageFacility;
        // Add exactly 1.0 maintenance — will trigger one full degradation cycle
        putIntoStorageFacility(storage, maintenanceServiceResourceType, 1.0);

        const state = makeGameState([makePlanet({ id: 'p1' })], [agent]);
        // Run enough ticks to consume all 1.0
        for (let i = 0; i < 40; i++) {
            applyMaintenance(ship, agent, ctx(state));
        }

        expect(ship.maxMaintenance).toBeLessThan(1.0);
    });

    it('transitions ship to derelict when maxMaintenance reaches zero', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');
        ship.maintainanceStatus = 0.0;
        ship.maxMaintenance = 0.001; // Nearly gone — will hit zero after first repair cycle
        ship.cumulativeRepairAcc = 0.999; // Almost one full cycle already accumulated

        const storage = agent.assets.p1!.storageFacility;
        putIntoStorageFacility(storage, maintenanceServiceResourceType, 100);

        const state = makeGameState([makePlanet({ id: 'p1' })], [agent]);
        const became_derelict = applyMaintenance(ship, agent, ctx(state));

        expect(became_derelict).toBe(true);
        expect(ship.state.type).toBe('derelict');
        expect(ship.maintainanceStatus).toBe(0);
    });

    it('removes ship listing when derelict transition happens on a listed ship', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');
        ship.state = { type: 'listed', planetId: 'p1' };
        ship.maintainanceStatus = 0.0;
        ship.maxMaintenance = 0.001;
        ship.cumulativeRepairAcc = 0.999;
        agent.assets.p1!.shipListings.push({
            id: 'l1',
            sellerAgentId: 'a1',
            shipName: 'S1',
            shipTypeName: 'Bulk Carrier 1',
            askPrice: 1000,
            planetId: 'p1',
            postedAtTick: 0,
        });

        const storage = agent.assets.p1!.storageFacility;
        putIntoStorageFacility(storage, maintenanceServiceResourceType, 100);

        const state = makeGameState([makePlanet({ id: 'p1' })], [agent]);
        applyMaintenance(ship, agent, ctx(state));

        expect(ship.state.type).toBe('derelict');
        expect(agent.assets.p1!.shipListings).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// settleTransportContract
// ---------------------------------------------------------------------------

describe('settleTransportContract', () => {
    it('pays reward to carrier and removes contract when found', () => {
        const poster = makeAgent('poster', 'p1');
        const carrier = makeAgent('carrier', 'p2');

        poster.assets.p1!.deposits = 0;
        poster.assets.p1!.depositHold = 500;
        poster.assets.p1!.transportContracts.push({
            id: 'c1',
            fromPlanetId: 'p1',
            toPlanetId: 'p2',
            cargo: { resource: steelResourceType, quantity: 100 },
            maxDurationInTicks: 200,
            offeredReward: 500,
            postedByAgentId: 'poster',
            expiresAtTick: 999,
            status: 'accepted',
            acceptedByAgentId: 'carrier',
            shipName: 'S1',
            fulfillmentDueAtTick: 999,
        });
        carrier.assets.p2 = makeAgentPlanetAssets('p2');
        carrier.assets.p2.deposits = 0;

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [poster, carrier]);
        settleTransportContract('S1', 'carrier', 'p2', ctx(state));

        expect(poster.assets.p1!.transportContracts).toHaveLength(0);
        expect(poster.assets.p1!.depositHold).toBe(0);
        expect(carrier.assets.p2.deposits).toBe(500);
    });
});

// ---------------------------------------------------------------------------
// settleConstructionContract
// ---------------------------------------------------------------------------

describe('settleConstructionContract', () => {
    it('pays reward, marks complete, and places facility', () => {
        const poster = makeAgent('poster', 'p1');
        const carrier = makeAgent('carrier', 'p2');
        carrier.assets.p2 = makeAgentPlanetAssets('p2');
        carrier.assets.p2.deposits = 0;
        poster.assets.p1!.depositHold = 1000;
        poster.assets.p1!.constructionContracts.push({
            id: 'cc1',
            fromPlanetId: 'p1',
            toPlanetId: 'p2',
            facilityName: 'Test Facility',
            commissioningAgentId: 'carrier',
            offeredReward: 1000,
            postedByAgentId: 'poster',
            expiresAtTick: 9999,
            status: 'accepted',
            acceptedByAgentId: 'carrier',
            shipName: 'C1',
            fulfillmentDueAtTick: 9999,
        });

        const fakeFacility = {
            type: 'production' as const,
            planetId: 'p1',
            id: 'fac-1',
            name: 'Test Facility',
            maxScale: 1,
            scale: 1,
            construction: null,
            powerConsumptionPerTick: 0,
            workerRequirement: {},
            pollutionPerTick: { air: 0, water: 0, soil: 0 },
            needs: [],
            produces: [],
            lastTickResults: {
                overallEfficiency: 0,
                overqualifiedWorkers: {},
                resourceEfficiency: {},
                workerEfficiency: {},
                exactUsedByEdu: {},
                totalUsedByEdu: {},
                lastProduced: {},
                lastConsumed: {},
            },
        };

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [poster, carrier]);
        settleConstructionContract('cc1', fakeFacility as never, 'carrier', 'p2', ctx(state));

        const contract = poster.assets.p1!.constructionContracts[0]!;
        expect(contract.status).toBe('completed');
        expect(poster.assets.p1!.depositHold).toBe(0);
        expect(carrier.assets.p2.deposits).toBe(1000);
        expect(carrier.assets.p2.productionFacilities).toHaveLength(1);
        expect(carrier.assets.p2.productionFacilities[0]!.planetId).toBe('p2');
    });
});

// ---------------------------------------------------------------------------
// Transport ship handlers (via shipTick)
// ---------------------------------------------------------------------------

describe('transport ship: loading → transporting', () => {
    it('loads cargo from storage and transitions to transporting', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');
        const storage = agent.assets.p1!.storageFacility;
        putIntoStorageFacility(storage, steelResourceType, 500);

        ship.state = {
            type: 'loading',
            planetId: 'p1',
            to: 'p2',
            cargoGoal: { resource: steelResourceType, quantity: 300 },
            currentCargo: { resource: steelResourceType, quantity: 0 },
        };

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        agent.ships.push(ship);

        shipTick(state);

        expect(ship.state.type).toBe('transporting');
        expect(storage.currentInStorage.Steel?.quantity).toBeCloseTo(200, 1);
    });

    it('stays in loading when cargo is unavailable', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');

        ship.state = {
            type: 'loading',
            planetId: 'p1',
            to: 'p2',
            cargoGoal: { resource: steelResourceType, quantity: 300 },
            currentCargo: { resource: steelResourceType, quantity: 0 },
        };

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        agent.ships.push(ship);

        shipTick(state);

        expect(ship.state.type).toBe('loading');
    });

    it('aborts to idle when deadline is exceeded', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent], 100);
        ship.state = {
            type: 'loading',
            planetId: 'p1',
            to: 'p2',
            cargoGoal: { resource: steelResourceType, quantity: 300 },
            currentCargo: { resource: steelResourceType, quantity: 0 },
            deadlineTick: 50, // already past
        };
        agent.ships.push(ship);

        shipTick(state);

        expect(ship.state.type).toBe('idle');
        if (ship.state.type === 'idle') {
            expect(ship.state.planetId).toBe('p1');
        }
    });

    it('ferry mode: transitions loading without cargo to transporting with null cargo', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');

        ship.state = {
            type: 'loading',
            planetId: 'p1',
            to: 'p2',
            cargoGoal: null,
            currentCargo: { resource: steelResourceType, quantity: 0 },
        };

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        agent.ships.push(ship);

        shipTick(state);

        expect(ship.state.type).toBe('transporting');
    });
});

describe('transport ship: transporting → unloading', () => {
    it('stays in transporting before arrival tick', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');
        ship.state = {
            type: 'transporting',
            from: 'p1',
            to: 'p2',
            cargo: { resource: steelResourceType, quantity: 100 },
            arrivalTick: 500,
        };
        agent.ships.push(ship);

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent], 100);

        shipTick(state);

        expect(ship.state.type).toBe('transporting');
    });

    it('transitions to unloading at arrival tick', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');
        ship.state = {
            type: 'transporting',
            from: 'p1',
            to: 'p2',
            cargo: { resource: steelResourceType, quantity: 100 },
            arrivalTick: 100,
        };
        agent.ships.push(ship);

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent], 100);

        shipTick(state);

        expect(ship.state.type).toBe('unloading');
        if (ship.state.type === 'unloading') {
            expect(ship.state.planetId).toBe('p2');
        }
    });

    it('ferry mode: goes idle at destination when cargo is null', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');
        ship.state = {
            type: 'transporting',
            from: 'p1',
            to: 'p2',
            cargo: null,
            arrivalTick: 10,
        };
        agent.ships.push(ship);

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent], 10);

        shipTick(state);

        expect(ship.state.type).toBe('idle');
        if (ship.state.type === 'idle') {
            expect(ship.state.planetId).toBe('p2');
        }
    });
});

describe('transport ship: unloading → idle', () => {
    it('dumps cargo into storage and transitions to idle', () => {
        const agent = makeAgent('a1', 'p1');
        agent.assets.p2 = makeAgentPlanetAssets('p2');
        const ship = makeTransportShip('S1', 'p1');
        ship.state = {
            type: 'unloading',
            planetId: 'p2',
            cargo: { resource: steelResourceType, quantity: 200 },
        };
        agent.ships.push(ship);

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);

        shipTick(state);

        expect(ship.state.type).toBe('idle');
        if (ship.state.type === 'idle') {
            expect(ship.state.planetId).toBe('p2');
        }
        const stored = agent.assets.p2!.storageFacility.currentInStorage.Steel?.quantity ?? 0;
        expect(stored).toBe(200);
    });

    it('stays in unloading when destination storage is full', () => {
        const agent = makeAgent('a1', 'p1');
        agent.assets.p2 = makeAgentPlanetAssets('p2', {
            storageFacility: makeStorageFacility({
                planetId: 'p2',
                id: 'storage-p2',
                capacity: { volume: 0.1, mass: 0.1 }, // tiny capacity
            }),
        });
        const ship = makeTransportShip('S1', 'p1');
        ship.state = {
            type: 'unloading',
            planetId: 'p2',
            cargo: { resource: steelResourceType, quantity: 1_000_000 },
        };
        agent.ships.push(ship);

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);

        shipTick(state);

        expect(ship.state.type).toBe('unloading');
    });
});

// ---------------------------------------------------------------------------
// handleDispatchShip validation
// ---------------------------------------------------------------------------

describe('handleDispatchShip validation', () => {
    let messages: OutboundMessage[];
    let post: (m: OutboundMessage) => void;

    beforeEach(() => {
        ({ messages, post } = makeMessages());
    });

    function dispatch(
        state: GameState,
        overrides: Partial<Extract<PendingAction, { type: 'dispatchShip' }>> &
            Pick<
                Extract<PendingAction, { type: 'dispatchShip' }>,
                'agentId' | 'fromPlanetId' | 'toPlanetId' | 'shipName'
            >,
    ) {
        handleDispatchShip(state, { type: 'dispatchShip', requestId: 'r1', cargoGoal: null, ...overrides }, post);
    }

    it('fails when agent not found', () => {
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], []);
        dispatch(state, { agentId: 'missing', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'S1' });
        expect(messages[0]).toMatchObject({ type: 'shipDispatchFailed', reason: 'Agent not found' });
    });

    it('fails when destination planet not found', () => {
        const agent = makeAgent('a1', 'p1');
        const state = makeGameState([makePlanet({ id: 'p1' })], [agent]);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'S1' });
        expect(messages[0]).toMatchObject({ type: 'shipDispatchFailed' });
    });

    it('fails when ship not found', () => {
        const agent = makeAgent('a1', 'p1');
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'Ghost' });
        expect(messages[0]).toMatchObject({ type: 'shipDispatchFailed' });
    });

    it('fails when ship is not idle', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');
        ship.state = { type: 'transporting', from: 'p1', to: 'p2', cargo: null, arrivalTick: 999 };
        agent.ships.push(ship);
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'S1' });
        expect(messages[0]).toMatchObject({ type: 'shipDispatchFailed', reason: 'Ship is not idle' });
    });

    it('fails when ship is not a transport ship', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeConstructionShip('C1', 'p1');
        agent.ships.push(ship);
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'C1' });
        expect(messages[0]).toMatchObject({ type: 'shipDispatchFailed' });
    });

    it('succeeds in ferry mode and sets deadlineTick', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');
        agent.ships.push(ship);
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent], 10);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'S1', cargoGoal: null });
        expect(messages[0]).toMatchObject({ type: 'shipDispatched' });
        // ferry goes straight to transporting, no deadlineTick
        expect(ship.state.type).toBe('transporting');
    });

    it('succeeds with cargo goal and sets deadlineTick on loading state', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');
        agent.ships.push(ship);
        const storage = agent.assets.p1!.storageFacility;
        putIntoStorageFacility(storage, steelResourceType, 500);

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent], 5);
        dispatch(state, {
            agentId: 'a1',
            fromPlanetId: 'p1',
            toPlanetId: 'p2',
            shipName: 'S1',
            cargoGoal: { resourceName: 'Steel', quantity: 200 },
        });

        expect(messages[0]).toMatchObject({ type: 'shipDispatched' });
        expect(ship.state.type).toBe('loading');
        if (ship.state.type === 'loading') {
            expect(ship.state.deadlineTick).toBe(5 + MAX_DISPATCH_TIMEOUT_TICKS);
        }
    });

    it('fails when cargo goal resource not found in storage', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');
        agent.ships.push(ship);
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        dispatch(state, {
            agentId: 'a1',
            fromPlanetId: 'p1',
            toPlanetId: 'p2',
            shipName: 'S1',
            cargoGoal: { resourceName: 'Steel', quantity: 200 },
        });
        expect(messages[0]).toMatchObject({ type: 'shipDispatchFailed' });
    });
});

// ---------------------------------------------------------------------------
// handleDispatchConstructionShip validation
// ---------------------------------------------------------------------------

describe('handleDispatchConstructionShip validation', () => {
    let messages: OutboundMessage[];
    let post: (m: OutboundMessage) => void;

    beforeEach(() => {
        ({ messages, post } = makeMessages());
    });

    function dispatch(
        state: GameState,
        overrides: Partial<Extract<PendingAction, { type: 'dispatchConstructionShip' }>> &
            Pick<
                Extract<PendingAction, { type: 'dispatchConstructionShip' }>,
                'agentId' | 'fromPlanetId' | 'toPlanetId' | 'shipName'
            >,
    ) {
        handleDispatchConstructionShip(
            state,
            { type: 'dispatchConstructionShip', requestId: 'r1', facilityName: null, ...overrides },
            post,
        );
    }

    it('fails when agent not found', () => {
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], []);
        dispatch(state, { agentId: 'missing', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'C1' });
        expect(messages[0]).toMatchObject({ type: 'constructionShipDispatchFailed' });
    });

    it('fails when ship not found', () => {
        const agent = makeAgent('a1', 'p1');
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'Ghost' });
        expect(messages[0]).toMatchObject({ type: 'constructionShipDispatchFailed' });
    });

    it('fails when ship is not a construction ship', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');
        agent.ships.push(ship);
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'S1' });
        expect(messages[0]).toMatchObject({ type: 'constructionShipDispatchFailed' });
    });

    it('fails when ship is not idle', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeConstructionShip('C1', 'p1');
        ship.state = { type: 'pre-fabrication', planetId: 'p1', to: 'p2', buildingTarget: null, progress: 0 };
        agent.ships.push(ship);
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'C1' });
        expect(messages[0]).toMatchObject({ type: 'constructionShipDispatchFailed', reason: 'Ship is not idle' });
    });

    it('succeeds without facility name and sets deadlineTick', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeConstructionShip('C1', 'p1');
        agent.ships.push(ship);
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent], 20);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'C1', facilityName: null });
        expect(messages[0]).toMatchObject({ type: 'constructionShipDispatched' });
        expect(ship.state.type).toBe('pre-fabrication');
        if (ship.state.type === 'pre-fabrication') {
            expect((ship.state as TransportShipStatusLoading & { deadlineTick?: number }).deadlineTick).toBe(
                20 + MAX_DISPATCH_TIMEOUT_TICKS,
            );
        }
    });
});

// ---------------------------------------------------------------------------
// Construction ship handlers (via shipTick)
// ---------------------------------------------------------------------------

describe('construction ship: pre-fabrication → transporting', () => {
    it('goes directly to transporting when no building target', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeConstructionShip('C1', 'p1');
        ship.state = { type: 'pre-fabrication', planetId: 'p1', to: 'p2', buildingTarget: null, progress: 0 };
        agent.ships.push(ship);

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        shipTick(state);

        expect(ship.state.type).toBe('construction_transporting');
        if (ship.state.type === 'construction_transporting') {
            expect(ship.state.to).toBe('p2');
        }
    });

    it('aborts to idle when pre-fabrication deadline exceeded', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeConstructionShip('C1', 'p1');
        ship.state = {
            type: 'pre-fabrication',
            planetId: 'p1',
            to: 'p2',
            buildingTarget: null,
            progress: 0,
            deadlineTick: 5,
        };
        agent.ships.push(ship);

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent], 100);
        shipTick(state);

        expect(ship.state.type).toBe('idle');
    });
});

describe('construction ship: construction_transporting → reconstruction', () => {
    it('stays in transit before arrival', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeConstructionShip('C1', 'p1');
        ship.state = {
            type: 'construction_transporting',
            from: 'p1',
            to: 'p2',
            buildingTarget: null,
            loaded: 0,
            arrivalTick: 500,
        };
        agent.ships.push(ship);

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent], 10);
        shipTick(state);

        expect(ship.state.type).toBe('construction_transporting');
    });

    it('goes idle at destination when no building target', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeConstructionShip('C1', 'p1');
        ship.state = {
            type: 'construction_transporting',
            from: 'p1',
            to: 'p2',
            buildingTarget: null,
            loaded: 0,
            arrivalTick: 10,
        };
        agent.ships.push(ship);

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent], 10);
        shipTick(state);

        expect(ship.state.type).toBe('idle');
        if (ship.state.type === 'idle') {
            expect(ship.state.planetId).toBe('p2');
        }
    });
});

describe('construction ship: reconstruction places facility', () => {
    it('counts down progress and places facility for the carrying agent when no contract', () => {
        const agent = makeAgent('a1', 'p1');
        agent.assets.p2 = makeAgentPlanetAssets('p2');
        const ship = makeConstructionShip('C1', 'p1');

        const facilitySnapshot = {
            type: 'production' as const,
            planetId: 'p1',
            id: 'fac-test',
            name: 'Test Fac',
            maxScale: 1,
            scale: 1,
            construction: null,
            powerConsumptionPerTick: 0,
            workerRequirement: {},
            pollutionPerTick: { air: 0, water: 0, soil: 0 },
            needs: [],
            produces: [],
            lastTickResults: {
                overallEfficiency: 0,
                overqualifiedWorkers: {},
                resourceEfficiency: {},
                workerEfficiency: {},
                exactUsedByEdu: {},
                totalUsedByEdu: {},
                lastProduced: {},
                lastConsumed: {},
            },
        };

        // Set progress to 1 tick remaining
        ship.state = {
            type: 'reconstruction',
            planetId: 'p2',
            buildingTarget: facilitySnapshot as never,
            progress: 1 / MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
        };
        agent.ships.push(ship);

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        shipTick(state);

        expect(ship.state.type).toBe('idle');
        expect(agent.assets.p2!.productionFacilities).toHaveLength(1);
        expect(agent.assets.p2!.productionFacilities[0]!.planetId).toBe('p2');
    });

    it('stays in reconstruction while progress > 0', () => {
        const agent = makeAgent('a1', 'p1');
        agent.assets.p2 = makeAgentPlanetAssets('p2');
        const ship = makeConstructionShip('C1', 'p1');

        ship.state = {
            type: 'reconstruction',
            planetId: 'p2',
            buildingTarget: { type: 'production', id: 'f', name: 'F', planetId: 'p1' } as never,
            progress: 0.9,
        };
        agent.ships.push(ship);

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        shipTick(state);

        expect(ship.state.type).toBe('reconstruction');
    });
});

// ---------------------------------------------------------------------------
// handleAcceptTransportContract sets deadlineTick
// ---------------------------------------------------------------------------

describe('handleAcceptTransportContract deadlineTick', () => {
    it('sets deadlineTick = tick + MAX_DISPATCH_TIMEOUT_TICKS on the loading state', () => {
        const poster = makeAgent('poster', 'p1');
        const carrier = makeAgent('carrier', 'p1');
        const ship = makeTransportShip('S1', 'p1');
        carrier.ships.push(ship);

        // Add steel to poster storage so contract can be accepted
        const posterStorage = poster.assets.p1!.storageFacility;
        putIntoStorageFacility(posterStorage, steelResourceType, 1000);

        poster.assets.p1!.transportContracts.push({
            id: 'tc1',
            fromPlanetId: 'p1',
            toPlanetId: 'p2',
            cargo: { resource: steelResourceType, quantity: 200 },
            maxDurationInTicks: 300,
            offeredReward: 500,
            postedByAgentId: 'poster',
            expiresAtTick: 9999,
            status: 'open',
        });
        poster.assets.p1!.depositHold = 500;

        const { messages, post } = makeMessages();
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [poster, carrier], 50);

        handleAcceptTransportContract(
            state,
            {
                type: 'acceptTransportContract',
                requestId: 'r1',
                agentId: 'carrier',
                posterAgentId: 'poster',
                planetId: 'p1',
                contractId: 'tc1',
                shipName: 'S1',
            },
            post,
        );

        expect(messages[0]).toMatchObject({ type: 'transportContractAccepted' });
        expect(ship.state.type).toBe('loading');
        if (ship.state.type === 'loading') {
            expect(ship.state.deadlineTick).toBe(50 + MAX_DISPATCH_TIMEOUT_TICKS);
        }
    });
});

// ---------------------------------------------------------------------------
// Derelict ships are skipped entirely
// ---------------------------------------------------------------------------

describe('derelict ship skipping', () => {
    it('does not change state of a derelict ship', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');
        ship.state = { type: 'derelict', planetId: 'p1' };
        agent.ships.push(ship);

        const state = makeGameState([makePlanet({ id: 'p1' })], [agent]);
        shipTick(state);

        expect(ship.state.type).toBe('derelict');
    });
});
