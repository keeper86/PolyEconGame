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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_DISPATCH_TIMEOUT_TICKS } from '../constants';
import { MINIMUM_CONSTRUCTION_TIME_IN_TICKS, putIntoStorageFacility } from '../planet/facility';
import type { GameState } from '../planet/planet';
import { steelResourceType } from '../planet/resources';
import { maintenanceServiceResourceType } from '../planet/services';
import { makeAgent, makeAgentPlanetAssets, makeGameState, makePlanet, makeStorageFacility } from '../utils/testHelper';
import type { OutboundMessage, PendingAction } from '../workerClient/messages';
import {
    handleAcceptTransportContract,
    handleDispatchConstructionShip,
    handleDispatchShip,
} from '../workerClient/shipContractActions';
import { applyMaintenance, settleConstructionContract, settleTransportContract, travelTime } from './shipHandlers';
import type {
    ConstructionShip,
    ConstructionShipStatusTransporting,
    ShipStatusIdle,
    TransportShip,
    TransportShipStatusUnloading,
} from './ships';
import { constructionShipType, createShip, passengerLiner, shipTick, shiptypes } from './ships';

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
        const c = state;

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
        applyMaintenance(ship, agent, state);

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
        applyMaintenance(ship, agent, state);

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
            applyMaintenance(ship, agent, state);
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
        const became_derelict = applyMaintenance(ship, agent, state);

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
        applyMaintenance(ship, agent, state);

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
        settleTransportContract('S1', 'carrier', 'p2', state);

        expect(poster.assets.p1!.transportContracts).toHaveLength(0);
        expect(poster.assets.p1!.depositHold).toBe(0);
        expect(carrier.assets.p2.deposits).toBe(500);
    });

    it('does not emit a console.warn when no contract exists (non-contract delivery)', () => {
        // settleTransportContract is called for non-contract deliveries too;
        // it must not warn for every agent asset that has no matching contract.
        const carrier = makeAgent('carrier', 'p2');
        carrier.assets.p2 = makeAgentPlanetAssets('p2');
        const state = makeGameState([makePlanet({ id: 'p2' })], [carrier]);

        const warnSpy = vi.spyOn(console, 'warn');
        settleTransportContract('S_NOCONTRACT', 'carrier', 'p2', state);
        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('processes only the first matching contract and stops scanning', () => {
        // If two agents both have a matching contract (unlikely but possible in
        // theory), only the first one encountered should be settled — i.e. the
        // outer loop breaks after a match.
        const poster1 = makeAgent('poster1', 'p1');
        const poster2 = makeAgent('poster2', 'p1');
        const carrier = makeAgent('carrier', 'p2');
        carrier.assets.p2 = makeAgentPlanetAssets('p2');
        carrier.assets.p2.deposits = 0;

        const contractBase = {
            id: 'c_dup',
            fromPlanetId: 'p1',
            toPlanetId: 'p2',
            cargo: { resource: steelResourceType, quantity: 10 },
            maxDurationInTicks: 200,
            offeredReward: 100,
            postedByAgentId: 'poster1',
            expiresAtTick: 999,
            status: 'accepted' as const,
            acceptedByAgentId: 'carrier',
            shipName: 'S_DUP',
            fulfillmentDueAtTick: 999,
        };
        poster1.assets.p1!.depositHold = 100;
        poster1.assets.p1!.transportContracts.push({ ...contractBase });
        poster2.assets.p1!.depositHold = 100;
        poster2.assets.p1!.transportContracts.push({ ...contractBase, postedByAgentId: 'poster2' });

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [poster1, poster2, carrier]);
        settleTransportContract('S_DUP', 'carrier', 'p2', state);

        // Exactly one contract settled — combined contracts reduced by 1
        const remaining = poster1.assets.p1!.transportContracts.length + poster2.assets.p1!.transportContracts.length;
        expect(remaining).toBe(1);
        // Carrier paid exactly once
        expect(carrier.assets.p2!.deposits).toBe(100);
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
        settleConstructionContract('cc1', fakeFacility as never, 'carrier', 'p2', state);

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
        expect(ship.state.planetId).toBe('p1');
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

        const shipState = ship.state as unknown as TransportShipStatusUnloading;
        expect(shipState.type).toBe('unloading');
        expect(shipState.planetId).toBe('p2');
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

        const shipState = ship.state as unknown as ShipStatusIdle;
        expect(shipState.type).toBe('idle');
        expect(shipState.planetId).toBe('p2');
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
        const shipState = ship.state as unknown as ShipStatusIdle;
        expect(shipState.planetId).toBe('p2');
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
            { type: 'dispatchConstructionShip', requestId: 'r1', ...overrides },
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
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'C1' });
        expect(messages[0]).toMatchObject({ type: 'constructionShipDispatched' });
        expect(ship.state.type).toBe('pre-fabrication');
        if (ship.state.type === 'pre-fabrication') {
            expect(ship.state.deadlineTick).toBe(20 + MAX_DISPATCH_TIMEOUT_TICKS);
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

        const shipState = ship.state as unknown as ConstructionShipStatusTransporting;
        expect(shipState.type).toBe('construction_transporting');
        if (shipState.type === 'construction_transporting') {
            expect(shipState.to).toBe('p2');
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

            arrivalTick: 10,
        };
        agent.ships.push(ship);

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent], 10);
        shipTick(state);

        const shipState = ship.state as unknown as ShipStatusIdle;
        expect(shipState.type).toBe('idle');

        expect(shipState.planetId).toBe('p2');
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

        const shipState = ship.state as unknown as ShipStatusIdle;
        expect(shipState.type).toBe('idle');
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

// ---------------------------------------------------------------------------
// lost state handler — STAY, no crash
// ---------------------------------------------------------------------------

describe('lost ship is left alone', () => {
    it('does not change state of a lost ship', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeTransportShip('S1', 'p1');
        ship.state = { type: 'lost', lostAtTick: 0 };
        agent.ships.push(ship);

        const state = makeGameState([makePlanet({ id: 'p1' })], [agent]);
        expect(() => shipTick(state)).not.toThrow();
        expect(ship.state.type).toBe('lost');
    });
});

// ---------------------------------------------------------------------------
// scaleShipType
// ---------------------------------------------------------------------------

describe('scaleShipType', () => {
    it('scales volume and mass by scaleMapping value', () => {
        const base = shiptypes.solid.bulkCarrier1; // small scale = 1
        const medium = shiptypes.solid.bulkCarrier2; // medium scale = 2
        const large = shiptypes.solid.bulkCarrier3; // large scale = 4
        const superShip = shiptypes.solid.bulkCarrier4; // super scale = 8

        expect(medium.cargoSpecification.volume).toBe(base.cargoSpecification.volume * 2);
        expect(medium.cargoSpecification.mass).toBe(base.cargoSpecification.mass * 2);
        expect(large.cargoSpecification.volume).toBe(base.cargoSpecification.volume * 4);
        expect(superShip.cargoSpecification.volume).toBe(base.cargoSpecification.volume * 8);
    });

    it('scales buildingTime by scaleToLevel value', () => {
        const base = shiptypes.solid.bulkCarrier1; // small = level 1
        const medium = shiptypes.solid.bulkCarrier2; // medium = level 2
        const large = shiptypes.solid.bulkCarrier3; // large = level 3

        expect(medium.buildingTime).toBe(base.buildingTime * 2);
        expect(large.buildingTime).toBe(base.buildingTime * 3);
    });

    it('scales requiredCrew by scaleToLevel value', () => {
        const base = shiptypes.solid.bulkCarrier1;
        const medium = shiptypes.solid.bulkCarrier2;

        expect(medium.requiredCrew.primary).toBe(base.requiredCrew.primary * 2);
        expect(medium.requiredCrew.secondary).toBe(base.requiredCrew.secondary * 2);
    });

    it('preserves cargo type across scales', () => {
        const base = shiptypes.solid.bulkCarrier1;
        const superShip = shiptypes.solid.bulkCarrier4;
        expect(superShip.cargoSpecification.type).toBe(base.cargoSpecification.type);
    });
});

// ---------------------------------------------------------------------------
// createShip — all three branches
// ---------------------------------------------------------------------------

describe('createShip', () => {
    it('creates a transport ship with state=idle', () => {
        const planet = makePlanet({ id: 'p1' });
        const ship = createShip(shiptypes.solid.bulkCarrier1, 0, 'T1', planet);
        expect(ship.state.type).toBe('idle');
        expect(ship.type.type).toBe('transport');
    });

    it('creates a construction ship with state=idle', () => {
        const planet = makePlanet({ id: 'p1' });
        const ship = createShip(constructionShipType, 0, 'C1', planet);
        expect(ship.state.type).toBe('idle');
        expect(ship.type.type).toBe('construction');
    });

    it('creates a passenger ship with state=idle', () => {
        const planet = makePlanet({ id: 'p1' });
        const ship = createShip(passengerLiner, 0, 'P1', planet);
        expect(ship.state.type).toBe('idle');
        expect(ship.type.type).toBe('passenger');
    });
});

// ---------------------------------------------------------------------------
// settleTransportContract — no matching contract (console.warn path)
// ---------------------------------------------------------------------------

describe('settleTransportContract — no matching contract', () => {
    it('does not crash when no matching contract exists', () => {
        const carrier = makeAgent('carrier', 'p2');
        carrier.assets.p2 = makeAgentPlanetAssets('p2');
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [carrier]);

        // No transport contracts anywhere in the state
        expect(() => settleTransportContract('S-ghost', 'carrier', 'p2', state)).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// Cross-agent contract loading: posterAgentId points to a different agent
// ---------------------------------------------------------------------------

describe('transport ship loading: cross-agent storage via posterAgentId', () => {
    it('loads cargo from posterAgent storage, not carrier storage', () => {
        const poster = makeAgent('poster', 'p1');
        const carrier = makeAgent('carrier', 'p1');

        // Put steel in poster's storage only
        putIntoStorageFacility(poster.assets.p1!.storageFacility, steelResourceType, 500);

        const ship = makeTransportShip('S1', 'p1');
        ship.state = {
            type: 'loading',
            planetId: 'p1',
            to: 'p2',
            cargoGoal: { resource: steelResourceType, quantity: 200 },
            currentCargo: { resource: steelResourceType, quantity: 0 },
            posterAgentId: 'poster',
        };
        carrier.ships.push(ship);

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [poster, carrier]);
        shipTick(state);

        expect(ship.state.type).toBe('transporting');
        // Carrier's storage untouched; poster's storage decreased
        const posterSteelLeft = poster.assets.p1!.storageFacility.currentInStorage.Steel?.quantity ?? 0;
        expect(posterSteelLeft).toBeCloseTo(300, 1);
        const carrierSteelLeft = carrier.assets.p1!.storageFacility.currentInStorage.Steel?.quantity ?? 0;
        expect(carrierSteelLeft).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// handlePreFabrication: buildingTarget.construction === null → skip to transporting
// ---------------------------------------------------------------------------

describe('construction ship: pre-fabrication with buildingTarget.construction === null', () => {
    it('skips loading and goes directly to construction_transporting', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makeConstructionShip('C1', 'p1');

        const facilityNoConstruction = {
            type: 'production' as const,
            planetId: 'p1',
            id: 'f1',
            name: 'Ready Facility',
            maxScale: 1,
            scale: 1,
            construction: null, // already built — no construction phase
            powerConsumptionPerTick: 0,
            workerRequirement: {},
            pollutionPerTick: { air: 0, water: 0, soil: 0 },
            needs: [],
            produces: [],
            lastTickResults: {
                overallEfficiency: 0,
                workerEfficiency: {},
                overqualifiedWorkers: {},
                resourceEfficiency: {},
                exactUsedByEdu: {},
                totalUsedByEdu: {},
                lastProduced: {},
                lastConsumed: {},
            },
        };

        ship.state = {
            type: 'pre-fabrication',
            planetId: 'p1',
            to: 'p2',
            buildingTarget: facilityNoConstruction as never,
            progress: 0,
        };
        agent.ships.push(ship);

        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        shipTick(state);

        const shipState = ship.state as unknown as ConstructionShipStatusTransporting;
        expect(shipState.type).toBe('construction_transporting');
        if (shipState.type === 'construction_transporting') {
            expect(shipState.to).toBe('p2');
        }
    });
});

// ---------------------------------------------------------------------------
// settleConstructionContract: commissioningAgentId !== carrierAgentId
// ---------------------------------------------------------------------------

describe('settleConstructionContract — facility placed on third agent', () => {
    it('places facility on commissioningAgent, pays carrier', () => {
        const poster = makeAgent('poster', 'p1');
        const carrier = makeAgent('carrier', 'p2');
        const commissioner = makeAgent('commissioner', 'p2');

        carrier.assets.p2 = makeAgentPlanetAssets('p2');
        carrier.assets.p2.deposits = 0;
        commissioner.assets.p2 = makeAgentPlanetAssets('p2');

        poster.assets.p1!.depositHold = 800;
        poster.assets.p1!.constructionContracts.push({
            id: 'cc2',
            fromPlanetId: 'p1',
            toPlanetId: 'p2',
            facilityName: 'Third Party Fac',
            commissioningAgentId: 'commissioner', // <-- different from carrier
            offeredReward: 800,
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
            id: 'fac-3p',
            name: 'Third Party Fac',
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

        const state = makeGameState(
            [makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })],
            [poster, carrier, commissioner],
        );
        settleConstructionContract('cc2', fakeFacility as never, 'carrier', 'p2', state);

        // Carrier gets paid
        expect(carrier.assets.p2.deposits).toBe(800);
        // Facility placed on commissioner, not carrier
        expect(commissioner.assets.p2!.productionFacilities).toHaveLength(1);
        expect(carrier.assets.p2.productionFacilities).toHaveLength(0);
        // Commission agent's facility has correct planetId
        expect(commissioner.assets.p2!.productionFacilities[0]!.planetId).toBe('p2');
    });
});
