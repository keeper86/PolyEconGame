import { EPSILON, MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE, TICKS_PER_YEAR } from '../constants';
import type { ResourceQuantity, TransportableResourceType } from '../planet/claims';
import type { Facility } from '../planet/facility';
import {
    MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
    putIntoStorageFacility,
    removeFromStorageFacility,
    transferFromEscrow,
} from '../planet/facility';
import type { GameState, Planet } from '../planet/planet';
import { consumeConstructionForFacility } from '../planet/production';
import {
    electronicComponentResourceType,
    machineryResourceType,
    plasticResourceType,
    steelResourceType,
} from '../planet/resources';
import { maintenanceServiceResourceType } from '../planet/services';
import type { EducationLevelType } from '../population/population';

export const transportShipBuildResources = [
    steelResourceType.name,
    machineryResourceType.name,
    plasticResourceType.name,
    electronicComponentResourceType.name,
];

export type BaseShipType = {
    name: string;
    scale: 'small' | 'medium' | 'large' | 'super';
    speed: number;
    requiredCrew: Record<EducationLevelType, number>;
    buildingCost: ResourceQuantity[];
    buildingTime: number;
};

export type ShipScale = BaseShipType['scale'];

export const scaleMapping: Record<ShipScale, number> = {
    small: 1,
    medium: 2,
    large: 4,
    super: 8,
} as const;

export const scaleToLevel: Record<ShipScale, number> = {
    small: 1,
    medium: 2,
    large: 3,
    super: 4,
} as const;

export const scaleArrayToLevel = (quantity: ResourceQuantity[], scale: ShipScale): ResourceQuantity[] => {
    return quantity.map((q) => ({ resource: q.resource, quantity: q.quantity * scaleToLevel[scale] }));
};

export type ConstructionShipType = BaseShipType & {
    type: 'construction';
};

export type TransportShipType = BaseShipType & {
    type: 'transport';
    cargoSpecification: {
        type: TransportableResourceType; // type of resource this ship can carry
        volume: number; // in cubic meters
        mass: number; // in tons
    };
};

export type ShipType = ConstructionShipType | TransportShipType;

export type BaseShipStatusTransporting = {
    from: string; // planet id
    to: string; // planet id
    arrivalTick: number; // tick when the ship will arrive at destination
    contractId?: string;
    posterAgentId?: string;
};

export type TransportShipStatusTransporting = BaseShipStatusTransporting & {
    type: 'transporting';
    cargo: ResourceQuantity | null;
};

export type ConstructionShipStatusTransporting = BaseShipStatusTransporting & {
    type: 'construction_transporting';
    buildingTarget: Facility | null;
    loaded: number; // should be 1 when buildingTarget isnt null
};

export type BaseShipStatusLoading = {
    planetId: string;
    to: string;
    contractId?: string;
    posterAgentId?: string;
};

export type TransportShipStatusLoading = BaseShipStatusLoading & {
    type: 'loading';
    cargoGoal: ResourceQuantity | null;
    currentCargo: ResourceQuantity;
};

export type ConstructionShipStatusLoading = BaseShipStatusLoading & {
    type: 'pre-fabrication';
    buildingTarget: Facility | null;
    progress: number; // if buildingTarget is not null, this should be filled up to 1 over time
};

export type BaseShipStatusUnloading = {
    planetId: string;
    contractId?: string;
};

export type TransportShipStatusUnloading = BaseShipStatusUnloading & {
    type: 'unloading';
    cargo: ResourceQuantity;
};

export type ConstructionShipStatusUnloading = BaseShipStatusUnloading & {
    type: 'reconstruction';
    buildingTarget: Facility;
    progress: number; // should decrease from 1 to 0 over time
};

export type ShipStatusIdle = {
    type: 'idle';
    planetId: string;
};

export type ShipStatusListed = {
    type: 'listed';
    planetId: string;
};

export type ShipStatusDerelict = {
    type: 'derelict';
    planetId: string;
};

export type TransportShipStatus =
    | ShipStatusIdle
    | ShipStatusListed
    | ShipStatusDerelict
    | TransportShipStatusTransporting
    | TransportShipStatusLoading
    | TransportShipStatusUnloading;

export type TransportShipStatusType = TransportShipStatus['type'];

export type ConstructionShipStatus =
    | ShipStatusIdle
    | ShipStatusListed
    | ShipStatusDerelict
    | ConstructionShipStatusTransporting
    | ConstructionShipStatusLoading
    | ConstructionShipStatusUnloading;

export type ConstructionShipStatusType = ConstructionShipStatus['type'];

export type BaseShip = {
    name: string;
    builtAtTick: number;
    maintainanceStatus: number; // 0..1, degrades over time and with use, can be restored by consuming maintenance services up to maxMaintenance
    maxMaintenance: number; // degrades after each full repair cycle, when it reaches 0 the ship becomes derelict
    cumulativeRepairAcc: number; // accumulates repair consumed; triggers maxMaintenance degradation when >= 1
};

export type TransportShip = BaseShip & {
    type: TransportShipType;
    state: TransportShipStatus;
};

export type ConstructionShip = BaseShip & {
    type: ConstructionShipType;
    state: ConstructionShipStatus; // uses same status types as transport ships for simplicity, but only idle, loading (construction), unloading (deconstruction) and derelict are relevant
};

export type ConstructionContractBase = {
    id: string;
    fromPlanetId: string;
    toPlanetId: string;
    facilityName: string; // name matching a FacilityFactory (used for display / validation)
    commissioningAgentId: string; // agent who will receive the completed facility
    offeredReward: number;
    postedByAgentId: string;
    expiresAtTick: number;
};

export type ConstructionContract = ConstructionContractBase &
    (
        | { status: 'open' }
        | { status: 'accepted'; acceptedByAgentId: string; shipName: string; fulfillmentDueAtTick: number }
        | { status: 'completed' }
    );

export type Ship = TransportShip | ConstructionShip;

export const shipTick = (gameState: GameState): void => {
    gameState.agents.forEach((agent) => {
        agent.ships.forEach((ship) => {
            // Derelict ships are permanently non-operational — skip all processing
            if (ship.state.type === 'derelict') {
                return;
            }

            let maintenanceDecreasePerYear = 0.05;
            if (ship.state.type === 'transporting') {
                maintenanceDecreasePerYear *= 5;
            }
            if (ship.state.type === 'idle' || ship.state.type === 'listed') {
                maintenanceDecreasePerYear /= 5;
            }
            ship.maintainanceStatus = Math.max(
                0,
                ship.maintainanceStatus - maintenanceDecreasePerYear / TICKS_PER_YEAR,
            );

            if (ship.state.type === 'idle' || ship.state.type === 'listed') {
                const assets = agent.assets[ship.state.planetId];
                const storage = assets?.storageFacility;
                if (storage) {
                    const maintenancePerTick = Math.min(1, 3 / ship.type.buildingTime);
                    const maintenanceNeeded = Math.min(
                        maintenancePerTick,
                        ship.maxMaintenance - ship.maintainanceStatus,
                    );
                    const consumed = removeFromStorageFacility(
                        storage,
                        maintenanceServiceResourceType.name,
                        maintenanceNeeded,
                    );
                    if (consumed > 0) {
                        // Cap repair at maxMaintenance
                        ship.maintainanceStatus = Math.min(ship.maxMaintenance, ship.maintainanceStatus + consumed);
                        assets.monthAcc.consumptionValue +=
                            consumed *
                            (gameState.planets.get(ship.state.planetId)?.marketPrices[
                                maintenanceServiceResourceType.name
                            ] ?? 0);

                        // Aging: accumulate repair; degrade maxMaintenance after each full cycle
                        ship.cumulativeRepairAcc += consumed;
                        while (ship.cumulativeRepairAcc >= 1.0) {
                            ship.cumulativeRepairAcc -= 1.0;
                            ship.maxMaintenance = Math.max(
                                0,
                                ship.maxMaintenance - MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE,
                            );
                        }

                        // Transition to derelict when maxMaintenance reaches zero
                        if (ship.maxMaintenance <= 0) {
                            ship.maintainanceStatus = 0;
                            // If ship was listed, remove its listing
                            if (ship.state.type === 'listed') {
                                const planetId = ship.state.planetId;
                                const listingAssets = agent.assets[planetId];
                                if (listingAssets) {
                                    listingAssets.shipListings = listingAssets.shipListings.filter(
                                        (l) => l.shipName !== ship.name,
                                    );
                                }
                            }
                            ship.state = { type: 'derelict', planetId: ship.state.planetId };
                            return;
                        }
                    }
                }
            }

            if (ship.state.type === 'loading') {
                const storageAgent = ship.state.posterAgentId
                    ? (gameState.agents.get(ship.state.posterAgentId) ?? agent)
                    : agent;
                const storage = storageAgent.assets[ship.state.planetId]?.storageFacility;
                if (!storage || !ship.state.cargoGoal) {
                    ship.state = {
                        type: 'transporting',
                        from: ship.state.planetId,
                        to: ship.state.to,
                        cargo: ship.state.currentCargo,
                        arrivalTick: gameState.tick + Math.ceil(1000 / ship.type.speed), // TODO: distance-based travel time
                    };
                    return;
                }

                const missingCargo = ship.state.cargoGoal.quantity - ship.state.currentCargo.quantity;
                const removedQuantity = ship.state.contractId
                    ? transferFromEscrow(storage, ship.state.cargoGoal.resource.name, missingCargo)
                    : removeFromStorageFacility(storage, ship.state.cargoGoal.resource.name, missingCargo);
                ship.state.currentCargo.quantity += removedQuantity;
                if (removedQuantity === missingCargo) {
                    ship.state = {
                        type: 'transporting',
                        from: ship.state.planetId,
                        to: ship.state.to,
                        cargo: ship.state.currentCargo,
                        arrivalTick: gameState.tick + Math.ceil(1000 / ship.type.speed), // TODO: distance-based travel time
                    };
                }
                return;
            }

            if (ship.state.type === 'pre-fabrication') {
                if (!ship.state.buildingTarget) {
                    // No building target, just start transporting to construction site
                    ship.state = {
                        type: 'construction_transporting',
                        from: ship.state.planetId,
                        to: ship.state.to,
                        buildingTarget: null,
                        loaded: 0,
                        arrivalTick: gameState.tick + Math.ceil(1000 / ship.type.speed), // TODO: distance-based travel time
                    };
                    return;
                }

                // Progress pre-fabrication; look up target and consume construction
                const target = ship.state.buildingTarget;
                if (target.construction === null) {
                    ship.state = {
                        type: 'construction_transporting',
                        from: ship.state.planetId,
                        to: ship.state.to,
                        buildingTarget: target,
                        loaded: 1,
                        arrivalTick: gameState.tick + Math.ceil(1000 / ship.type.speed), // TODO: distance-based travel time
                        contractId: ship.state.contractId,
                        posterAgentId: ship.state.posterAgentId,
                    };
                    return;
                }
                const assets = agent.assets[ship.state.planetId];
                consumeConstructionForFacility(target, assets?.storageFacility);
                ship.state.progress = target.construction?.progress;
            }

            if (ship.state.type === 'transporting') {
                if (gameState.tick >= ship.state.arrivalTick) {
                    const cargo = ship.state.cargo;
                    if (!cargo) {
                        // No cargo, just arrive at destination
                        ship.state = {
                            type: 'idle',
                            planetId: ship.state.to,
                        };
                        return;
                    }
                    // Arrive at destination
                    ship.state = {
                        type: 'unloading',
                        planetId: ship.state.to,
                        cargo,
                    };
                }
                return;
            }

            if (ship.state.type === 'construction_transporting') {
                if (gameState.tick >= ship.state.arrivalTick) {
                    const target = ship.state.buildingTarget;
                    if (!target) {
                        // No building target, just arrive at destination
                        ship.state = {
                            type: 'idle',
                            planetId: ship.state.to,
                        };
                        return;
                    }
                    // Arrive at construction site
                    ship.state = {
                        type: 'reconstruction',
                        planetId: ship.state.to,
                        buildingTarget: target,
                        progress: 1,
                        contractId: ship.state.contractId,
                    };
                }
                return;
            }

            if (ship.state.type === 'unloading') {
                const assets = agent.assets[ship.state.planetId];
                if (!assets) {
                    return;
                }

                const storage = assets.storageFacility;
                if (!storage) {
                    return;
                }

                if (ship.state.cargo) {
                    const stored = putIntoStorageFacility(
                        storage,
                        ship.state.cargo.resource,
                        ship.state.cargo.quantity,
                    );
                    ship.state.cargo.quantity -= stored;
                    if (ship.state.cargo.quantity > EPSILON) {
                        return;
                    }
                }
                const arrivedPlanetId = ship.state.planetId;
                ship.state = {
                    type: 'idle',
                    planetId: arrivedPlanetId,
                };

                // Fulfil any accepted transport contract for this delivery
                for (const posterAgent of gameState.agents.values()) {
                    for (const posterAssets of Object.values(posterAgent.assets)) {
                        const contract = posterAssets.transportContracts.find(
                            (c) =>
                                c.status === 'accepted' &&
                                c.acceptedByAgentId === agent.id &&
                                c.shipName === ship.name &&
                                c.toPlanetId === arrivedPlanetId,
                        );
                        if (contract) {
                            if (contract.status === 'accepted') {
                                const index = posterAssets.transportContracts.indexOf(contract);
                                if (index === -1) {
                                    console.warn(
                                        `Contract not found in poster's assets for delivered cargo on ship ${ship.name} owned by agent ${agent.name}`,
                                    );
                                    break;
                                }
                                posterAssets.transportContracts.splice(index, 1);
                                // Transfer reward: release from poster's hold, credit carrier
                                posterAssets.depositHold -= contract.offeredReward;
                                const carrierAssets =
                                    agent.assets[arrivedPlanetId] ?? agent.assets[agent.associatedPlanetId];
                                if (carrierAssets) {
                                    carrierAssets.deposits += contract.offeredReward;
                                }
                            }
                            break;
                        } else {
                            console.warn(
                                `No matching contract found for delivered cargo on ship ${ship.name} owned by agent ${agent.name}`,
                            );
                        }
                    }
                }
                return;
            }

            if (ship.state.type === 'reconstruction') {
                const reconState = ship.state;
                const target = reconState.buildingTarget;
                reconState.progress = Math.max(0, reconState.progress - 1 / MINIMUM_CONSTRUCTION_TIME_IN_TICKS);
                if (reconState.progress <= 0) {
                    const arrivedPlanetId = reconState.planetId;

                    // Determine which agent receives the facility
                    let receivingAgentId: string = agent.id;
                    let matchedContract: ConstructionContract | undefined;

                    if (reconState.contractId) {
                        // Find the construction contract in the poster agent's assets
                        for (const posterAgent of gameState.agents.values()) {
                            for (const posterAssets of Object.values(posterAgent.assets)) {
                                const contract = posterAssets.constructionContracts.find(
                                    (c) => c.id === reconState.contractId,
                                );
                                if (contract && contract.status === 'accepted') {
                                    matchedContract = contract;
                                    receivingAgentId = contract.commissioningAgentId;
                                    // Mark complete and pay reward
                                    const idx = posterAssets.constructionContracts.indexOf(contract);
                                    posterAssets.constructionContracts[idx] = { ...contract, status: 'completed' };
                                    posterAssets.depositHold -= contract.offeredReward;
                                    const carrierAssets =
                                        agent.assets[arrivedPlanetId] ?? agent.assets[agent.associatedPlanetId];
                                    if (carrierAssets) {
                                        carrierAssets.deposits += contract.offeredReward;
                                    }
                                    break;
                                }
                            }
                            if (matchedContract) {
                                break;
                            }
                        }
                    }

                    // Place the facility into the receiving agent's assets on the destination planet
                    const receivingAgent = gameState.agents.get(receivingAgentId);
                    if (receivingAgent) {
                        const destAssets = receivingAgent.assets[arrivedPlanetId];
                        if (destAssets) {
                            // Update the facility's planetId to match the destination
                            const placedFacility = { ...target, planetId: arrivedPlanetId };
                            destAssets.productionFacilities.push(
                                placedFacility as typeof target & { type: 'production' },
                            );
                        }
                    }

                    ship.state = { type: 'idle', planetId: arrivedPlanetId };
                }
                return;
            }
        });
    });
};

export const defaultBuildingCost: ResourceQuantity[] = [
    { resource: steelResourceType, quantity: 100 },
    { resource: electronicComponentResourceType, quantity: 50 },
    { resource: machineryResourceType, quantity: 30 },
    { resource: plasticResourceType, quantity: 20 },
];

const defaultRequiredCrew = {
    none: 0,
    primary: 5,
    secondary: 3,
    tertiary: 1,
};

export const scaleShipType = (newScale: ShipScale, newName: string, template: TransportShipType): TransportShipType => {
    return {
        ...template,
        name: newName,
        scale: newScale,
        cargoSpecification: {
            type: template.cargoSpecification.type,
            volume: template.cargoSpecification.volume * scaleMapping[newScale],
            mass: template.cargoSpecification.mass * scaleMapping[newScale],
        },
        requiredCrew: {
            none: template.requiredCrew.none * scaleToLevel[newScale],
            primary: template.requiredCrew.primary * scaleToLevel[newScale],
            secondary: template.requiredCrew.secondary * scaleToLevel[newScale],
            tertiary: template.requiredCrew.tertiary * scaleToLevel[newScale],
        },
        buildingTime: template.buildingTime * scaleToLevel[newScale],
        buildingCost: scaleArrayToLevel(template.buildingCost, newScale),
    };
};

export const constructionShipType: ConstructionShipType = {
    type: 'construction',
    name: 'Construction Ship',
    scale: 'medium',
    speed: 4,
    buildingCost: [...defaultBuildingCost],
    buildingTime: 120,
    requiredCrew: { ...defaultRequiredCrew },
};

const smallBulkCarrier: TransportShipType = {
    type: 'transport',
    name: 'Small Bulk Carrier',
    scale: 'small',
    speed: 6,
    cargoSpecification: { type: 'solid', volume: 200000, mass: 150000 },
    requiredCrew: { ...defaultRequiredCrew },
    buildingCost: [...defaultBuildingCost],
    buildingTime: 60,
};

const smallTanker: TransportShipType = {
    type: 'transport',
    name: 'Small Tanker',
    scale: 'small',
    speed: 5,
    cargoSpecification: { type: 'liquid', volume: 150000, mass: 120000 },
    requiredCrew: { ...defaultRequiredCrew },
    buildingCost: [...defaultBuildingCost],
    buildingTime: 60,
};

const smallGasCarrier: TransportShipType = {
    type: 'transport',
    name: 'Small Gas Carrier',
    scale: 'small',
    speed: 6,
    cargoSpecification: { type: 'gas', volume: 150000, mass: 120000 },
    requiredCrew: { ...defaultRequiredCrew },
    buildingCost: [...defaultBuildingCost],
    buildingTime: 60,
};

const smallFreighter: TransportShipType = {
    type: 'transport',
    name: 'Small Freighter',
    scale: 'small',
    speed: 8,
    cargoSpecification: { type: 'pieces', volume: 100000, mass: 80000 },
    requiredCrew: { ...defaultRequiredCrew },
    buildingCost: [...defaultBuildingCost],
    buildingTime: 60,
};

const smallPassengerShip: TransportShipType = {
    type: 'transport',
    name: 'Small Passenger Ship',
    scale: 'small',
    speed: 12,
    cargoSpecification: { type: 'persons', volume: 50000, mass: 200000 },
    requiredCrew: { ...defaultRequiredCrew },
    buildingCost: [...defaultBuildingCost],
    buildingTime: 60,
};

const smallReefer: TransportShipType = {
    type: 'transport',
    name: 'Small Reefer',
    scale: 'small',
    speed: 7,
    cargoSpecification: { type: 'frozenGoods', volume: 80000, mass: 60000 },
    requiredCrew: { ...defaultRequiredCrew },
    buildingCost: [...defaultBuildingCost],
    buildingTime: 60,
};

export const shiptypes = {
    solid: {
        bulkCarrier1: smallBulkCarrier,
        bulkCarrier2: scaleShipType('medium', 'Bulk Carrier 2', smallBulkCarrier),
        bulkCarrier3: scaleShipType('large', 'Bulk Carrier 3', smallBulkCarrier),
        bulkCarrier4: scaleShipType('super', 'Bulk Carrier 4', smallBulkCarrier),
    } as const,
    liquid: {
        tanker1: smallTanker,
        tanker2: scaleShipType('medium', 'Tanker 2', smallTanker),
        tanker3: scaleShipType('large', 'Tanker 3', smallTanker),
        tanker4: scaleShipType('super', 'Tanker 4', smallTanker),
    } as const,
    gas: {
        gasCarrier1: smallGasCarrier,
        gasCarrier2: scaleShipType('medium', 'Gas Carrier 2', smallGasCarrier),
        gasCarrier3: scaleShipType('large', 'Gas Carrier 3', smallGasCarrier),
        gasCarrier4: scaleShipType('super', 'Gas Carrier 4', smallGasCarrier),
    } as const,
    pieces: {
        freighter1: smallFreighter,
        freighter2: scaleShipType('medium', 'Freighter 2', smallFreighter),
        freighter3: scaleShipType('large', 'Freighter 3', smallFreighter),
        freighter4: scaleShipType('super', 'Freighter 4', smallFreighter),
    } as const,
    persons: {
        passengerShip1: smallPassengerShip,
        passengerShip2: scaleShipType('medium', 'Passenger Ship 2', smallPassengerShip),
        passengerShip3: scaleShipType('large', 'Passenger Ship 3', smallPassengerShip),
        passengerShip4: scaleShipType('super', 'Passenger Ship 4', smallPassengerShip),
    } as const,

    frozenGoods: {
        reefer1: smallReefer,
        reefer2: scaleShipType('medium', 'Reefer 2', smallReefer),
        reefer3: scaleShipType('large', 'Reefer 3', smallReefer),
        reefer4: scaleShipType('super', 'Reefer 4', smallReefer),
    } as const,
} as const;

export type ShipTypeKey = {
    [K in keyof typeof shiptypes]: keyof (typeof shiptypes)[K];
}[keyof typeof shiptypes];

export const createShip = (
    shipTemplate: TransportShipType | ConstructionShipType,
    builtAtTick: number,
    name: string,
    planet: Planet,
): Ship => {
    if (shipTemplate.type === 'construction') {
        return {
            name,
            type: shipTemplate,
            state: {
                type: 'idle',
                planetId: planet.id,
            },
            maintainanceStatus: 1,
            maxMaintenance: 1,
            cumulativeRepairAcc: 0,
            builtAtTick,
        };
    }
    return {
        name,
        builtAtTick,
        type: shipTemplate,
        state: {
            type: 'idle',
            planetId: planet.id,
        },
        maintainanceStatus: 1,
        maxMaintenance: 1,
        cumulativeRepairAcc: 0,
    };
};

export type ShipListing = {
    id: string;
    sellerAgentId: string;
    shipName: string;
    shipTypeName: string;
    askPrice: number;
    planetId: string;
    postedAtTick: number;
};

export type ShipTradeRecord = {
    shipTypeName: string;
    price: number;
    tick: number;
    maintainanceStatus: number;
    maxMaintenance: number;
    effectiveValue: number;
};

export type ShipCapitalMarket = {
    tradeHistory: ShipTradeRecord[];
    /** EMA of trade price keyed by ship type name. */
    emaPrice: Record<string, number>;
};

export type ContractStatus = 'open' | 'accepted';

export type ShipBuyingOffer = {
    id: string;
    shipType: ShipTypeKey;
    buyerAgentId: string;
    /** Escrowed from buyer's deposits when offer is posted. */
    price: number;
} & ({ status: 'open' } | { status: 'accepted'; sellerAgentId: string; shipName: string });

export type TransportContractBase = {
    id: string;
    fromPlanetId: string;
    toPlanetId: string;
    cargo: ResourceQuantity;
    maxDurationInTicks: number;
    offeredReward: number;
    postedByAgentId: string;
    expiresAtTick: number;
};

export type TransportContract = TransportContractBase &
    (
        | { status: 'open' }
        | { status: 'accepted'; acceptedByAgentId: string; shipName: string; fulfillmentDueAtTick: number }
    );
