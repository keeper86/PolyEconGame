import { describe, it, expect } from 'vitest';
import { checkMonetaryConservation, checkTransportPipeline, checkWealthBankConsistency } from './invariants';
import { advanceTick, seedRng } from './engine';
import { putIntoStorageFacility } from './planet/facility';
import {
    makeAgent,
    makeAgentPlanetAssets,
    makeGameState,
    makePlanet,
    makeProductionFacility,
    makeWorld,
} from './utils/testHelper';
import { agriculturalProductResourceType, steelResourceType } from './planet/resources';
import { createShip, shipTick, shiptypes } from './ships/ships';
import type { TransportShip, TransportShipStatusTransporting } from './ships/ships';

describe('checkMonetaryConservation', () => {
    it('reports no violation when all balances are zero', () => {
        const { gameState } = makeWorld({
            populationByEdu: { none: 100, primary: 0, secondary: 0, tertiary: 0 },
            companyIds: [],
        });

        const discrepancies = checkMonetaryConservation(gameState.agents, gameState.planets);
        expect(discrepancies).toEqual([]);
    });

    it('holds after a single tick with wages and no food market', () => {
        seedRng(42);

        const { gameState, planet, agents } = makeWorld({
            populationByEdu: { none: 500, primary: 300, secondary: 100, tertiary: 50 },
            companyIds: ['company-1'],
        });

        const gov = agents[0];
        gov.assets[planet.id].productionFacilities.push(
            makeProductionFacility({ none: 100, primary: 50, secondary: 20, tertiary: 5 }, { planetId: planet.id }),
        );

        putIntoStorageFacility(gov.assets[planet.id].storageFacility, agriculturalProductResourceType, 1e9);

        gameState.tick = 1;
        advanceTick(gameState);

        const discrepancies = checkMonetaryConservation(gameState.agents, gameState.planets, 0.02);
        expect(discrepancies).toEqual([]);
    });

    it('holds over 30 ticks (1 month) with full economic activity', () => {
        seedRng(42);

        const { gameState, planet, agents } = makeWorld({
            populationByEdu: { none: 2000, primary: 1000, secondary: 500, tertiary: 200 },
            companyIds: ['company-1'],
        });

        const gov = agents[0];
        gov.assets[planet.id].productionFacilities.push(
            makeProductionFacility({ none: 500, primary: 200, secondary: 50, tertiary: 20 }, { planetId: planet.id }),
        );

        putIntoStorageFacility(gov.assets[planet.id].storageFacility, agriculturalProductResourceType, 1e9);

        for (let t = 1; t <= 30; t++) {
            gameState.tick = t;
            advanceTick(gameState);
        }

        const discrepancies = checkMonetaryConservation(gameState.agents, gameState.planets, 0.02);
        expect(discrepancies).toEqual([]);
    });
});

describe(
    'checkWealthBankConsistency',
    () => {
        it('holds at zero state', () => {
            const { gameState } = makeWorld({
                populationByEdu: { none: 100, primary: 0, secondary: 0, tertiary: 0 },
                companyIds: [],
            });

            const discrepancies = checkWealthBankConsistency(gameState.planets);
            expect(discrepancies).toEqual([]);
        });

        it('holds after ticks with a single agent', () => {
            seedRng(42);

            const { gameState, planet, agents } = makeWorld({
                populationByEdu: { none: 500, primary: 300, secondary: 100, tertiary: 50 },
                companyIds: ['company-1'],
            });

            const gov = agents[0];
            gov.assets[planet.id].productionFacilities.push(
                makeProductionFacility({ none: 100, primary: 50, secondary: 20, tertiary: 5 }, { planetId: planet.id }),
            );

            putIntoStorageFacility(gov.assets[planet.id].storageFacility, agriculturalProductResourceType, 1e9);

            for (let t = 1; t <= 30; t++) {
                gameState.tick = t;
                advanceTick(gameState);
            }

            const discrepancies = checkWealthBankConsistency(gameState.planets, 10);
            expect(discrepancies).toEqual([]);
        });

        it('holds with MULTIPLE agents on the same planet (regression: multi-agent wage over-credit)', () => {
            seedRng(42);

            const { gameState, planet, agents } = makeWorld({
                populationByEdu: { none: 2000, primary: 1000, secondary: 500, tertiary: 200 },
                companyIds: ['company-1', 'company-2', 'company-3'],
            });

            for (const agent of agents) {
                const assets = agent.assets[planet.id];
                if (!assets) {
                    continue;
                }
                assets.productionFacilities.push(
                    makeProductionFacility(
                        { none: 100, primary: 50, secondary: 20, tertiary: 5 },
                        { planetId: planet.id },
                    ),
                );
                putIntoStorageFacility(assets.storageFacility, agriculturalProductResourceType, 1e9);
            }

            for (let t = 1; t <= 60; t++) {
                gameState.tick = t;
                advanceTick(gameState);
            }

            const discrepancies = checkWealthBankConsistency(gameState.planets, 50);
            expect(discrepancies).toEqual([]);
        });

        it('holds after food market activity (regression: uncapped wealth reduction)', () => {
            seedRng(42);

            const { gameState, planet, agents } = makeWorld({
                populationByEdu: { none: 1000, primary: 500, secondary: 200, tertiary: 100 },
                companyIds: ['company-1'],
            });

            const gov = agents[0];
            gov.assets[planet.id].productionFacilities.push(
                makeProductionFacility(
                    { none: 200, primary: 100, secondary: 50, tertiary: 10 },
                    { planetId: planet.id },
                ),
            );

            putIntoStorageFacility(gov.assets[planet.id].storageFacility, agriculturalProductResourceType, 1e6);

            for (let t = 1; t <= 90; t++) {
                gameState.tick = t;
                advanceTick(gameState);
            }

            const monetaryDisc = checkMonetaryConservation(gameState.agents, gameState.planets, 0.02);
            expect(monetaryDisc).toEqual([]);
            const wealthDisc = checkWealthBankConsistency(gameState.planets, 100);
            expect(wealthDisc).toEqual([]);
        });

        it('holds across the first year boundary (>360 ticks) — regression: inheritance orphaning', () => {
            seedRng(42);

            const { gameState, planet, agents } = makeWorld({
                populationByEdu: { none: 2000, primary: 1000, secondary: 500, tertiary: 200 },
                companyIds: ['company-1'],
            });

            const gov = agents[0];
            gov.assets[planet.id].productionFacilities.push(
                makeProductionFacility(
                    { none: 500, primary: 200, secondary: 50, tertiary: 20 },
                    { planetId: planet.id },
                ),
            );

            putIntoStorageFacility(gov.assets[planet.id].storageFacility, agriculturalProductResourceType, 1e9);

            for (let t = 1; t <= 400; t++) {
                gameState.tick = t;
                advanceTick(gameState);
            }

            const wealthDisc = checkWealthBankConsistency(gameState.planets, 100);
            expect(wealthDisc).toEqual([]);
            const monetaryDisc = checkMonetaryConservation(gameState.agents, gameState.planets, 0.02);
            expect(monetaryDisc).toEqual([]);
        });
    },
    { timeout: 10000 },
);

describe('checkTransportPipeline', () => {
    it('holds with no ships in transit', () => {
        const { gameState } = makeWorld({ populationByEdu: { none: 10 }, companyIds: [] });
        expect(checkTransportPipeline(gameState)).toEqual([]);
    });

    it('holds when pipeline matches a transporting ship', () => {
        const pOrigin = makePlanet({ id: 'p1', name: 'Origin' });
        const pDest = makePlanet({ id: 'p2', name: 'Dest' });
        const agent = makeAgent('agent-1', 'p1');
        const gameState = makeGameState([pOrigin, pDest], [agent]);

        const ship = createShip(shiptypes.solid.bulkCarrier1, 0, 'Test Ship', pOrigin) as TransportShip;
        ship.state = {
            type: 'transporting',
            from: 'p1',
            to: 'p2',
            cargo: { resource: steelResourceType, quantity: 500 },
            arrivalTick: 100,
        };
        agent.ships.push(ship);

        pDest.transportPipeline[steelResourceType.name] = { resource: steelResourceType, quantity: 500 };

        expect(checkTransportPipeline(gameState)).toEqual([]);
    });

    it('detects a missing pipeline entry (regression: stale pipeline)', () => {
        const pOrigin = makePlanet({ id: 'p1', name: 'Origin' });
        const pDest = makePlanet({ id: 'p2', name: 'Dest' });
        const agent = makeAgent('agent-1', 'p1');
        const gameState = makeGameState([pOrigin, pDest], [agent]);

        const ship = createShip(shiptypes.solid.bulkCarrier1, 0, 'Test Ship', pOrigin) as TransportShip;
        ship.state = {
            type: 'transporting',
            from: 'p1',
            to: 'p2',
            cargo: { resource: steelResourceType, quantity: 500 },
            arrivalTick: 100,
        };
        agent.ships.push(ship);

        const discrepancies = checkTransportPipeline(gameState);
        expect(discrepancies.length).toBeGreaterThan(0);
        expect(discrepancies[0]).toContain('p2');
        expect(discrepancies[0]).toContain(steelResourceType.name);
    });

    it('adds pipeline entry on loading→transporting and removes on transporting→unloading via shipTick', () => {
        const pOrigin = makePlanet({ id: 'p1', name: 'Origin' });
        const pDest = makePlanet({ id: 'p2', name: 'Dest' });
        const agent = makeAgent('agent-1', 'p1', 'Agent 1', {
            assets: {
                p1: makeAgentPlanetAssets('p1'),
                p2: makeAgentPlanetAssets('p2'),
            },
        });
        const gameState = makeGameState([pOrigin, pDest], [agent]);
        gameState.tick = 1;

        const ship = createShip(shiptypes.solid.bulkCarrier1, 0, 'Test Ship', pOrigin) as TransportShip;
        ship.state = {
            type: 'loading',
            planetId: 'p1',
            to: 'p2',
            cargoGoal: { resource: steelResourceType, quantity: 1000 },
            currentCargo: { resource: steelResourceType, quantity: 1000 },
        };
        agent.ships.push(ship);

        shipTick(gameState);
        expect(ship.state.type).toBe('transporting');
        expect(pDest.transportPipeline[steelResourceType.name]?.quantity).toBe(1000);
        expect(checkTransportPipeline(gameState)).toEqual([]);

        const arrivalTick = (ship.state as unknown as TransportShipStatusTransporting).arrivalTick;
        gameState.tick = arrivalTick;
        shipTick(gameState);
        expect(ship.state.type).toBe('unloading');
        expect(pDest.transportPipeline[steelResourceType.name]?.quantity ?? 0).toBe(0);
        expect(checkTransportPipeline(gameState)).toEqual([]);
    });

    it('aggregates quantities from two ships heading to the same destination', () => {
        const pOrigin = makePlanet({ id: 'p1', name: 'Origin' });
        const pDest = makePlanet({ id: 'p2', name: 'Dest' });
        const agent = makeAgent('agent-1', 'p1', 'Agent 1', {
            assets: {
                p1: makeAgentPlanetAssets('p1'),
                p2: makeAgentPlanetAssets('p2'),
            },
        });
        const gameState = makeGameState([pOrigin, pDest], [agent]);
        gameState.tick = 1;

        for (const qty of [800, 600]) {
            const ship = createShip(shiptypes.solid.bulkCarrier1, 0, `Ship ${qty}`, pOrigin) as TransportShip;
            ship.state = {
                type: 'loading',
                planetId: 'p1',
                to: 'p2',
                cargoGoal: { resource: steelResourceType, quantity: qty },
                currentCargo: { resource: steelResourceType, quantity: qty },
            };
            agent.ships.push(ship);
        }

        shipTick(gameState);
        expect(pDest.transportPipeline[steelResourceType.name]?.quantity).toBe(1400);
        expect(checkTransportPipeline(gameState)).toEqual([]);
    });
});
