import { beforeEach, describe, expect, it } from 'vitest';
import {
    GROCERY_BUFFER_TARGET_TICKS,
    HEALTHCARE_BUFFER_TARGET_TICKS,
    SERVICE_PER_PERSON_PER_TICK,
    TICKS_PER_YEAR,
} from '../constants';
import { putIntoStorageFacility } from '../planet/facility';
import type { Agent, GameState, Planet } from '../planet/planet';
import { groceryServiceResourceType, healthcareServiceResourceType } from '../planet/services';
import { nullPopulationCategory } from '../population/population';
import { makeAgent, makeGameState, makePlanet } from '../utils/testHelper';
import type { OutboundMessage, PendingAction } from '../workerClient/messages';
import { handleDispatchPassengerShip } from '../workerClient/shipContractActions';
import type {
    PassengerShip,
    PassengerShipStatusProvisioning,
    PassengerShipStatusTransporting,
    ShipStatusIdle,
} from './ships';
import { passengerLiner, shipTick } from './ships';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePassengerShip(name: string, planetId: string, capacity = 50_000): PassengerShip {
    return {
        name,
        builtAtTick: 0,
        maintainanceStatus: 1,
        maxMaintenance: 1,
        cumulativeRepairAcc: 0,
        type: { ...passengerLiner, passengerCapacity: capacity },
        state: { type: 'idle', planetId },
    };
}

/** Put `count` employed workers at `age` into agent workforce + planet demography. */
function seedWorkforce(
    agent: Agent,
    planet: Planet,
    age: number,
    count: number,
    wealth = { mean: 100, variance: 10 },
): void {
    const planetId = planet.id;
    const wf = agent.assets[planetId]?.workforceDemography;
    if (!wf) {
        return;
    }
    wf[age].none.novice.active += count;

    const demCell = planet.population.demography[age].employed.none.novice;
    demCell.total += count;
    demCell.wealth = wealth;
    demCell.services = {
        grocery: { buffer: GROCERY_BUFFER_TARGET_TICKS, starvationLevel: 0 },
        retail: { buffer: 10, starvationLevel: 0 },
        logistics: { buffer: 4, starvationLevel: 0 },
        healthcare: { buffer: HEALTHCARE_BUFFER_TARGET_TICKS, starvationLevel: 0 },
        construction: { buffer: 2, starvationLevel: 0 },
        administrative: { buffer: 3, starvationLevel: 0 },
        education: { buffer: 2, starvationLevel: 0 },
    };
    planet.population.summedPopulation.employed.none.novice.total += count;
}

function putProvisions(agent: Agent, planetId: string, grocery: number, healthcare: number): void {
    const storage = agent.assets[planetId]?.storageFacility;
    if (!storage) {
        return;
    }
    putIntoStorageFacility(storage, groceryServiceResourceType, grocery);
    putIntoStorageFacility(storage, healthcareServiceResourceType, healthcare);
}

function makeMessages(): { messages: OutboundMessage[]; post: (m: OutboundMessage) => void } {
    const messages: OutboundMessage[] = [];
    return { messages, post: (m) => messages.push(m) };
}

function dispatch(
    state: GameState,
    partial: Partial<Extract<PendingAction, { type: 'dispatchPassengerShip' }>> &
        Pick<
            Extract<PendingAction, { type: 'dispatchPassengerShip' }>,
            'agentId' | 'fromPlanetId' | 'toPlanetId' | 'shipName'
        >,
    post: (m: OutboundMessage) => void,
): void {
    handleDispatchPassengerShip(
        state,
        {
            type: 'dispatchPassengerShip',
            requestId: 'req-1',
            passengerCount: 100,
            ...partial,
        },
        post,
    );
}

// ---------------------------------------------------------------------------
// handleDispatchPassengerShip — validation
// ---------------------------------------------------------------------------

describe('handleDispatchPassengerShip validation', () => {
    let messages: OutboundMessage[];
    let post: (m: OutboundMessage) => void;

    beforeEach(() => {
        ({ messages, post } = makeMessages());
    });

    it('fails when agent not found', () => {
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], []);
        dispatch(state, { agentId: 'missing', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'S1' }, post);
        expect(messages[0]).toMatchObject({ type: 'passengerShipDispatchFailed', reason: 'Agent not found' });
    });

    it('fails when source planet not found', () => {
        const agent = makeAgent('a1', 'p2');
        const state = makeGameState([makePlanet({ id: 'p2' })], [agent]);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'S1' }, post);
        expect(messages[0]).toMatchObject({ type: 'passengerShipDispatchFailed' });
    });

    it('fails when destination planet not found', () => {
        const agent = makeAgent('a1', 'p1');
        const state = makeGameState([makePlanet({ id: 'p1' })], [agent]);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'S1' }, post);
        expect(messages[0]).toMatchObject({ type: 'passengerShipDispatchFailed' });
    });

    it('fails when ship not found', () => {
        const agent = makeAgent('a1', 'p1');
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'Ghost' }, post);
        expect(messages[0]).toMatchObject({ type: 'passengerShipDispatchFailed' });
    });

    it('fails when ship is not idle', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makePassengerShip('S1', 'p1');
        ship.state = {
            type: 'passenger_boarding',
            posterAgentId: 'a1',
            planetId: 'p1',
            to: 'p2',
            passengerGoal: 10,
            currentPassengers: 0,
            manifest: {},
        };
        agent.ships.push(ship);
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'S1' }, post);
        expect(messages[0]).toMatchObject({ type: 'passengerShipDispatchFailed', reason: 'Ship is not idle' });
    });

    it('fails when ship is not on source planet', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makePassengerShip('S1', 'p3');
        agent.ships.push(ship);
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'S1' }, post);
        expect(messages[0]).toMatchObject({ type: 'passengerShipDispatchFailed' });
    });

    it('fails when ship is not a passenger ship', () => {
        const { messages: msgs, post: p } = makeMessages();
        const agent = makeAgent('a1', 'p1');
        // Use a transport ship
        const ship = {
            name: 'T1',
            builtAtTick: 0,
            maintainanceStatus: 1,
            maxMaintenance: 1,
            cumulativeRepairAcc: 0,
            type: {
                type: 'transport' as const,
                name: 'Bulk',
                scale: 'small' as const,
                speed: 6,
                cargoSpecification: { type: 'solid' as const, volume: 1000, mass: 1000 },
                requiredCrew: { none: 0, primary: 0, secondary: 0, tertiary: 0 },
                buildingCost: [],
                buildingTime: 60,
            },
            state: { type: 'idle' as const, planetId: 'p1' },
        };
        agent.ships.push(ship);
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'T1' }, p);
        expect(msgs[0]).toMatchObject({ type: 'passengerShipDispatchFailed' });
    });

    it('fails when passenger count is 0', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makePassengerShip('S1', 'p1');
        agent.ships.push(ship);
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        dispatch(
            state,
            { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'S1', passengerCount: 0 },
            post,
        );
        expect(messages[0]).toMatchObject({ type: 'passengerShipDispatchFailed' });
    });

    it('succeeds and sets ship to passenger_boarding', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makePassengerShip('S1', 'p1', 50_000);
        agent.ships.push(ship);
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        dispatch(
            state,
            { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'S1', passengerCount: 200 },
            post,
        );
        expect(messages[0]).toMatchObject({ type: 'passengerShipDispatched', shipName: 'S1' });
        expect(ship.state.type).toBe('passenger_boarding');
        if (ship.state.type === 'passenger_boarding') {
            expect(ship.state.passengerGoal).toBe(200);
            expect(ship.state.to).toBe('p2');
            expect(ship.state.manifest).toEqual({});
        }
    });

    it('caps passengerGoal at ship capacity', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makePassengerShip('S1', 'p1', 50);
        agent.ships.push(ship);
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        dispatch(
            state,
            { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipName: 'S1', passengerCount: 999_999 },
            post,
        );
        expect(messages[0]).toMatchObject({ type: 'passengerShipDispatched' });
        if (ship.state.type === 'passenger_boarding') {
            expect(ship.state.passengerGoal).toBe(50);
        }
    });
});

// ---------------------------------------------------------------------------
// shipTick — boarding phase
// ---------------------------------------------------------------------------

describe('shipTick passenger boarding', () => {
    it('boards workers from agent workforce into the manifest', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });
        const planet2 = makePlanet({ id: 'p2' });

        seedWorkforce(agent, planet, 30, 500);
        const flightTicks = Math.ceil(1000 / passengerLiner.speed);
        const provisions = 500 * SERVICE_PER_PERSON_PER_TICK * (flightTicks + GROCERY_BUFFER_TARGET_TICKS);
        putProvisions(agent, 'p1', provisions * 2, provisions * 2);

        const ship = makePassengerShip('S1', 'p1');
        ship.state = {
            type: 'passenger_boarding',
            posterAgentId: 'a1',
            planetId: 'p1',
            to: 'p2',
            passengerGoal: 200,
            currentPassengers: 0,
            manifest: {},
        };
        agent.ships.push(ship);
        const state = makeGameState([planet, planet2], [agent]);

        shipTick(state); // boarding → passenger_provisioning
        expect(ship.state.type).toBe('passenger_provisioning');
        shipTick(state); // provisioning → passenger_transporting

        expect(ship.state.type).toBe('passenger_transporting');

        // shipTick changed the type
        const shipState = ship.state as unknown as PassengerShipStatusTransporting;
        if (shipState.type === 'passenger_transporting') {
            const keys = Object.keys(shipState.manifest);
            expect(keys.length).toBeGreaterThan(0);
            const total = Object.values(shipState.manifest).reduce((s, c) => s + c.total, 0);
            expect(total).toBeCloseTo(200, 0);
        }
    });

    it('removes boarded workers from planet summedPopulation', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });
        const planet2 = makePlanet({ id: 'p2' });

        seedWorkforce(agent, planet, 30, 300);
        const flightTicks = Math.ceil(1000 / passengerLiner.speed);
        const prov = 300 * SERVICE_PER_PERSON_PER_TICK * (flightTicks + GROCERY_BUFFER_TARGET_TICKS) * 2;
        putProvisions(agent, 'p1', prov, prov);

        const ship = makePassengerShip('S1', 'p1');
        ship.state = {
            type: 'passenger_boarding',
            posterAgentId: 'a1',
            planetId: 'p1',
            to: 'p2',
            passengerGoal: 300,
            currentPassengers: 0,
            manifest: {},
        };
        agent.ships.push(ship);
        const state = makeGameState([planet, planet2], [agent]);

        shipTick(state);

        expect(planet.population.summedPopulation.employed.none.novice.total).toBe(0);
        expect(agent.assets.p1!.workforceDemography[30].none.novice.active).toBe(0);
    });

    it('boarding succeeds even without provisions — transitions to provisioning phase', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });
        const planet2 = makePlanet({ id: 'p2' });

        seedWorkforce(agent, planet, 30, 500);
        // Provide no provisions — provisioning phase will wait
        const ship = makePassengerShip('S1', 'p1');
        ship.state = {
            type: 'passenger_boarding',
            posterAgentId: 'a1',
            planetId: 'p1',
            to: 'p2',
            passengerGoal: 500,
            currentPassengers: 0,
            manifest: {},
        };
        agent.ships.push(ship);
        const state = makeGameState([planet, planet2], [agent]);

        shipTick(state);

        // Boarding succeeded; now waiting for provisions
        expect(ship.state.type).toBe('passenger_provisioning');
        // Workers have left the planet (in manifest)
        expect(planet.population.summedPopulation.employed.none.novice.total).toBe(0);
    });

    it('refunds workers when provisioning deadline expires with insufficient provisions', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });
        const planet2 = makePlanet({ id: 'p2' });

        seedWorkforce(agent, planet, 30, 500);
        // Board workers first
        const ship = makePassengerShip('S1', 'p1');
        ship.state = {
            type: 'passenger_boarding',
            posterAgentId: 'a1',
            planetId: 'p1',
            to: 'p2',
            passengerGoal: 500,
            currentPassengers: 0,
            manifest: {},
        };
        agent.ships.push(ship);
        const state = makeGameState([planet, planet2], [agent]);

        shipTick(state); // tick 0: boarding → passenger_provisioning with deadline
        expect(ship.state.type).toBe('passenger_provisioning');

        // Advance past the deadline (no provisions provided)
        const shipState = ship.state as unknown as PassengerShipStatusProvisioning;
        if (shipState.type === 'passenger_provisioning') {
            ship.state = { ...ship.state, deadlineTick: 0 };
        }
        state.tick = 1; // past deadline
        shipTick(state);

        expect(ship.state.type).toBe('idle');
        // Workers refunded back to planet
        expect(planet.population.demography[30].employed.none.novice.total).toBe(500);
        expect(planet.population.summedPopulation.employed.none.novice.total).toBe(500);
        expect(agent.assets.p1!.workforceDemography[30].none.novice.active).toBe(500);
    });

    it('aborts boarding when no workers available and goes idle', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });
        const planet2 = makePlanet({ id: 'p2' });

        const ship = makePassengerShip('S1', 'p1');
        ship.state = {
            type: 'passenger_boarding',
            posterAgentId: 'a1',
            planetId: 'p1',
            to: 'p2',
            passengerGoal: 100,
            currentPassengers: 0,
            manifest: {},
        };
        agent.ships.push(ship);
        const state = makeGameState([planet, planet2], [agent]);

        shipTick(state);

        expect(ship.state.type).toBe('idle');
    });

    it('applies age progression to manifest at departure, not on arrival', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });
        const planet2 = makePlanet({ id: 'p2' });

        seedWorkforce(agent, planet, 30, 100);
        const flightTicks = Math.ceil(1000 / passengerLiner.speed);
        const prov = 100 * SERVICE_PER_PERSON_PER_TICK * (flightTicks + GROCERY_BUFFER_TARGET_TICKS) * 2;
        putProvisions(agent, 'p1', prov, prov);

        const ship = makePassengerShip('S1', 'p1');
        ship.state = {
            type: 'passenger_boarding',
            posterAgentId: 'a1',
            planetId: 'p1',
            to: 'p2',
            passengerGoal: 100,
            currentPassengers: 0,
            manifest: {},
        };
        agent.ships.push(ship);
        const state = makeGameState([planet, planet2], [agent]);

        shipTick(state); // boarding → passenger_provisioning
        shipTick(state); // provisioning → passenger_transporting

        // After boarding + provisioning the manifest is already age-advanced
        expect(ship.state.type).toBe('passenger_transporting');

        const shipState = ship.state as unknown as PassengerShipStatusTransporting;
        if (shipState.type === 'passenger_transporting') {
            const travelYears = flightTicks / TICKS_PER_YEAR;
            const fullYears = Math.floor(travelYears);
            // All passengers were age 30; they should now appear at age 30+fullYears or 30+fullYears+1
            const keys = Object.keys(ship.state.manifest);
            for (const key of keys) {
                const [ageStr] = key.split(':');
                const age = parseInt(ageStr!);
                expect(age).toBeGreaterThanOrEqual(30 + fullYears);
                expect(age).toBeLessThanOrEqual(30 + fullYears + 1);
            }
        }
    });

    it('deducts provisions from agent storage on boarding completion', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });
        const planet2 = makePlanet({ id: 'p2' });

        const count = 100;
        seedWorkforce(agent, planet, 30, count);
        const flightTicks = Math.ceil(1000 / passengerLiner.speed);
        const groceryRequired = count * SERVICE_PER_PERSON_PER_TICK * (flightTicks + GROCERY_BUFFER_TARGET_TICKS);
        const healthcareRequired = count * SERVICE_PER_PERSON_PER_TICK * (flightTicks + HEALTHCARE_BUFFER_TARGET_TICKS);
        // Provide exactly enough
        putProvisions(agent, 'p1', groceryRequired, healthcareRequired);

        const ship = makePassengerShip('S1', 'p1');
        ship.state = {
            type: 'passenger_boarding',
            posterAgentId: 'a1',
            planetId: 'p1',
            to: 'p2',
            passengerGoal: count,
            currentPassengers: 0,
            manifest: {},
        };
        agent.ships.push(ship);
        const state = makeGameState([planet, planet2], [agent]);

        shipTick(state); // boarding → passenger_provisioning
        shipTick(state); // provisioning → passenger_transporting

        expect(ship.state.type).toBe('passenger_transporting');
        const storage = agent.assets.p1!.storageFacility;
        const groceryLeft = storage.currentInStorage[groceryServiceResourceType.name]?.quantity ?? 0;
        const healthcareLeft = storage.currentInStorage[healthcareServiceResourceType.name]?.quantity ?? 0;
        expect(groceryLeft).toBeCloseTo(0, 3);
        expect(healthcareLeft).toBeCloseTo(0, 3);
    });
});

// ---------------------------------------------------------------------------
// shipTick — transporting → arrival
// ---------------------------------------------------------------------------

describe('shipTick passenger transporting / arrival', () => {
    it('does not unload before arrivalTick', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });
        const planet2 = makePlanet({ id: 'p2' });

        const ship = makePassengerShip('S1', 'p1');
        ship.state = {
            type: 'passenger_transporting',
            from: 'p1',
            to: 'p2',
            arrivalTick: 100,
            manifest: { '30:employed:none:novice': { ...nullPopulationCategory(), total: 50 } },
        };
        agent.ships.push(ship);
        const state = makeGameState([planet, planet2], [agent], 50);

        shipTick(state);

        expect(ship.state.type).toBe('passenger_transporting');
        expect(planet2.population.summedPopulation.employed.none.novice.total).toBe(0);
    });

    it('unloads passengers into destination planet on arrival', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });
        const planet2 = makePlanet({ id: 'p2' });

        const ship = makePassengerShip('S1', 'p1');
        ship.state = {
            type: 'passenger_transporting',
            from: 'p1',
            to: 'p2',
            arrivalTick: 100,
            manifest: {
                '30:employed:none:novice': {
                    ...nullPopulationCategory(),
                    total: 50,
                    wealth: { mean: 100, variance: 10 },
                },
            },
        };
        agent.ships.push(ship);
        const state = makeGameState([planet, planet2], [agent], 100);

        shipTick(state);

        expect(ship.state.type).toBe('idle');
        const shipState = ship.state as unknown as ShipStatusIdle;
        if (shipState.type === 'idle') {
            expect(shipState.planetId).toBe('p2');
        }
        expect(planet2.population.demography[30].employed.none.novice.total).toBe(50);
        expect(planet2.population.summedPopulation.employed.none.novice.total).toBe(50);
    });

    it('sets service buffers to max values on arrival', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });
        const planet2 = makePlanet({ id: 'p2' });

        const ship = makePassengerShip('S1', 'p1');
        ship.state = {
            type: 'passenger_transporting',
            from: 'p1',
            to: 'p2',
            arrivalTick: 10,
            manifest: {
                '30:employed:none:novice': {
                    ...nullPopulationCategory(),
                    total: 10,
                    wealth: { mean: 50, variance: 0 },
                    services: {
                        grocery: { buffer: 0, starvationLevel: 1 },
                        retail: { buffer: 0, starvationLevel: 0 },
                        logistics: { buffer: 0, starvationLevel: 0 },
                        healthcare: { buffer: 0, starvationLevel: 0 },
                        construction: { buffer: 0, starvationLevel: 0 },
                        administrative: { buffer: 0, starvationLevel: 0 },
                        education: { buffer: 0, starvationLevel: 0 },
                    },
                },
            },
        };
        agent.ships.push(ship);
        const state = makeGameState([planet, planet2], [agent], 10);

        shipTick(state);

        const cell = planet2.population.demography[30].employed.none.novice;
        expect(cell.services.grocery.buffer).toBe(GROCERY_BUFFER_TARGET_TICKS);
        expect(cell.services.grocery.starvationLevel).toBe(0);
        expect(cell.services.healthcare.buffer).toBe(HEALTHCARE_BUFFER_TARGET_TICKS);
    });

    it('goes idle on source planet when destination is gone', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });

        const ship = makePassengerShip('S1', 'p1');
        ship.state = {
            type: 'passenger_transporting',
            from: 'p1',
            to: 'p2',
            arrivalTick: 10,
            manifest: { '30:employed:none:novice': { ...nullPopulationCategory(), total: 5 } },
        };
        agent.ships.push(ship);
        // No p2 in gameState
        const state = makeGameState([planet], [agent], 10);

        shipTick(state);

        expect(ship.state.type).toBe('idle');
        const shipState = ship.state as unknown as ShipStatusIdle;
        if (shipState.type === 'idle') {
            expect(shipState.planetId).toBe('p1');
        }
    });
});
