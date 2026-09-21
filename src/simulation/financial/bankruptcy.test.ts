import { describe, expect, it } from 'vitest';
import { makeAgent, makeGameState, makePlanet, makeProductionFacility } from '../utils/testHelper';
import { checkMonetaryConservation } from '../invariants';
import type { Agent, GameState, Planet } from '../planet/planet';
import { processBankruptcy, setBankruptcyDebtWriteOffFraction, terminateAndRefound } from './bankruptcy';
import { makeLoan } from './loanTypes';

function setupWorld(player: Agent, extraAgents: Agent[] = []): { gameState: GameState; planet: Planet } {
    const planet = makePlanet();
    const gov = makeAgent('gov', planet.id, 'Gov');
    planet.governmentId = gov.id;
    const gameState = makeGameState([planet], [gov, player, planet.recycler, ...extraAgents], 2);
    return { gameState, planet };
}

function assertConserved(gameState: GameState, planet: Planet, tolerance = 1e-9): void {
    const issues = checkMonetaryConservation(gameState.agents, new Map([[planet.id, planet]]), tolerance);
    expect(issues).toEqual([]);
}

describe('processBankruptcy', () => {
    it('restructures a player company above 1 per mille of the market into an automated NPC', () => {
        const player = makeAgent('player-co', 'p', 'Player Co', { automated: false });
        player.assets.p!.lastMonthAcc.productionValue = 100;
        const { gameState, planet } = setupWorld(player);

        const refound = processBankruptcy(gameState, planet, player, 2);

        expect(refound).not.toBeNull();
        expect(gameState.agents.has('player-co')).toBe(false);
        expect(refound!.automated).toBe(true);
        expect(refound!.automateWorkerAllocation).toBe(true);
        expect(refound!.logo).toBe('ai_company');
        expect(refound!.name).toBe('Player Co ♻1');
        expect(gameState.bankruptcies).toHaveLength(1);
        expect(gameState.bankruptcies[0]).toMatchObject({
            agentId: 'player-co',
            agentName: 'Player Co',
            planetId: 'p',
            outcome: 'restructured',
        });
        assertConserved(gameState, planet);
    });

    it('liquidates a player company at or below 1 per mille of the market', () => {
        const player = makeAgent('small-co', 'p', 'Small Co', { automated: false });
        player.assets.p!.lastMonthAcc.productionValue = 1;
        const big = makeAgent('big-co', 'p', 'Big Co', { automated: true });
        big.assets.p!.lastMonthAcc.productionValue = 10_000;
        const { gameState, planet } = setupWorld(player, [big]);

        const refound = processBankruptcy(gameState, planet, player, 2);

        expect(refound).toBeNull();
        expect(gameState.agents.has('small-co')).toBe(false);
        expect(gameState.bankruptcies).toHaveLength(1);
        expect(gameState.bankruptcies[0]).toMatchObject({
            agentId: 'small-co',
            agentName: 'Small Co',
            outcome: 'liquidated',
        });
        assertConserved(gameState, planet);
    });

    it('sells facilities of a liquidated company to the recycler and pays the bank', () => {
        const player = makeAgent('small-fac', 'p', 'Small Fac', { automated: false });
        const assets = player.assets.p!;
        assets.lastMonthAcc.productionValue = 1;
        assets.productionFacilities = [
            makeProductionFacility({}, { planetId: 'p', id: 'fac-1', name: 'Fac 1', scale: 5, maxScale: 5 }),
        ];
        const big = makeAgent('big-fac', 'p', 'Big Fac', { automated: true });
        big.assets.p!.lastMonthAcc.productionValue = 10_000;
        const { gameState, planet } = setupWorld(player, [big]);

        processBankruptcy(gameState, planet, player, 2);

        expect(gameState.agents.has('small-fac')).toBe(false);
        expect(planet.recycler.assets.p!.deposits).toBeGreaterThanOrEqual(0);
        assertConserved(gameState, planet);
    });

    it('returns workers of a liquidated company to the planet population', () => {
        const player = makeAgent('work-co', 'p', 'Work Co', { automated: false });
        const assets = player.assets.p!;
        assets.lastMonthAcc.productionValue = 1;
        const workforce = assets.workforceDemography;
        workforce[25].none.active = 10;
        const big = makeAgent('big-work', 'p', 'Big Work', { automated: true });
        big.assets.p!.lastMonthAcc.productionValue = 10_000;
        const { gameState, planet } = setupWorld(player, [big]);

        planet.population.demography[25].employed.none.total = 10;
        planet.population.demography[25].unoccupied.none.total = 0;

        processBankruptcy(gameState, planet, player, 2);

        expect(gameState.agents.has('work-co')).toBe(false);
        expect(workforce[25].none.active).toBe(0);
        expect(planet.population.demography[25].employed.none.total).toBe(0);
        expect(planet.population.demography[25].unoccupied.none.total).toBe(10);
    });

    it('releases claims of a liquidated company back into the resource pool', () => {
        const player = makeAgent('claim-co', 'p', 'Claim Co', { automated: false });
        player.assets.p!.lastMonthAcc.productionValue = 1;
        const big = makeAgent('big-claim', 'p', 'Big Claim', { automated: true });
        big.assets.p!.lastMonthAcc.productionValue = 10_000;
        const { gameState, planet } = setupWorld(player, [big]);

        const resource = {
            name: 'ore',
            form: 'solid',
            level: 'raw',
            volumePerQuantity: 1,
            massPerQuantity: 1,
        } as const;
        planet.resources.ore = {
            pool: { resource, quantity: 0, regenerationRate: 0, maximumCapacity: 100 },
            claims: [
                {
                    id: 'claim-1',
                    tenantAgentId: 'claim-co',
                    tenantCostInCoins: 0,
                    costPerTick: 0,
                    claimStatus: 'active',
                    noticePeriodEndsAtTick: null,
                    pausedTicksThisYear: 0,
                    resource,
                    quantity: 40,
                    regenerationRate: 0,
                    maximumCapacity: 40,
                },
            ],
        };

        processBankruptcy(gameState, planet, player, 2);

        expect(planet.resources.ore.claims).toHaveLength(0);
        expect(planet.resources.ore.pool.quantity).toBe(40);
        expect(planet.resources.ore.pool.maximumCapacity).toBe(140);
    });

    it('reverts accepted counterparty contracts when the accepting company is liquidated', () => {
        const player = makeAgent('carrier-co', 'p', 'Carrier Co', { automated: false });
        player.assets.p!.lastMonthAcc.productionValue = 1;
        const big = makeAgent('big-carrier', 'p', 'Big Carrier', { automated: true });
        big.assets.p!.lastMonthAcc.productionValue = 10_000;
        const { gameState, planet } = setupWorld(player, [big]);

        const poster = makeAgent('poster-co', 'p', 'Poster Co', { automated: true });
        gameState.agents.set('poster-co', poster);
        poster.assets.p!.transportContracts.push({
            id: 'contract-1',
            fromPlanetId: 'p',
            toPlanetId: 'p',
            cargo: {
                resource: { name: 'iron', form: 'solid', level: 'raw', volumePerQuantity: 1, massPerQuantity: 1 },
                quantity: 5,
            },
            maxDurationInTicks: 100,
            offeredReward: 50,
            postedByAgentId: 'poster-co',
            expiresAtTick: 100,
            status: 'accepted',
            acceptedByAgentId: 'carrier-co',
            shipId: 'ship-1',
            fulfillmentDueAtTick: 90,
        });

        processBankruptcy(gameState, planet, player, 2);

        const contract = poster.assets.p!.transportContracts[0];
        expect(contract.status).toBe('open');
        assertConserved(gameState, planet);
    });

    it('restructures a player company with in-flight ships instead of liquidating', () => {
        const player = makeAgent('ship-co', 'p', 'Ship Co', { automated: false });
        const assets = player.assets.p!;
        assets.lastMonthAcc.productionValue = 1;
        player.ships = [
            {
                id: 'ship-1',
                name: 'SS Traveller',
                type: {
                    type: 'transport',
                    name: 'Bulk Carrier 1',
                    scale: 'small',
                    speed: 6,
                    cargoSpecification: { type: 'solid', volume: 200000, mass: 150000 },
                    requiredCrew: { none: 1, primary: 0, secondary: 0, tertiary: 0 },
                    buildingCost: [],
                    buildingTime: 60,
                },
                state: {
                    type: 'transporting',
                    from: 'p',
                    to: 'p2',
                    arrivalTick: 100,
                    contractId: 'contract-1',
                    posterAgentId: 'poster-co',
                    cargo: null,
                },
                builtAtTick: 10,
                maintainanceStatus: 1,
                maxMaintenance: 1,
                cumulativeRepairAcc: 0,
            },
        ];
        const big = makeAgent('big-ship', 'p', 'Big Ship', { automated: true });
        big.assets.p!.lastMonthAcc.productionValue = 10_000;
        const { gameState, planet } = setupWorld(player, [big]);

        const refound = processBankruptcy(gameState, planet, player, 2);

        expect(refound).not.toBeNull();
        expect(refound!.automated).toBe(true);
        expect(gameState.bankruptcies[0].outcome).toBe('restructured');
    });

    it('writes off only the configured fraction and rolls the rest over at the bank rate', () => {
        setBankruptcyDebtWriteOffFraction(0.5);
        try {
            const planet = makePlanet();
            planet.bank.loanRatePerYear = 0.05;
            const gov = makeAgent('gov', planet.id, 'Gov');
            const agent = makeAgent('a1', planet.id, 'A1');
            const assets = agent.assets[planet.id]!;
            assets.deposits = 1000;
            assets.activeLoans = [makeLoan('emergency', 1000, 0.05, 1, 361, true)];
            planet.governmentId = gov.id;
            planet.bank.deposits = 1000;
            planet.bank.loans = 1000;
            const gameState = makeGameState([planet], [gov, agent, planet.recycler], 2);

            const refound = terminateAndRefound(gameState, planet, agent, 2);

            expect(refound).not.toBeNull();
            expect(planet.bank.bankruptcies).toBe(1);
            expect(planet.bank.writeOffs).toBe(500);
            expect(planet.bank.loans).toBe(500);
            const retained = refound!.assets[planet.id]!.activeLoans;
            expect(retained).toHaveLength(1);
            expect(retained[0]!.type).toBe('rollover');
            expect(retained[0]!.remainingPrincipal).toBe(500);
            expect(retained[0]!.annualInterestRate).toBe(0.05);
            assertConserved(gameState, planet);
        } finally {
            setBankruptcyDebtWriteOffFraction(1);
        }
    });

    it('keeps the existing refound behaviour for automated NPC companies without a bankruptcy record', () => {
        const npc = makeAgent('npc-co', 'p', 'NPC Co', { automated: true });
        const { gameState, planet } = setupWorld(npc);

        const refound = processBankruptcy(gameState, planet, npc, 2);

        expect(refound).not.toBeNull();
        expect(refound!.name).toBe('NPC Co ♻1');
        expect(refound!.automated).toBe(true);
        expect(gameState.bankruptcies).toHaveLength(0);
        assertConserved(gameState, planet);
    });

    it('assigns a unique id when two companies with the same name are refounded in the same year', () => {
        const planet = makePlanet();
        const gov = makeAgent('gov', planet.id, 'Gov');
        planet.governmentId = gov.id;
        const a = makeAgent('a1', planet.id, 'Player Co');
        const b = makeAgent('a2', planet.id, 'Player Co');
        const gameState = makeGameState([planet], [gov, a, b, planet.recycler], 2);

        const refoundA = terminateAndRefound(gameState, planet, a, 2);
        const refoundB = terminateAndRefound(gameState, planet, b, 2);

        expect(refoundA!.id).toBe('player-co_lastRefounded_2200');
        expect(refoundB!.id).toBe('player-co_lastRefounded_2200-2');
        expect(gameState.agents.has(refoundA!.id)).toBe(true);
        expect(gameState.agents.has(refoundB!.id)).toBe(true);
        expect(gameState.agents.size).toBe(4);
        assertConserved(gameState, planet);
    });

    it('exempts the recycler agent from bankruptcy', () => {
        const player = makeAgent('player-co', 'p', 'Player Co');
        const { gameState, planet } = setupWorld(player);
        const recycler = planet.recycler;
        const assets = recycler.assets[planet.id]!;
        assets.lastMonthAcc.productionValue = 100_000;
        assets.activeLoans = [makeLoan('emergency', 1_000_000, 0.05, 1, 361, true)];
        assets.deposits = 500;

        const refound = processBankruptcy(gameState, planet, recycler, 2);

        expect(refound).toBeNull();
        expect(gameState.agents.get(recycler.id)).toBe(recycler);
        expect(assets.activeLoans).toHaveLength(1);
        expect(assets.deposits).toBe(500);
        expect(gameState.bankruptcies).toHaveLength(0);
    });
});
