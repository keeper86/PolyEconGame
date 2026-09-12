import { describe, expect, it } from 'vitest';
import {
    FACILITY_MAINTENANCE_DECREASE_PER_YEAR,
    FACILITY_MAINTENANCE_REPAIR_PER_TICK,
    MAINTENANCE_SERVICE_PER_STATUS_UNIT,
    MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE,
    TICKS_PER_YEAR,
} from '../constants';
import {
    makeAgent,
    makeGameState,
    makeHRFacility,
    makePlanet,
    makeProductionFacility,
    makeShipConstructionFacility,
    makeStorageFacility,
    setStorageResourceQuantity,
} from '../utils/testHelper';
import type { Resource } from './claims';
import {
    calculateCostsForConstruction,
    computeFacilityConditionEfficiency,
    getFacilityType,
    queryStorageFacility,
    type ProductionFacility,
    type Storage,
} from './facility';
import {
    computeOtherConstructionCosts,
    facilityMaintenanceTick,
    facilityRestorationCapacityPerTick,
    facilityRestorationCostFactor,
    facilityUsageFactor,
} from './facilityMaintenance';
import type { Agent, GameState, Planet } from './planet';
import { constructionServiceResourceType, maintenanceServiceResourceType } from './services';

const AGENT_ID = 'agent-1';
const PLANET_ID = 'p';
const CONSTRUCTION_PRICE = 10;
const MAINTENANCE_PRICE = 5;
const HALF_CONDITION = 0.5;
const ALMOST_FULL_REPAIR_CYCLE = 0.999;

interface Setup {
    gameState: GameState;
    planet: Planet;
    agent: Agent;
    facility: ProductionFacility;
    storage: Storage;
}

function setup(overrides?: Partial<ProductionFacility>): Setup {
    const agent = makeAgent(AGENT_ID, PLANET_ID);
    const assets = agent.assets[PLANET_ID]!;
    assets.storage.department = null;
    const facility = makeProductionFacility({}, overrides);
    facility.lastTickResults.overallEfficiency = 1;
    assets.productionFacilities = [facility];
    const planet = makePlanet({ marketPrices: { [constructionServiceResourceType.name]: CONSTRUCTION_PRICE } });
    const gameState = makeGameState([planet], [agent]);
    return { gameState, planet, agent, facility, storage: assets.storage };
}

function seedService(storage: Storage, resource: Resource, quantity: number): void {
    setStorageResourceQuantity(storage, resource, quantity);
}

// The auto-granted storage shells are themselves operating capital and so wear + consume the same
// Maintenance pool every tick. Freeze them so a test can isolate the single facility under repair.
function quietStorageShells(storage: Storage): void {
    for (const shell of Object.values(storage.shells)) {
        shell.maxMaintenance = 0;
    }
}

function markUnderConstruction(facility: ProductionFacility): void {
    facility.construction = {
        type: 'new',
        constructionTargetMaxScale: 2,
        totalConstructionServiceRequired: 100,
        maximumConstructionServiceConsumption: 10,
        progress: 0,
        lastTickInvestedConstructionServices: 0,
    };
}

function markExpanding(facility: ProductionFacility): void {
    facility.construction = {
        type: 'expansion',
        constructionTargetMaxScale: 2,
        totalConstructionServiceRequired: 100,
        maximumConstructionServiceConsumption: 10,
        progress: 0,
        lastTickInvestedConstructionServices: 0,
    };
}

function fullRestoreCost(facility: ProductionFacility): number {
    return calculateCostsForConstruction(getFacilityType(facility), 0, facility.maxScale).cost;
}

function wearPerTick(facility: ProductionFacility): number {
    return (facilityUsageFactor(facility) * FACILITY_MAINTENANCE_DECREASE_PER_YEAR) / TICKS_PER_YEAR;
}

describe('computeFacilityConditionEfficiency', () => {
    it('returns 1 at full condition and 0 at zero condition', () => {
        expect(computeFacilityConditionEfficiency(1)).toBeCloseTo(1);
        expect(computeFacilityConditionEfficiency(0)).toBeCloseTo(0);
    });

    it('applies the concave condition curve', () => {
        expect(computeFacilityConditionEfficiency(0.5)).toBeCloseTo(1 - 0.5 ** 3, 10);
        expect(computeFacilityConditionEfficiency(0.8)).toBeCloseTo(1 - 0.2 ** 3, 10);
        expect(computeFacilityConditionEfficiency(0.2)).toBeCloseTo(1 - 0.8 ** 3, 10);
    });

    it('clamps out-of-range condition to [0, 1]', () => {
        expect(computeFacilityConditionEfficiency(1.5)).toBeCloseTo(1);
        expect(computeFacilityConditionEfficiency(-0.5)).toBeCloseTo(0);
    });
});

describe('facilityRestorationCostFactor', () => {
    it('costs full replacement at zero maxMaintenance', () => {
        expect(facilityRestorationCostFactor(0)).toBeCloseTo(1, 2);
    });

    it('costs about 20% of replacement at full maxMaintenance', () => {
        expect(facilityRestorationCostFactor(1)).toBeCloseTo(0.2, 2);
    });

    it('costs 60% of replacement at half maxMaintenance', () => {
        expect(facilityRestorationCostFactor(0.5)).toBeCloseTo(0.6, 10);
    });

    it('decreases monotonically with maxMaintenance', () => {
        expect(facilityRestorationCostFactor(0.4)).toBeGreaterThan(facilityRestorationCostFactor(0.6));
    });

    it('clamps out-of-range input to [0, 1]', () => {
        expect(facilityRestorationCostFactor(-1)).toBeCloseTo(facilityRestorationCostFactor(0), 10);
        expect(facilityRestorationCostFactor(2)).toBeCloseTo(facilityRestorationCostFactor(1), 10);
    });
});

describe('facilityMaintenanceTick', () => {
    it('skips facilities that are under construction', () => {
        const { gameState, planet, facility } = setup();
        markUnderConstruction(facility);
        facility.maintenanceStatus = 1;
        facility.maxMaintenance = 1;

        facilityMaintenanceTick(gameState, planet);

        expect(facility.maintenanceStatus).toBe(1);
        expect(facility.maxMaintenance).toBe(1);
    });

    it('wears down an expanding facility', () => {
        const { gameState, planet, facility } = setup();
        markExpanding(facility);
        facility.maintenanceStatus = 1;
        facility.maxMaintenance = 1;

        facilityMaintenanceTick(gameState, planet);

        expect(facility.maintenanceStatus).toBeCloseTo(1 - wearPerTick(facility), 10);
    });

    it('repairs an expanding facility from Maintenance service', () => {
        const { gameState, planet, facility, storage } = setup();
        markExpanding(facility);
        facility.maintenanceStatus = HALF_CONDITION;
        facility.maxMaintenance = 1;
        seedService(
            storage,
            maintenanceServiceResourceType,
            FACILITY_MAINTENANCE_REPAIR_PER_TICK * MAINTENANCE_SERVICE_PER_STATUS_UNIT * 2,
        );

        facilityMaintenanceTick(gameState, planet);

        const expected = HALF_CONDITION - wearPerTick(facility) + FACILITY_MAINTENANCE_REPAIR_PER_TICK;
        expect(facility.maintenanceStatus).toBeCloseTo(expected, 10);
    });

    it('restores an expanding facility from Construction service', () => {
        const { gameState, planet, facility, storage } = setup();
        markExpanding(facility);
        facility.maxMaintenance = HALF_CONDITION;
        facility.maintenanceStatus = HALF_CONDITION;
        seedService(storage, constructionServiceResourceType, fullRestoreCost(facility));

        facilityMaintenanceTick(gameState, planet);

        expect(facility.maxMaintenance).toBeCloseTo(HALF_CONDITION + MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE, 10);
    });

    it('wears maintenanceStatus down when no Maintenance service is available', () => {
        const { gameState, planet, facility } = setup();
        facility.maintenanceStatus = 1;
        facility.maxMaintenance = 1;

        facilityMaintenanceTick(gameState, planet);

        expect(facility.maintenanceStatus).toBeCloseTo(1 - wearPerTick(facility), 10);
    });

    it('repairs maintenanceStatus from Maintenance service up to the per-tick cap', () => {
        const { gameState, planet, facility, storage } = setup();
        quietStorageShells(storage);
        facility.maintenanceStatus = HALF_CONDITION;
        facility.maxMaintenance = 1;
        seedService(
            storage,
            maintenanceServiceResourceType,
            FACILITY_MAINTENANCE_REPAIR_PER_TICK * MAINTENANCE_SERVICE_PER_STATUS_UNIT * 2,
        );

        facilityMaintenanceTick(gameState, planet);

        const expected = HALF_CONDITION - wearPerTick(facility) + FACILITY_MAINTENANCE_REPAIR_PER_TICK;
        expect(facility.maintenanceStatus).toBeCloseTo(expected, 10);
        expect(queryStorageFacility(storage, maintenanceServiceResourceType.name)).toBeCloseTo(
            FACILITY_MAINTENANCE_REPAIR_PER_TICK * MAINTENANCE_SERVICE_PER_STATUS_UNIT,
            10,
        );
    });

    it('does not repair beyond maxMaintenance', () => {
        const { gameState, planet, facility, storage } = setup();
        facility.maintenanceStatus = 1 - FACILITY_MAINTENANCE_REPAIR_PER_TICK;
        facility.maxMaintenance = 1;
        seedService(
            storage,
            maintenanceServiceResourceType,
            FACILITY_MAINTENANCE_REPAIR_PER_TICK * MAINTENANCE_SERVICE_PER_STATUS_UNIT * 2,
        );

        facilityMaintenanceTick(gameState, planet);

        expect(facility.maintenanceStatus).toBeLessThanOrEqual(1);
    });

    it('degrades maxMaintenance after a full repair cycle', () => {
        const { gameState, planet, facility, storage } = setup();
        facility.maintenanceStatus = 0;
        facility.maxMaintenance = 1;
        facility.cumulativeRepairAcc = ALMOST_FULL_REPAIR_CYCLE;
        seedService(
            storage,
            maintenanceServiceResourceType,
            FACILITY_MAINTENANCE_REPAIR_PER_TICK * MAINTENANCE_SERVICE_PER_STATUS_UNIT,
        );

        facilityMaintenanceTick(gameState, planet);

        expect(facility.maxMaintenance).toBeCloseTo(1 - MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE, 10);
        expect(facility.cumulativeRepairAcc).toBeCloseTo(
            ALMOST_FULL_REPAIR_CYCLE + FACILITY_MAINTENANCE_REPAIR_PER_TICK - 1,
            10,
        );
    });

    it('clamps maintenanceStatus to maxMaintenance when fully degraded', () => {
        const { gameState, planet, facility, storage } = setup();
        const negligibleStructure = MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE / 10;
        facility.maintenanceStatus = negligibleStructure;
        facility.maxMaintenance = negligibleStructure;
        facility.cumulativeRepairAcc = ALMOST_FULL_REPAIR_CYCLE;
        seedService(
            storage,
            maintenanceServiceResourceType,
            FACILITY_MAINTENANCE_REPAIR_PER_TICK * MAINTENANCE_SERVICE_PER_STATUS_UNIT,
        );

        facilityMaintenanceTick(gameState, planet);

        expect(facility.maxMaintenance).toBe(0);
        expect(facility.maintenanceStatus).toBe(0);
    });

    it('scales maintenance service consumption with facility scale', () => {
        const scale = 10;
        const { gameState, planet, facility, storage } = setup({ scale });
        quietStorageShells(storage);
        facility.maintenanceStatus = HALF_CONDITION;
        facility.maxMaintenance = 1;
        seedService(
            storage,
            maintenanceServiceResourceType,
            FACILITY_MAINTENANCE_REPAIR_PER_TICK * MAINTENANCE_SERVICE_PER_STATUS_UNIT * scale * 2,
        );

        facilityMaintenanceTick(gameState, planet);

        expect(facility.maintenanceStatus).toBeCloseTo(
            HALF_CONDITION + FACILITY_MAINTENANCE_REPAIR_PER_TICK - wearPerTick(facility),
            10,
        );
        expect(queryStorageFacility(storage, maintenanceServiceResourceType.name)).toBeCloseTo(
            FACILITY_MAINTENANCE_REPAIR_PER_TICK * MAINTENANCE_SERVICE_PER_STATUS_UNIT * scale,
            10,
        );
    });

    it('accumulates repair cycles by restored condition fraction, not consumed services', () => {
        const scale = 10;
        const { gameState, planet, facility, storage } = setup({ scale });
        facility.maintenanceStatus = 0;
        facility.maxMaintenance = 1;
        facility.cumulativeRepairAcc = ALMOST_FULL_REPAIR_CYCLE;
        seedService(
            storage,
            maintenanceServiceResourceType,
            FACILITY_MAINTENANCE_REPAIR_PER_TICK * MAINTENANCE_SERVICE_PER_STATUS_UNIT * scale,
        );

        facilityMaintenanceTick(gameState, planet);

        expect(facility.maxMaintenance).toBeCloseTo(1 - MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE, 10);
        expect(facility.cumulativeRepairAcc).toBeCloseTo(
            ALMOST_FULL_REPAIR_CYCLE + FACILITY_MAINTENANCE_REPAIR_PER_TICK - 1,
            10,
        );
    });

    it('records maintenance repair consumption in accounting', () => {
        const { gameState, planet, agent, facility, storage } = setup();
        quietStorageShells(storage);
        facility.maintenanceStatus = HALF_CONDITION;
        facility.maxMaintenance = 1;
        planet.marketPrices[maintenanceServiceResourceType.name] = MAINTENANCE_PRICE;
        seedService(
            storage,
            maintenanceServiceResourceType,
            FACILITY_MAINTENANCE_REPAIR_PER_TICK * MAINTENANCE_SERVICE_PER_STATUS_UNIT * 2,
        );

        facilityMaintenanceTick(gameState, planet);

        const consumed = FACILITY_MAINTENANCE_REPAIR_PER_TICK * MAINTENANCE_SERVICE_PER_STATUS_UNIT;
        const assets = agent.assets[PLANET_ID]!;
        expect(planet.consumedResources[maintenanceServiceResourceType.name]).toBeCloseTo(consumed, 10);
        expect(assets.monthAcc.consumedResources[maintenanceServiceResourceType.name].quantity).toBeCloseTo(
            consumed,
            10,
        );
        expect(assets.monthAcc.consumedResources[maintenanceServiceResourceType.name].value).toBeCloseTo(
            consumed * MAINTENANCE_PRICE,
            10,
        );
        expect(assets.monthAcc.consumptionValue).toBeCloseTo(consumed * MAINTENANCE_PRICE, 10);
    });

    it('does not restore a facility at full maxMaintenance', () => {
        const { gameState, planet, facility, storage } = setup();
        facility.maxMaintenance = 1;
        facility.maintenanceStatus = 1;
        const cost = fullRestoreCost(facility);
        seedService(storage, constructionServiceResourceType, cost);

        facilityMaintenanceTick(gameState, planet);

        expect(queryStorageFacility(storage, constructionServiceResourceType.name)).toBe(cost);
        expect(facility.maxMaintenance).toBe(1);
    });

    it('restores maxMaintenance by MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE when Construction is available', () => {
        const { gameState, planet, facility, storage } = setup();
        facility.maxMaintenance = HALF_CONDITION;
        facility.maintenanceStatus = HALF_CONDITION;
        const cost = fullRestoreCost(facility);
        seedService(storage, constructionServiceResourceType, cost);

        facilityMaintenanceTick(gameState, planet);

        expect(facility.maxMaintenance).toBeCloseTo(HALF_CONDITION + MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE, 10);
        expect(queryStorageFacility(storage, constructionServiceResourceType.name)).toBeCloseTo(
            cost - MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE * cost * facilityRestorationCostFactor(0.5),
            6,
        );
    });

    it('restores less when Construction service is limited', () => {
        const { gameState, planet, facility, storage } = setup();
        facility.maxMaintenance = HALF_CONDITION;
        facility.maintenanceStatus = HALF_CONDITION;
        seedService(storage, constructionServiceResourceType, facilityRestorationCapacityPerTick(facility) / 2);

        facilityMaintenanceTick(gameState, planet);

        expect(facility.maxMaintenance).toBeCloseTo(
            HALF_CONDITION + MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE / 2,
            10,
        );
        expect(queryStorageFacility(storage, constructionServiceResourceType.name)).toBe(0);
    });

    it('caps restoration at maxMaintenance = 1', () => {
        const { gameState, planet, facility, storage } = setup();
        facility.maxMaintenance = 1 - MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE / 2;
        facility.maintenanceStatus = 1 - MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE / 2;
        seedService(storage, constructionServiceResourceType, fullRestoreCost(facility));

        facilityMaintenanceTick(gameState, planet);

        expect(facility.maxMaintenance).toBeCloseTo(1, 10);
    });

    it('restores from a fully degraded facility', () => {
        const { gameState, planet, facility, storage } = setup();
        facility.maxMaintenance = 0;
        facility.maintenanceStatus = 0;
        seedService(storage, constructionServiceResourceType, fullRestoreCost(facility));

        facilityMaintenanceTick(gameState, planet);

        expect(facility.maxMaintenance).toBeCloseTo(MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE, 10);
        expect(facility.maintenanceStatus).toBeCloseTo(MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE, 10);
    });

    it('does not restore without Construction service', () => {
        const { gameState, planet, facility, storage } = setup();
        facility.maxMaintenance = HALF_CONDITION;
        facility.maintenanceStatus = HALF_CONDITION;
        seedService(
            storage,
            maintenanceServiceResourceType,
            FACILITY_MAINTENANCE_REPAIR_PER_TICK * MAINTENANCE_SERVICE_PER_STATUS_UNIT * 2,
        );

        facilityMaintenanceTick(gameState, planet);

        expect(facility.maxMaintenance).toBeCloseTo(HALF_CONDITION, 10);
    });

    it('records restoration consumption in accounting', () => {
        const { gameState, planet, agent, facility, storage } = setup();
        facility.maxMaintenance = HALF_CONDITION;
        facility.maintenanceStatus = HALF_CONDITION;
        const cost = fullRestoreCost(facility);
        seedService(storage, constructionServiceResourceType, cost);

        facilityMaintenanceTick(gameState, planet);

        const consumed = MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE * cost * facilityRestorationCostFactor(0.5);
        const assets = agent.assets[PLANET_ID]!;
        expect(planet.consumedResources[constructionServiceResourceType.name]).toBeCloseTo(consumed, 6);
        expect(assets.monthAcc.consumedResources[constructionServiceResourceType.name].quantity).toBeCloseTo(
            consumed,
            6,
        );
        expect(assets.monthAcc.consumedResources[constructionServiceResourceType.name].value).toBeCloseTo(
            consumed * CONSTRUCTION_PRICE,
            6,
        );
        expect(assets.monthAcc.consumptionValue).toBeCloseTo(consumed * CONSTRUCTION_PRICE, 6);
    });

    it('records per-facility maintenance consumption', () => {
        const { gameState, planet, facility, storage } = setup();
        facility.maintenanceStatus = HALF_CONDITION;
        facility.maxMaintenance = 1;
        seedService(
            storage,
            maintenanceServiceResourceType,
            FACILITY_MAINTENANCE_REPAIR_PER_TICK * MAINTENANCE_SERVICE_PER_STATUS_UNIT * 2,
        );

        facilityMaintenanceTick(gameState, planet);

        expect(facility.lastTickMaintenanceConsumption).toBeCloseTo(
            FACILITY_MAINTENANCE_REPAIR_PER_TICK * MAINTENANCE_SERVICE_PER_STATUS_UNIT,
            10,
        );
        expect(facility.lastTickRestorationConsumption).toBe(0);
    });

    it('records per-facility restoration consumption', () => {
        const { gameState, planet, facility, storage } = setup();
        facility.maxMaintenance = HALF_CONDITION;
        facility.maintenanceStatus = HALF_CONDITION;
        const cost = fullRestoreCost(facility);
        seedService(storage, constructionServiceResourceType, cost);

        facilityMaintenanceTick(gameState, planet);

        expect(facility.lastTickRestorationConsumption).toBeCloseTo(
            MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE * cost * facilityRestorationCostFactor(0.5),
            6,
        );
    });

    it('resets consumption fields when no service is available', () => {
        const { gameState, planet, facility } = setup();
        facility.maintenanceStatus = HALF_CONDITION;
        facility.maxMaintenance = HALF_CONDITION;

        facilityMaintenanceTick(gameState, planet);

        expect(facility.lastTickMaintenanceConsumption).toBe(0);
        expect(facility.lastTickRestorationConsumption).toBe(0);
    });
});

describe('computeOtherConstructionCosts', () => {
    it('sums remaining construction costs across production, management and ship construction facilities', () => {
        const agent = makeAgent(AGENT_ID, PLANET_ID);
        const assets = agent.assets[PLANET_ID]!;
        const production = makeProductionFacility(undefined, {
            construction: {
                type: 'expansion',
                constructionTargetMaxScale: 2,
                totalConstructionServiceRequired: 100,
                maximumConstructionServiceConsumption: 5,
                progress: 30,
                lastTickInvestedConstructionServices: 0,
            },
        });
        const hr = makeHRFacility(undefined, {
            construction: {
                type: 'expansion',
                constructionTargetMaxScale: 2,
                totalConstructionServiceRequired: 50,
                maximumConstructionServiceConsumption: 5,
                progress: 20,
                lastTickInvestedConstructionServices: 0,
            },
        });
        const storageDepartment = makeStorageFacility().department!;
        storageDepartment.construction = {
            type: 'new',
            constructionTargetMaxScale: 1,
            totalConstructionServiceRequired: 40,
            maximumConstructionServiceConsumption: 5,
            progress: 10,
            lastTickInvestedConstructionServices: 0,
        };
        const shipyard = makeShipConstructionFacility(undefined, {
            construction: {
                type: 'new',
                constructionTargetMaxScale: 1,
                totalConstructionServiceRequired: 60,
                maximumConstructionServiceConsumption: 5,
                progress: 0,
                lastTickInvestedConstructionServices: 0,
            },
        });
        assets.productionFacilities = [production];
        assets.humanResourcesDepartment = hr;
        assets.storage.department = storageDepartment;
        assets.shipConstructionFacilities = [shipyard];

        const remainingConstructionServices = 70 + 30 + 30 + 60;
        expect(computeOtherConstructionCosts(assets, CONSTRUCTION_PRICE)).toBe(
            remainingConstructionServices * CONSTRUCTION_PRICE,
        );
    });

    it('ignores facilities without active construction', () => {
        const agent = makeAgent(AGENT_ID, PLANET_ID);
        const assets = agent.assets[PLANET_ID]!;
        assets.productionFacilities = [makeProductionFacility()];
        assets.humanResourcesDepartment = makeHRFacility();

        expect(computeOtherConstructionCosts(assets, CONSTRUCTION_PRICE)).toBe(0);
    });

    it('clamps over-progressed facilities to zero', () => {
        const agent = makeAgent(AGENT_ID, PLANET_ID);
        const assets = agent.assets[PLANET_ID]!;
        assets.productionFacilities = [
            makeProductionFacility(undefined, {
                construction: {
                    type: 'expansion',
                    constructionTargetMaxScale: 2,
                    totalConstructionServiceRequired: 100,
                    maximumConstructionServiceConsumption: 5,
                    progress: 120,
                    lastTickInvestedConstructionServices: 0,
                },
            }),
        ];

        expect(computeOtherConstructionCosts(assets, CONSTRUCTION_PRICE)).toBe(0);
    });
});
