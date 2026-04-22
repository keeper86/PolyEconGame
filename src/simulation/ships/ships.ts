import { EPSILON, TICKS_PER_YEAR } from '../constants';
import type { ResourceQuantity, TransportableResourceType } from '../planet/claims';
import { putIntoStorageFacility, removeFromStorageFacility, transferFromEscrow } from '../planet/facility';
import type { GameState, Planet } from '../planet/planet';
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

export type TransportShipType = {
    name: string;
    scale: number;
    speed: number;
    cargoSpecification: {
        type: TransportableResourceType; // type of resource this ship can carry
        volume: number; // in cubic meters
        mass: number; // in tons
    };
    requiredCrew: Record<EducationLevelType, number>;
    buildingCost: ResourceQuantity[];
    buildingTime: number;
};

export type TransportShipStatusTransporting = {
    type: 'transporting';
    from: string; // planet id
    to: string; // planet id
    cargo: ResourceQuantity | null;
    arrivalTick: number; // tick when the ship will arrive at destination
    contractId?: string;
};

export type TransportShipStatusLoading = {
    type: 'loading';
    planetId: string;
    to: string; // planet id
    cargoGoal: ResourceQuantity | null;
    currentCargo: ResourceQuantity;
    contractId?: string;
    /** Agent who posted the transport contract; cargo is escrowed from their storage. */
    posterAgentId?: string;
};

export type TransportShipStatusUnloading = {
    type: 'unloading';
    planetId: string;
    cargo: ResourceQuantity;
    contractId?: string;
};

export type TransportShipStatusIdle = {
    type: 'idle';
    planetId: string;
};

export type TransportShipStatus =
    | TransportShipStatusIdle
    | TransportShipStatusTransporting
    | TransportShipStatusLoading
    | TransportShipStatusUnloading;

export type TransportShipStatusType = TransportShipStatus['type'];

export type TransportShip = {
    name: string;
    builtAtTick: number;
    type: TransportShipType;
    state: TransportShipStatus;
    maintainanceStatus: number;
};

export const shipTick = (gameState: GameState): void => {
    gameState.agents.forEach((agent) => {
        agent.transportShips.forEach((ship) => {
            let maintenanceDecreasePerYear = 0.05;
            if (ship.state.type === 'transporting') {
                maintenanceDecreasePerYear *= 5;
            }
            if (ship.state.type === 'idle') {
                maintenanceDecreasePerYear *= 0.5;
            }
            ship.maintainanceStatus = Math.max(
                0,
                ship.maintainanceStatus - maintenanceDecreasePerYear / TICKS_PER_YEAR,
            );

            if (ship.state.type === 'idle') {
                const assets = agent.assets[ship.state.planetId];
                const storage = assets?.storageFacility;
                if (storage) {
                    const maintenancePerTick = Math.min(1, 3 / ship.type.buildingTime);
                    const consumed = removeFromStorageFacility(
                        storage,
                        maintenanceServiceResourceType.name,
                        maintenancePerTick,
                    );
                    if (consumed > 0) {
                        ship.maintainanceStatus = Math.min(1, ship.maintainanceStatus + consumed);
                        assets.monthAcc.consumptionValue +=
                            consumed *
                            (gameState.planets.get(ship.state.planetId)?.marketPrices[
                                maintenanceServiceResourceType.name
                            ] ?? 0);
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

export const scaleShipType = (scale = 1, type: TransportShipType): TransportShipType => {
    return {
        ...type,
        cargoSpecification: {
            type: type.cargoSpecification.type,
            volume: type.cargoSpecification.volume * scale,
            mass: type.cargoSpecification.mass * scale,
        },
        buildingCost: type.buildingCost,
    };
};

export const shiptypes = {
    solid: {
        bulkCarrier1: {
            name: 'Bulk Carrier 1',
            scale: 1,
            speed: 6,
            cargoSpecification: { type: 'solid', volume: 200000, mass: 150000 },
            requiredCrew: { ...defaultRequiredCrew },
            buildingCost: [...defaultBuildingCost],
            buildingTime: 60,
        } as const satisfies TransportShipType,
        bulkCarrier2: {
            name: 'Bulk Carrier 2',
            scale: 2,
            speed: 7,
            cargoSpecification: { type: 'solid', volume: 400000, mass: 300000 },
            requiredCrew: { none: 0, primary: 8, secondary: 5, tertiary: 2 },
            buildingCost: defaultBuildingCost.map((r) => ({ resource: r.resource, quantity: r.quantity * 2 })),
            buildingTime: 90,
        } as const satisfies TransportShipType,
        bulkCarrier3: {
            name: 'Bulk Carrier 3',
            scale: 3,
            speed: 8,
            cargoSpecification: { type: 'solid', volume: 800000, mass: 600000 },
            requiredCrew: { none: 0, primary: 12, secondary: 7, tertiary: 3 },
            buildingCost: defaultBuildingCost.map((r) => ({ resource: r.resource, quantity: r.quantity * 4 })),
            buildingTime: 120,
        } as const satisfies TransportShipType,
        bulkCarrier4: {
            name: 'Bulk Carrier 4',
            scale: 4,
            speed: 9,
            cargoSpecification: { type: 'solid', volume: 1600000, mass: 1200000 },
            requiredCrew: { none: 0, primary: 18, secondary: 10, tertiary: 4 },
            buildingCost: defaultBuildingCost.map((r) => ({ resource: r.resource, quantity: r.quantity * 8 })),
            buildingTime: 180,
        } as const satisfies TransportShipType,
    } as const,
    liquid: {
        tanker1: {
            name: 'Tanker 1',
            scale: 1,
            speed: 10,
            cargoSpecification: { type: 'liquid', volume: 100000, mass: 80000 },
            requiredCrew: { ...defaultRequiredCrew },
            buildingCost: [...defaultBuildingCost],
            buildingTime: 60,
        } as const satisfies TransportShipType,
        tanker2: {
            name: 'Tanker 2',
            scale: 2,
            speed: 11,
            cargoSpecification: { type: 'liquid', volume: 200000, mass: 160000 },
            requiredCrew: { none: 0, primary: 8, secondary: 5, tertiary: 2 },
            buildingCost: defaultBuildingCost.map((r) => ({ resource: r.resource, quantity: r.quantity * 2 })),
            buildingTime: 90,
        } as const satisfies TransportShipType,
        tanker3: {
            name: 'Tanker 3',
            scale: 3,
            speed: 12,
            cargoSpecification: { type: 'liquid', volume: 400000, mass: 320000 },
            requiredCrew: { none: 0, primary: 12, secondary: 7, tertiary: 3 },
            buildingCost: defaultBuildingCost.map((r) => ({ resource: r.resource, quantity: r.quantity * 4 })),
            buildingTime: 120,
        } as const satisfies TransportShipType,
        tanker4: {
            name: 'Tanker 4',
            scale: 4,
            speed: 13,
            cargoSpecification: { type: 'liquid', volume: 800000, mass: 640000 },
            requiredCrew: { none: 0, primary: 18, secondary: 10, tertiary: 4 },
            buildingCost: defaultBuildingCost.map((r) => ({ resource: r.resource, quantity: r.quantity * 8 })),
            buildingTime: 180,
        } as const satisfies TransportShipType,
    } as const,
    gas: {
        gasCarrier1: {
            name: 'Gas Carrier 1',
            scale: 1,
            speed: 6,
            cargoSpecification: { type: 'gas', volume: 150000, mass: 120000 },
            requiredCrew: { ...defaultRequiredCrew },
            buildingCost: [...defaultBuildingCost],
            buildingTime: 60,
        } as const satisfies TransportShipType,
        gasCarrier2: {
            name: 'Gas Carrier 2',
            scale: 2,
            speed: 7,
            cargoSpecification: { type: 'gas', volume: 300000, mass: 240000 },
            requiredCrew: { none: 0, primary: 8, secondary: 5, tertiary: 2 },
            buildingCost: defaultBuildingCost.map((r) => ({ resource: r.resource, quantity: r.quantity * 2 })),
            buildingTime: 90,
        } as const satisfies TransportShipType,
        gasCarrier3: {
            name: 'Gas Carrier 3',
            scale: 3,
            speed: 8,
            cargoSpecification: { type: 'gas', volume: 600000, mass: 480000 },
            requiredCrew: { none: 0, primary: 12, secondary: 7, tertiary: 3 },
            buildingCost: defaultBuildingCost.map((r) => ({ resource: r.resource, quantity: r.quantity * 4 })),
            buildingTime: 120,
        } as const satisfies TransportShipType,
        gasCarrier4: {
            name: 'Gas Carrier 4',
            scale: 4,
            speed: 9,
            cargoSpecification: { type: 'gas', volume: 1200000, mass: 960000 },
            requiredCrew: { none: 0, primary: 18, secondary: 10, tertiary: 4 },
            buildingCost: defaultBuildingCost.map((r) => ({ resource: r.resource, quantity: r.quantity * 8 })),
            buildingTime: 180,
        } as const satisfies TransportShipType,
    } as const,
    pieces: {
        freighter1: {
            name: 'Freighter 1',
            scale: 1,
            speed: 8,
            cargoSpecification: { type: 'pieces', volume: 100000, mass: 80000 },
            requiredCrew: { ...defaultRequiredCrew },
            buildingCost: [...defaultBuildingCost],
            buildingTime: 60,
        } as const satisfies TransportShipType,
        freighter2: {
            name: 'Freighter 2',
            scale: 2,
            speed: 9,
            cargoSpecification: { type: 'pieces', volume: 200000, mass: 160000 },
            requiredCrew: { none: 0, primary: 8, secondary: 5, tertiary: 2 },
            buildingCost: defaultBuildingCost.map((r) => ({ resource: r.resource, quantity: r.quantity * 2 })),
            buildingTime: 90,
        } as const satisfies TransportShipType,
        freighter3: {
            name: 'Freighter 3',
            scale: 3,
            speed: 10,
            cargoSpecification: { type: 'pieces', volume: 400000, mass: 320000 },
            requiredCrew: { none: 0, primary: 12, secondary: 7, tertiary: 3 },
            buildingCost: defaultBuildingCost.map((r) => ({ resource: r.resource, quantity: r.quantity * 4 })),
            buildingTime: 120,
        } as const satisfies TransportShipType,
        freighter4: {
            name: 'Freighter 4',
            scale: 4,
            speed: 11,
            cargoSpecification: { type: 'pieces', volume: 800000, mass: 640000 },
            requiredCrew: { none: 0, primary: 18, secondary: 10, tertiary: 4 },
            buildingCost: defaultBuildingCost.map((r) => ({ resource: r.resource, quantity: r.quantity * 8 })),
            buildingTime: 180,
        } as const satisfies TransportShipType,
    } as const,
    persons: {
        passengerShip1: {
            name: 'Passenger Ship 1',
            scale: 1,
            speed: 12,
            cargoSpecification: { type: 'persons', volume: 50000, mass: 200000 },
            requiredCrew: { ...defaultRequiredCrew },
            buildingCost: [...defaultBuildingCost],
            buildingTime: 60,
        } as const satisfies TransportShipType,
        passengerShip2: {
            name: 'Passenger Ship 2',
            scale: 2,
            speed: 13,
            cargoSpecification: { type: 'persons', volume: 100000, mass: 400000 },
            requiredCrew: { none: 0, primary: 8, secondary: 5, tertiary: 2 },
            buildingCost: defaultBuildingCost.map((r) => ({ resource: r.resource, quantity: r.quantity * 2 })),
            buildingTime: 90,
        } as const satisfies TransportShipType,
        passengerShip3: {
            name: 'Passenger Ship 3',
            scale: 3,
            speed: 14,
            cargoSpecification: { type: 'persons', volume: 200000, mass: 800000 },
            requiredCrew: { none: 0, primary: 12, secondary: 7, tertiary: 3 },
            buildingCost: defaultBuildingCost.map((r) => ({ resource: r.resource, quantity: r.quantity * 4 })),
            buildingTime: 120,
        } as const satisfies TransportShipType,
        passengerShip4: {
            name: 'Passenger Ship 4',
            scale: 4,
            speed: 15,
            cargoSpecification: { type: 'persons', volume: 400000, mass: 1600000 },
            requiredCrew: { none: 0, primary: 18, secondary: 10, tertiary: 4 },
            buildingCost: defaultBuildingCost.map((r) => ({ resource: r.resource, quantity: r.quantity * 8 })),
            buildingTime: 180,
        } as const satisfies TransportShipType,
    } as const,
    frozenGoods: {
        reefer1: {
            name: 'Reefer 1',
            scale: 1,
            speed: 7,
            cargoSpecification: { type: 'frozenGoods', volume: 80000, mass: 60000 },
            requiredCrew: { ...defaultRequiredCrew },
            buildingCost: [...defaultBuildingCost],
            buildingTime: 60,
        } as const satisfies TransportShipType,
        reefer2: {
            name: 'Reefer 2',
            scale: 2,
            speed: 8,
            cargoSpecification: { type: 'frozenGoods', volume: 160000, mass: 120000 },
            requiredCrew: { none: 0, primary: 8, secondary: 5, tertiary: 2 },
            buildingCost: defaultBuildingCost.map((r) => ({ resource: r.resource, quantity: r.quantity * 2 })),
            buildingTime: 90,
        } as const satisfies TransportShipType,
        reefer3: {
            name: 'Reefer 3',
            scale: 3,
            speed: 9,
            cargoSpecification: { type: 'frozenGoods', volume: 320000, mass: 240000 },
            requiredCrew: { none: 0, primary: 12, secondary: 7, tertiary: 3 },
            buildingCost: defaultBuildingCost.map((r) => ({ resource: r.resource, quantity: r.quantity * 4 })),
            buildingTime: 120,
        } as const satisfies TransportShipType,
        reefer4: {
            name: 'Reefer 4',
            scale: 4,
            speed: 10,
            cargoSpecification: { type: 'frozenGoods', volume: 640000, mass: 480000 },
            requiredCrew: { none: 0, primary: 18, secondary: 10, tertiary: 4 },
            buildingCost: defaultBuildingCost.map((r) => ({ resource: r.resource, quantity: r.quantity * 8 })),
            buildingTime: 180,
        } as const satisfies TransportShipType,
    } as const,
} as const;

export type ShipTypeKey = {
    [K in keyof typeof shiptypes]: keyof (typeof shiptypes)[K];
}[keyof typeof shiptypes];

export const createTransportShip = (
    type: TransportShipType,
    builtAtTick: number,
    name: string,
    planet: Planet,
): TransportShip => {
    return {
        name,
        builtAtTick,
        type,
        state: {
            type: 'idle',
            planetId: planet.id,
        },
        maintainanceStatus: 1,
    };
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
