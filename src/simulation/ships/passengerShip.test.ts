import { beforeEach, describe, expect, it } from 'vitest';
import { seedRng } from '../utils/stochasticRound';
import { TICKS_PER_YEAR } from '../constants';
import { SERVICE_DEFINITIONS } from '../market/serviceDefinitions';

const groceryDef = SERVICE_DEFINITIONS.grocery;
const healthcareDef = SERVICE_DEFINITIONS.healthcare;
const educationDef = SERVICE_DEFINITIONS.education;
import { putIntoStorageFacility } from '../planet/facility';
import type { Agent, GameState, Planet } from '../planet/planet';
import { groceryServiceResourceType, healthcareServiceResourceType } from '../planet/services';
import { nullPopulationCategory } from '../population/population';
import { makeAgent, makeAgentPlanetAssets, makeGameState, makePlanet } from '../utils/testHelper';
import type { OutboundMessage, PendingAction } from '../workerClient/messages';
import { handleDispatchPassengerShip } from '../workerClient/shipContractActions';
import {
    boardPassengersFromWorkforce,
    calculateProvisions,
    refundBoardedPassengers,
    unloadPassengersToWorkforce,
    advanceManifestAge,
    manifestKey,
    type PassengerManifest,
} from './manifest';
import type {
    PassengerShip,
    PassengerShipStatusProvisioning,
    PassengerShipStatusTransporting,
    ShipStatusIdle,
} from './ships';
import { passengerLiner, shipTick } from './ships';

function makePassengerShip(name: string, planetId: string, capacity = 50_000): PassengerShip {
    return {
        id: 'ship-1',
        name,
        builtAtTick: 0,
        maintainanceStatus: 1,
        maxMaintenance: 1,
        cumulativeRepairAcc: 0,
        type: { ...passengerLiner, passengerCapacity: capacity },
        state: { type: 'idle', planetId },
    };
}

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
        grocery: { buffer: groceryDef.bufferTargetTicks, starvationLevel: 0 },
        retail: { buffer: 10, starvationLevel: 0 },
        logistics: { buffer: 4, starvationLevel: 0 },
        healthcare: { buffer: healthcareDef.bufferTargetTicks, starvationLevel: 0 },
        construction: { buffer: 2, starvationLevel: 0 },
        maintenance: { buffer: 2, starvationLevel: 0 },
        administration: { buffer: 3, starvationLevel: 0 },
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
            'agentId' | 'fromPlanetId' | 'toPlanetId' | 'shipId'
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

describe('handleDispatchPassengerShip validation', () => {
    let messages: OutboundMessage[];
    let post: (m: OutboundMessage) => void;

    beforeEach(() => {
        ({ messages, post } = makeMessages());
    });

    it('fails when agent not found', () => {
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], []);
        dispatch(state, { agentId: 'missing', fromPlanetId: 'p1', toPlanetId: 'p2', shipId: 'ship-1' }, post);
        expect(messages[0]).toMatchObject({ type: 'passengerShipDispatchFailed', reason: 'Agent not found' });
    });

    it('fails when source planet not found', () => {
        const agent = makeAgent('a1', 'p2');
        const state = makeGameState([makePlanet({ id: 'p2' })], [agent]);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipId: 'ship-1' }, post);
        expect(messages[0]).toMatchObject({ type: 'passengerShipDispatchFailed' });
    });

    it('fails when destination planet not found', () => {
        const agent = makeAgent('a1', 'p1');
        const state = makeGameState([makePlanet({ id: 'p1' })], [agent]);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipId: 'ship-1' }, post);
        expect(messages[0]).toMatchObject({ type: 'passengerShipDispatchFailed' });
    });

    it('fails when ship not found', () => {
        const agent = makeAgent('a1', 'p1');
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipId: 'ghost-id' }, post);
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
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipId: ship.id }, post);
        expect(messages[0]).toMatchObject({ type: 'passengerShipDispatchFailed', reason: 'Ship is not idle' });
    });

    it('fails when ship is not on source planet', () => {
        const agent = makeAgent('a1', 'p1');
        const ship = makePassengerShip('S1', 'p3');
        agent.ships.push(ship);
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipId: ship.id }, post);
        expect(messages[0]).toMatchObject({ type: 'passengerShipDispatchFailed' });
    });

    it('fails when ship is not a passenger ship', () => {
        const { messages: msgs, post: p } = makeMessages();
        const agent = makeAgent('a1', 'p1');

        const ship = {
            id: 'ship-t1',
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
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipId: ship.id }, p);
        expect(msgs[0]).toMatchObject({ type: 'passengerShipDispatchFailed' });
    });

    it('fails when destination planet has no commercial license', () => {
        const agent = makeAgent('a1', 'p1');
        agent.assets.p2 = makeAgentPlanetAssets('p2');
        delete agent.assets.p2!.licenses.commercial;
        const ship = makePassengerShip('S1', 'p1');
        agent.ships.push(ship);
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipId: ship.id }, post);
        expect(messages[0]).toMatchObject({
            type: 'passengerShipDispatchFailed',
            reason: 'No commercial license on destination planet',
        });
    });

    it('fails when destination planet has no commercial license', () => {
        const agent = makeAgent('a1', 'p1');
        agent.assets.p2 = makeAgentPlanetAssets('p2');
        delete agent.assets.p2!.licenses.commercial;
        const ship = makePassengerShip('S1', 'p1');
        agent.ships.push(ship);
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        dispatch(state, { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipId: ship.id }, post);
        expect(messages[0]).toMatchObject({
            type: 'passengerShipDispatchFailed',
            reason: 'No commercial license on destination planet',
        });
    });

    it('allows dispatch when passenger count is 0', () => {
        const agent = makeAgent('a1', 'p1');
        agent.assets.p2 = makeAgentPlanetAssets('p2');
        const ship = makePassengerShip('S1', 'p1');
        agent.ships.push(ship);
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        dispatch(
            state,
            { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipId: ship.id, passengerCount: 0 },
            post,
        );
        expect(messages[0]).toMatchObject({ type: 'passengerShipDispatched', shipId: ship.id });
        expect(ship.state.type).toBe('passenger_boarding');
        if (ship.state.type === 'passenger_boarding') {
            expect(ship.state.passengerGoal).toBe(0);
            expect(ship.state.currentPassengers).toBe(0);
        }
    });

    it('succeeds and sets ship to passenger_boarding', () => {
        const agent = makeAgent('a1', 'p1');
        agent.assets.p2 = makeAgentPlanetAssets('p2');
        const ship = makePassengerShip('S1', 'p1', 50_000);
        agent.ships.push(ship);
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        dispatch(
            state,
            { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipId: ship.id, passengerCount: 200 },
            post,
        );
        expect(messages[0]).toMatchObject({ type: 'passengerShipDispatched', shipId: ship.id });
        expect(ship.state.type).toBe('passenger_boarding');
        if (ship.state.type === 'passenger_boarding') {
            expect(ship.state.passengerGoal).toBe(200);
            expect(ship.state.to).toBe('p2');
            expect(ship.state.manifest).toEqual({});
        }
    });

    it('caps passengerGoal at ship capacity', () => {
        const agent = makeAgent('a1', 'p1');
        agent.assets.p2 = makeAgentPlanetAssets('p2');
        const ship = makePassengerShip('S1', 'p1', 50);
        agent.ships.push(ship);
        const state = makeGameState([makePlanet({ id: 'p1' }), makePlanet({ id: 'p2' })], [agent]);
        dispatch(
            state,
            { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipId: ship.id, passengerCount: 999_999 },
            post,
        );
        expect(messages[0]).toMatchObject({ type: 'passengerShipDispatched' });
        if (ship.state.type === 'passenger_boarding') {
            expect(ship.state.passengerGoal).toBe(50);
        }
    });
});

describe('shipTick passenger boarding', () => {
    it('boards workers from agent workforce into the manifest', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });
        const planet2 = makePlanet({ id: 'p2' });

        seedWorkforce(agent, planet, 30, 500);
        const flightTicks = Math.ceil(1000 / passengerLiner.speed);
        const provisions =
            500 * groceryDef.consumptionRatePerPersonPerTick * (flightTicks + groceryDef.bufferTargetTicks);
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

        shipTick(state);
        expect(ship.state.type).toBe('passenger_provisioning');
        shipTick(state);

        expect(ship.state.type).toBe('passenger_transporting');

        const shipState = ship.state as unknown as PassengerShipStatusTransporting;
        if (shipState.type === 'passenger_transporting') {
            const keys = Object.keys(shipState.manifest);
            expect(keys.length).toBeGreaterThan(0);
            const total = Object.values(shipState.manifest).reduce((s, c) => s + c.total, 0);

            expect(total).toBeCloseTo(200, -1);
        }
    });

    it('removes boarded workers from planet summedPopulation', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });
        const planet2 = makePlanet({ id: 'p2' });

        seedWorkforce(agent, planet, 30, 300);
        const flightTicks = Math.ceil(1000 / passengerLiner.speed);
        const prov =
            300 * groceryDef.consumptionRatePerPersonPerTick * (flightTicks + groceryDef.bufferTargetTicks) * 2;
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

        expect(ship.state.type).toBe('passenger_provisioning');

        expect(planet.population.summedPopulation.employed.none.novice.total).toBe(0);
    });

    it('zero-passenger dispatch progresses without storage', () => {
        const { messages, post } = makeMessages();
        const agent = makeAgent('a1', 'p1');
        agent.assets.p2 = makeAgentPlanetAssets('p2');
        const planet = makePlanet({ id: 'p1' });
        const planet2 = makePlanet({ id: 'p2' });

        const ship = makePassengerShip('S1', 'p1');
        agent.ships.push(ship);
        const state = makeGameState([planet, planet2], [agent]);

        const assetsByPlanet = agent.assets as Record<string, (typeof agent.assets)[string] | undefined>;
        assetsByPlanet.p1 = undefined;

        dispatch(
            state,
            { agentId: 'a1', fromPlanetId: 'p1', toPlanetId: 'p2', shipId: ship.id, passengerCount: 0 },
            post,
        );
        expect(messages[0]).toMatchObject({ type: 'passengerShipDispatched', shipId: ship.id });

        shipTick(state);
        expect(ship.state.type).toBe('passenger_provisioning');

        shipTick(state);
        expect(ship.state.type).toBe('passenger_transporting');
        if (ship.state.type === 'passenger_transporting') {
            expect(ship.state.manifest).toEqual({});
            expect(ship.state.to).toBe('p2');
        }
    });

    it('refunds workers when provisioning deadline expires with insufficient provisions', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });
        const planet2 = makePlanet({ id: 'p2' });

        seedWorkforce(agent, planet, 30, 500);

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
        expect(ship.state.type).toBe('passenger_provisioning');

        const shipState = ship.state as unknown as PassengerShipStatusProvisioning;
        if (shipState.type === 'passenger_provisioning') {
            ship.state = { ...ship.state, deadlineTick: 0 };
        }
        state.tick = 1;
        shipTick(state);

        expect(ship.state.type).toBe('idle');

        expect(planet.population.demography[30].employed.none.novice.total).toBe(500);
        expect(planet.population.summedPopulation.employed.none.novice.total).toBe(500);
        expect(agent.assets.p1!.workforceDemography[30].none.novice.active).toBe(500);
    });

    it('stays in boarding when no workers are available (waits for workers)', () => {
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

        expect(ship.state.type).toBe('passenger_boarding');
    });

    it('applies age progression to manifest at departure, not on arrival', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });
        const planet2 = makePlanet({ id: 'p2' });

        const count = 10_000;
        seedWorkforce(agent, planet, 30, count);
        const flightTicks = Math.ceil(1000 / passengerLiner.speed);
        const prov =
            count * groceryDef.consumptionRatePerPersonPerTick * (flightTicks + groceryDef.bufferTargetTicks) * 2;
        putProvisions(agent, 'p1', prov, prov);

        const ship = makePassengerShip('S1', 'p1', 50_000);
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

        shipTick(state);
        shipTick(state);

        expect(ship.state.type).toBe('passenger_transporting');

        const shipState = ship.state as unknown as PassengerShipStatusTransporting;
        if (shipState.type === 'passenger_transporting') {
            const departureTick = 0;
            const yearBoundariesCrossed =
                Math.floor((departureTick + flightTicks) / TICKS_PER_YEAR) - Math.floor(departureTick / TICKS_PER_YEAR);

            const keys = Object.keys(ship.state.manifest);
            for (const key of keys) {
                const [ageStr] = key.split(':');
                const age = parseInt(ageStr!);
                expect(age).toBe(30 + yearBoundariesCrossed);
            }

            const shipState = ship.state as unknown as PassengerShipStatusTransporting;
            const totalPassengers = keys.reduce((sum, k) => sum + shipState.manifest[k]!.total, 0);
            expect(totalPassengers).toBeLessThan(count);
        }
    });

    it('deducts provisions from agent storage on boarding completion', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });
        const planet2 = makePlanet({ id: 'p2' });

        const count = 100;
        seedWorkforce(agent, planet, 30, count);

        const maxFlightTicks = Math.ceil((1.1 * 1000) / passengerLiner.speed);
        const groceryProvided =
            count * groceryDef.consumptionRatePerPersonPerTick * (maxFlightTicks + groceryDef.bufferTargetTicks);
        const healthcareProvided =
            count * healthcareDef.consumptionRatePerPersonPerTick * (maxFlightTicks + healthcareDef.bufferTargetTicks);

        putProvisions(agent, 'p1', groceryProvided, healthcareProvided);

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

        shipTick(state);
        shipTick(state);

        expect(ship.state.type).toBe('passenger_transporting');
        const storage = agent.assets.p1!.storageFacility;
        const groceryLeft = storage.currentInStorage[groceryServiceResourceType.name]?.quantity ?? 0;
        const healthcareLeft = storage.currentInStorage[healthcareServiceResourceType.name]?.quantity ?? 0;

        const maxJitterTicks = maxFlightTicks - Math.ceil((0.9 * 1000) / passengerLiner.speed);
        expect(groceryLeft).toBeLessThanOrEqual(
            count * groceryDef.consumptionRatePerPersonPerTick * (maxJitterTicks + 1),
        );
        expect(healthcareLeft).toBeLessThanOrEqual(
            count * healthcareDef.consumptionRatePerPersonPerTick * (maxJitterTicks + 1),
        );
        expect(groceryLeft).toBeGreaterThanOrEqual(0);
        expect(healthcareLeft).toBeGreaterThanOrEqual(0);
    });
});

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
                        maintenance: { buffer: 0, starvationLevel: 0 },
                        construction: { buffer: 0, starvationLevel: 0 },
                        administration: { buffer: 0, starvationLevel: 0 },
                        education: { buffer: 0, starvationLevel: 0 },
                    },
                },
            },
        };
        agent.ships.push(ship);
        const state = makeGameState([planet, planet2], [agent], 10);

        shipTick(state);

        const cell = planet2.population.demography[30].employed.none.novice;
        expect(cell.services.grocery.buffer).toBe(groceryDef.bufferTargetTicks);
        expect(cell.services.grocery.starvationLevel).toBe(0);
        expect(cell.services.healthcare.buffer).toBe(healthcareDef.bufferTargetTicks);
    });

    it('throws when destination planet is missing at arrival', () => {
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

        const state = makeGameState([planet], [agent], 10);

        expect(() => shipTick(state)).toThrow(/Destination planet 'p2' is missing at passenger arrival/);
    });
});

describe('boardPassengersFromWorkforce', () => {
    it('removes workers from agent workforce and planet demography, adds to manifest', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });
        seedWorkforce(agent, planet, 35, 200);

        const manifest: Record<string, ReturnType<typeof nullPopulationCategory>> = {};
        const boarded = boardPassengersFromWorkforce(agent, planet, 'p1', manifest, 100);

        expect(boarded).toBe(100);

        expect(agent.assets.p1!.workforceDemography[35].none.novice.active).toBe(100);

        expect(planet.population.demography[35].employed.none.novice.total).toBe(100);
        expect(planet.population.summedPopulation.employed.none.novice.total).toBe(100);

        const keys = Object.keys(manifest);
        expect(keys.length).toBeGreaterThan(0);
        const total = Object.values(manifest).reduce((s, c) => s + c.total, 0);
        expect(total).toBeCloseTo(100, 0);
    });

    it('returns 0 when agent has no assets for the planet', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p2' });
        const manifest: Record<string, ReturnType<typeof nullPopulationCategory>> = {};
        const boarded = boardPassengersFromWorkforce(agent, planet, 'p2', manifest, 100);
        expect(boarded).toBe(0);
    });
});

describe('refundBoardedPassengers', () => {
    it('restores workers to agent workforce and planet demography', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });
        seedWorkforce(agent, planet, 40, 300);

        const manifest: Record<string, ReturnType<typeof nullPopulationCategory>> = {};
        boardPassengersFromWorkforce(agent, planet, 'p1', manifest, 300);

        expect(agent.assets.p1!.workforceDemography[40].none.novice.active).toBe(0);

        refundBoardedPassengers(agent, planet, 'p1', manifest);

        expect(agent.assets.p1!.workforceDemography[40].none.novice.active).toBe(300);
        expect(planet.population.demography[40].employed.none.novice.total).toBe(300);
        expect(planet.population.summedPopulation.employed.none.novice.total).toBe(300);

        expect(Object.keys(manifest)).toHaveLength(0);
    });
});

describe('calculateProvisions', () => {
    it('computes correct grocery and healthcare goals for a manifest', () => {
        const manifest = {
            '30:employed:none:novice': { ...nullPopulationCategory(), total: 100 },
        };
        const flightTicks = 50;
        const provisions = calculateProvisions(manifest, flightTicks);

        const expectedGrocery =
            100 * groceryDef.consumptionRatePerPersonPerTick * (flightTicks + groceryDef.bufferTargetTicks);
        const expectedHealthcare =
            100 * healthcareDef.consumptionRatePerPersonPerTick * (flightTicks + healthcareDef.bufferTargetTicks);

        expect(provisions.groceryProvisioned.goal).toBeCloseTo(expectedGrocery, 5);
        expect(provisions.healthcareProvisioned.goal).toBeCloseTo(expectedHealthcare, 5);

        expect(provisions.educationProvisioned.goal).toBe(0);
    });

    it('includes education provision for education-occupation passengers', () => {
        const manifest = {
            '25:education:primary:novice': { ...nullPopulationCategory(), total: 50 },
        };
        const flightTicks = 30;
        const provisions = calculateProvisions(manifest, flightTicks);

        const expectedEducation =
            50 * educationDef.consumptionRatePerPersonPerTick * (flightTicks + educationDef.bufferTargetTicks);
        expect(provisions.educationProvisioned.goal).toBeCloseTo(expectedEducation, 5);
    });

    it('returns zero goals for an empty manifest', () => {
        const provisions = calculateProvisions({}, 100);
        expect(provisions.groceryProvisioned.goal).toBe(0);
        expect(provisions.healthcareProvisioned.goal).toBe(0);
        expect(provisions.educationProvisioned.goal).toBe(0);
    });
});

describe('advanceManifestAge disability phase', () => {
    it('moves some passengers to unableToWork over a long flight', () => {
        const flightTicks = TICKS_PER_YEAR * 10;
        const manifest = {
            '50:employed:none:novice': {
                ...nullPopulationCategory(),
                total: 10_000,
                wealth: { mean: 100, variance: 0 },
            },
        };

        const advanced = advanceManifestAge(manifest, 0, flightTicks);

        const unableKeys = Object.keys(advanced).filter((k) => k.includes(':unableToWork:'));
        expect(unableKeys.length).toBeGreaterThan(0);
        const unableTotal = unableKeys.reduce((s, k) => s + advanced[k]!.total, 0);
        expect(unableTotal).toBeGreaterThan(0);
    });
});

describe('unloadPassengersToWorkforce', () => {
    it('adds employed manifest entries to agent workforce and planet demography', () => {
        const agent = makeAgent('a1', 'p2');
        agent.assets.p2 = agent.assets.p2 ?? { ...agent.assets[agent.associatedPlanetId]! };
        const planet = makePlanet({ id: 'p2' });

        const manifest = {
            '30:employed:none:novice': {
                ...nullPopulationCategory(),
                total: 75,
                wealth: { mean: 200, variance: 5 },
            },
        };

        unloadPassengersToWorkforce(agent, planet, 'p2', manifest);

        expect(planet.population.demography[30].employed.none.novice.total).toBe(75);
        expect(planet.population.summedPopulation.employed.none.novice.total).toBe(75);
        expect(agent.assets.p2!.workforceDemography[30].none.novice.active).toBe(75);
    });

    it('does not add unableToWork passengers to workforce', () => {
        const agent = makeAgent('a1', 'p2');
        agent.assets.p2 = agent.assets.p2 ?? agent.assets[agent.associatedPlanetId]!;
        const planet = makePlanet({ id: 'p2' });

        const manifest = {
            '30:unableToWork:none:novice': {
                ...nullPopulationCategory(),
                total: 20,
                wealth: { mean: 50, variance: 0 },
            },
        };

        unloadPassengersToWorkforce(agent, planet, 'p2', manifest);

        expect(planet.population.demography[30].unableToWork.none.novice.total).toBe(20);

        expect(agent.assets.p2!.workforceDemography[30].none.novice.active).toBe(0);
    });
});

describe('boardPassengersFromWorkforce wealth snapshot', () => {
    it('boarded passengers inherit correct wealth when the cohort is fully exhausted', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });
        const originalWealth = { mean: 250, variance: 20 };
        seedWorkforce(agent, planet, 35, 100, originalWealth);

        const manifest: Record<string, ReturnType<typeof nullPopulationCategory>> = {};

        boardPassengersFromWorkforce(agent, planet, 'p1', manifest, 100);

        const keys = Object.keys(manifest);
        expect(keys.length).toBeGreaterThan(0);
        for (const key of keys) {
            expect(manifest[key]!.wealth.mean).toBeCloseTo(originalWealth.mean, 5);
        }
    });

    it('planet demography wealth zeroes out but manifest wealth is unaffected', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });
        seedWorkforce(agent, planet, 40, 50, { mean: 500, variance: 0 });

        const manifest: Record<string, ReturnType<typeof nullPopulationCategory>> = {};
        boardPassengersFromWorkforce(agent, planet, 'p1', manifest, 50);

        expect(planet.population.demography[40].employed.none.novice.total).toBe(0);
        expect(planet.population.demography[40].employed.none.novice.wealth.mean).toBe(0);

        const total = Object.values(manifest).reduce((s, c) => s + c.total, 0);
        expect(total).toBe(50);
        const manifestMean = Object.values(manifest).find((c) => c.total > 0)?.wealth.mean ?? 0;
        expect(manifestMean).toBeCloseTo(500, 5);
    });
});

describe('advanceManifestAge orphaned wealth redistribution', () => {
    it('redistributes to the largest surviving cohort deterministically', () => {
        const flightTicks = TICKS_PER_YEAR * 5;
        const manifest = {
            '90:employed:none:novice': {
                ...nullPopulationCategory(),
                total: 10,
                wealth: { mean: 1000, variance: 0 },
            },
            '20:employed:none:novice': {
                ...nullPopulationCategory(),
                total: 10_000,
                wealth: { mean: 100, variance: 0 },
            },
        };

        seedRng(42);
        const result1 = advanceManifestAge(structuredClone(manifest), 0, flightTicks);
        seedRng(42);
        const result2 = advanceManifestAge(structuredClone(manifest), 0, flightTicks);

        const keys = new Set([...Object.keys(result1), ...Object.keys(result2)]);
        for (const k of keys) {
            expect(result1[k]?.total ?? 0).toBe(result2[k]?.total ?? 0);
            expect(result1[k]?.wealth.mean ?? 0).toBeCloseTo(result2[k]?.wealth.mean ?? 0, 6);
        }
    });

    it('always assigns orphaned wealth to the highest-total survivor', () => {
        const flightTicks = TICKS_PER_YEAR * 5;
        const manifest = {
            '90:employed:none:novice': {
                ...nullPopulationCategory(),
                total: 10,
                wealth: { mean: 10_000, variance: 0 },
            },
            '20:employed:none:novice': {
                ...nullPopulationCategory(),
                total: 5_000,
                wealth: { mean: 1, variance: 0 },
            },
            '21:employed:none:novice': {
                ...nullPopulationCategory(),
                total: 100,
                wealth: { mean: 1, variance: 0 },
            },
        };

        seedRng(99);
        const result = advanceManifestAge(structuredClone(manifest), 0, flightTicks);

        seedRng(99);
        const result2 = advanceManifestAge(structuredClone(manifest), 0, flightTicks);
        const allKeys = new Set([...Object.keys(result), ...Object.keys(result2)]);
        for (const k of allKeys) {
            expect(result[k]?.wealth.mean ?? 0).toBeCloseTo(result2[k]?.wealth.mean ?? 0, 6);
        }
    });
});

describe('advanceManifestAge integer population invariant', () => {
    it('all category totals remain integers after mortality and disability', () => {
        const manifest: PassengerManifest = {};

        for (const age of [20, 35, 50, 65, 80]) {
            const key = manifestKey(age, 'employed', 'none', 'novice');
            manifest[key] = {
                ...nullPopulationCategory(),
                total: 1000,
                wealth: { mean: 100, variance: 10 },
            };
        }

        const flightTicks = TICKS_PER_YEAR;
        const result = advanceManifestAge(manifest, 0, flightTicks);
        for (const [key, category] of Object.entries(result)) {
            expect(Number.isInteger(category.total), `${key}.total = ${category.total} is not an integer`).toBe(true);
        }
    });
});

describe('shipTick passenger_boarding deadline — refunds agent workforce', () => {
    it('restores agent workforceDemography when boarding deadline expires with partial manifest', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });
        const planet2 = makePlanet({ id: 'p2' });

        seedWorkforce(agent, planet, 30, 200);

        const ship = makePassengerShip('S1', 'p1');
        ship.state = {
            type: 'passenger_boarding',
            posterAgentId: 'a1',
            planetId: 'p1',
            to: 'p2',
            passengerGoal: 500,
            currentPassengers: 0,
            manifest: {},
            deadlineTick: 0,
        };
        agent.ships.push(ship);

        const manifest = ship.state.manifest as Record<string, ReturnType<typeof nullPopulationCategory>>;
        boardPassengersFromWorkforce(agent, planet, 'p1', manifest, 200);
        ship.state = { ...ship.state, currentPassengers: 200 };

        const state = makeGameState([planet, planet2], [agent], 1);
        shipTick(state);

        expect(ship.state.type).toBe('idle');

        expect(planet.population.demography[30].employed.none.novice.total).toBe(200);
        expect(planet.population.summedPopulation.employed.none.novice.total).toBe(200);

        expect(agent.assets.p1!.workforceDemography[30].none.novice.active).toBe(200);
    });

    it('boarding deadline without posterAgentId restores carrier agent workforce', () => {
        const agent = makeAgent('a1', 'p1');
        const planet = makePlanet({ id: 'p1' });
        const planet2 = makePlanet({ id: 'p2' });

        seedWorkforce(agent, planet, 25, 100);

        const ship = makePassengerShip('S1', 'p1');
        ship.state = {
            type: 'passenger_boarding',
            planetId: 'p1',
            to: 'p2',
            passengerGoal: 300,
            currentPassengers: 0,
            manifest: {},
            deadlineTick: 0,
        };
        agent.ships.push(ship);

        const manifest = ship.state.manifest as Record<string, ReturnType<typeof nullPopulationCategory>>;
        boardPassengersFromWorkforce(agent, planet, 'p1', manifest, 100);
        ship.state = { ...ship.state, currentPassengers: 100 };

        const state = makeGameState([planet, planet2], [agent], 1);
        shipTick(state);

        expect(ship.state.type).toBe('idle');
        expect(agent.assets.p1!.workforceDemography[25].none.novice.active).toBe(100);
    });
});
