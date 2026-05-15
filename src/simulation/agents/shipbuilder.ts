import { SHIPBUILDER_WORKING_CAPITAL, SHIPBUILDER_BOOTSTRAP_LOAN, SHIPBUILDER_LISTING_MARKUP } from '../constants';
import { grantLoan } from '../financial/loanTypes';
import { createShipListing } from '../ships/shipMarket';
import { makeAgentPlanetAssets, makeStorage } from '../initialUniverse/helpers';
import type { Agent, GameState } from '../planet/planet';
import { createShip, shiptypes } from '../ships/ships';
import type { ShipListing } from '../ships/ships';
import type { ShipConstructionFacility } from '../planet/facility';

/** Bootstrap ship types a shipbuilder pre-builds at seed time (one per category). */
const BOOTSTRAP_SHIP_TYPES = [
    shiptypes.solid.bulkCarrier1,
    shiptypes.liquid.tanker1,
    shiptypes.gas.gasCarrier1,
    shiptypes.pieces.freighter1,
] as const;

function makeShipyard(planetId: string, agentId: string): ShipConstructionFacility {
    return {
        type: 'ship_construction',
        id: `${agentId}_shipyard_${planetId}`,
        name: 'Shipyard',
        planetId,
        scale: 1,
        maxScale: 4,
        construction: null,
        powerConsumptionPerTick: 0.5,
        workerRequirement: { none: 10, primary: 20, secondary: 15, tertiary: 5 },
        pollutionPerTick: { air: 0.01, water: 0.01, soil: 0 },
        shipName: '',
        produces: null,
        progress: 0,
        lastTickResults: {
            overallEfficiency: 0,
            workerEfficiency: {},
            overqualifiedWorkers: {},
            exactUsedByEdu: {},
            totalUsedByEdu: {},
            resourceEfficiency: {},
            lastConsumed: {},
        },
    };
}

export function seedShipbuilderAgents(gameState: GameState): void {
    for (const planet of gameState.planets.values()) {
        if (planet.name !== 'earth') {
            continue;
        }
        const agentId = `shipbuilder_${planet.id}`;

        const storage = makeStorage({
            planetId: planet.id,
            id: `${agentId}_store_${planet.id}`,
            name: 'Shipyard Storage',
            volumeCapacity: 5e14,
            massCapacity: 5e15,
        });
        const assets = makeAgentPlanetAssets(planet.id, [], storage);
        assets.licenses = {
            commercial: { acquiredTick: 0, frozen: false },
            workforce: { acquiredTick: 0, frozen: false },
        };
        assets.market = { sell: {}, buy: {} };
        assets.shipConstructionFacilities.push(makeShipyard(planet.id, agentId));

        // Working-capital loan to fund operations and input purchases
        grantLoan(assets, planet.bank, SHIPBUILDER_WORKING_CAPITAL, 'shipbuilderBootstrap', 0);

        const agent: Agent = {
            id: agentId,
            name: `Shipbuilder (${planet.name})`,
            automated: false, // we manage market positions in shipbuilderTick
            automateWorkerAllocation: true,
            foundedTick: 0,
            starterLoanTaken: true,
            associatedPlanetId: planet.id,
            agentRole: 'shipbuilder',
            ships: [],
            assets: { [planet.id]: assets },
        };

        // Bootstrap fleet: pre-build one ship of each transport type and list for sale
        const bootstrapLoanTotal = SHIPBUILDER_BOOTSTRAP_LOAN * BOOTSTRAP_SHIP_TYPES.length;
        grantLoan(assets, planet.bank, bootstrapLoanTotal, 'shipbuilderBootstrap', 0);

        for (const shipType of BOOTSTRAP_SHIP_TYPES) {
            const ship = createShip(shipType, 0, `${shipType.name} (${planet.name})`, planet);
            agent.ships.push(ship);

            const listing: ShipListing = {
                id: crypto.randomUUID(),
                sellerAgentId: agentId,
                shipId: ship.id,
                shipName: ship.name,
                shipTypeName: shipType.name,
                askPrice: Math.round(SHIPBUILDER_BOOTSTRAP_LOAN * (1 + SHIPBUILDER_LISTING_MARKUP)),
                planetId: planet.id,
                postedAtTick: 0,
            };
            createShipListing(ship, assets, listing);
        }

        // Register in both the role-index Map and the main agents Map
        gameState.shipbuilderAgents.set(agentId, agent);
        gameState.agents.set(agentId, agent);
    }
}
