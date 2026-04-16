import { EPSILON } from '../constants';
import type { ResourceQuantity, TransportableResourceType } from '../planet/claims';
import { putIntoStorageFacility, removeFromStorageFacility } from '../planet/facility';
import type { Agent, Planet } from '../planet/planet';
import {
    electronicComponentResourceType,
    machineryResourceType,
    plasticResourceType,
    steelResourceType,
} from '../planet/resources';
import type { EducationLevelType } from '../population/population';

export type TransportShipType = {
    name: string;
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
};

export type TransportShipStatusLoading = {
    type: 'loading';
    planetId: string;
    to: string; // planet id
    cargoGoal: ResourceQuantity | null;
    currentCargo: ResourceQuantity;
};

export type TransportShipStatusUnloading = {
    type: 'unloading';
    planetId: string;
    cargo: ResourceQuantity;
};

export type TransportShipStatusIdle = {
    type: 'idle';
    planetId: string;
};

export type TransportShipStatusMaintenance = {
    type: 'maintenance';
    planetId: string;
    doneAtTick: number;
};

export type TransportShipStatus =
    | TransportShipStatusIdle
    | TransportShipStatusMaintenance
    | TransportShipStatusTransporting
    | TransportShipStatusLoading
    | TransportShipStatusUnloading;

export type TransportShip = {
    name: string;
    builtAtTick: number;
    type: TransportShipType;
    state: TransportShipStatus;
    maintainanceStatus: number;
};

export const shipTick = (agents: Map<string, Agent>, planet: Planet, tick = 1): void => {
    agents.forEach((agent) => {
        agent.transportShips.forEach((ship) => {
            if (ship.state.type === 'loading') {
                const storage = agent.assets[ship.state.planetId]?.storageFacility;
                if (!storage || !ship.state.cargoGoal) {
                    ship.state = {
                        type: 'transporting',
                        from: ship.state.planetId,
                        to: ship.state.to,
                        cargo: ship.state.currentCargo,
                        arrivalTick: tick + Math.ceil(1000 / ship.type.speed), // TODO: distance-based travel time
                    };
                    return;
                }

                const missingCargo = ship.state.cargoGoal.quantity - ship.state.currentCargo.quantity;
                const removedQuantity = removeFromStorageFacility(
                    storage,
                    ship.state.cargoGoal.type.name,
                    missingCargo,
                );
                ship.state.currentCargo.quantity += removedQuantity;
                if (removedQuantity === missingCargo) {
                    ship.state = {
                        type: 'transporting',
                        from: ship.state.planetId,
                        to: ship.state.to,
                        cargo: ship.state.currentCargo,
                        arrivalTick: tick + Math.ceil(1000 / ship.type.speed), // TODO: distance-based travel time
                    };
                }
                return;
            }
            if (ship.state.type === 'transporting') {
                if (tick >= ship.state.arrivalTick) {
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
                    const stored = putIntoStorageFacility(storage, ship.state.cargo.type, ship.state.cargo.quantity);
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
                for (const posterAgent of agents.values()) {
                    for (const posterAssets of Object.values(posterAgent.assets)) {
                        const contractIndex = posterAssets.transportContracts.findIndex(
                            (c) =>
                                c.status === 'accepted' &&
                                c.acceptedByAgentId === agent.id &&
                                c.shipName === ship.name &&
                                c.toPlanetId === arrivedPlanetId,
                        );
                        if (contractIndex !== -1) {
                            const contract = posterAssets.transportContracts[contractIndex];
                            if (contract.status === 'accepted') {
                                posterAssets.transportContracts[contractIndex] = {
                                    ...contract,
                                    status: 'fulfilled',
                                };
                                // Transfer reward: release from poster's hold, credit carrier
                                posterAssets.depositHold -= contract.offeredReward;
                                const carrierAssets =
                                    agent.assets[arrivedPlanetId] ?? agent.assets[agent.associatedPlanetId];
                                if (carrierAssets) {
                                    carrierAssets.deposits += contract.offeredReward;
                                }
                            }
                            break;
                        }
                    }
                }
                return;
            }
            if (ship.state.type === 'maintenance') {
                if (tick >= ship.state.doneAtTick) {
                    ship.state = {
                        type: 'idle',
                        planetId: ship.state.planetId,
                    };
                    ship.maintainanceStatus = 1;
                }
            }
        });
    });
};

const defaultBuildingCost: ResourceQuantity[] = [
    { type: steelResourceType, quantity: 100 },
    { type: electronicComponentResourceType, quantity: 50 },
    { type: machineryResourceType, quantity: 30 },
    { type: plasticResourceType, quantity: 20 },
];

const defaultRequiredCrew = {
    none: 0,
    primary: 5,
    secondary: 3,
    tertiary: 1,
};

const defaultBuildTime = 60;

export const shiptypes = {
    solid: {
        'Bulk Carrier': {
            name: 'Bulk Carrier',
            speed: 6,
            cargoSpecification: {
                type: 'solid',
                volume: 2000,
                mass: 1500,
            },
            requiredCrew: { ...defaultRequiredCrew },
            buildingCost: [...defaultBuildingCost],
            buildingTime: defaultBuildTime,
        } as const satisfies TransportShipType,
    } as const,
    liquid: {
        Tanker: {
            name: 'Tanker',
            speed: 10,
            cargoSpecification: {
                type: 'liquid',
                volume: 1000,
                mass: 800,
            },
            requiredCrew: { ...defaultRequiredCrew },
            buildingCost: [...defaultBuildingCost],
            buildingTime: defaultBuildTime,
        } as const satisfies TransportShipType,
    } as const,
    gas: {
        'Gas Carrier': {
            name: 'Gas Carrier',
            speed: 6,
            cargoSpecification: {
                type: 'gas',
                volume: 1500,
                mass: 1200,
            },
            requiredCrew: { ...defaultRequiredCrew },
            buildingCost: [...defaultBuildingCost],
            buildingTime: defaultBuildTime,
        } as const satisfies TransportShipType,
    } as const,
    pieces: {
        Freighter: {
            name: 'Freighter',
            speed: 8,
            cargoSpecification: {
                type: 'pieces',
                volume: 1000,
                mass: 800,
            },
            requiredCrew: { ...defaultRequiredCrew },
            buildingCost: [...defaultBuildingCost],
            buildingTime: defaultBuildTime,
        } as const satisfies TransportShipType,
    } as const,
    persons: {
        'Passenger Ship': {
            name: 'Passenger Ship',
            speed: 12,
            cargoSpecification: {
                type: 'persons',
                volume: 500,
                mass: 20000,
            },
            requiredCrew: { ...defaultRequiredCrew },
            buildingCost: [...defaultBuildingCost],
            buildingTime: defaultBuildTime,
        } as const satisfies TransportShipType,
    } as const,
    frozenGoods: {
        'Reefer Ship': {
            name: 'Reefer Ship',
            speed: 7,
            cargoSpecification: {
                type: 'frozenGoods',
                volume: 800,
                mass: 600,
            },
            requiredCrew: { ...defaultRequiredCrew },
            buildingCost: [...defaultBuildingCost],
            buildingTime: defaultBuildTime,
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

export type ContractStatus = 'open' | 'accepted' | 'fulfilled' | 'cancelled';

export type ShipBuyingOffer = {
    id: string;
    shipType: ShipTypeKey;
    buyerAgentId: string;
    /** Escrowed from buyer's deposits when offer is posted. */
    price: number;
} & (
    | { status: 'open' }
    | { status: 'accepted'; sellerAgentId: string; shipName: string }
    | { status: 'fulfilled'; sellerAgentId: string; shipName: string }
    | { status: 'cancelled' }
);

export type ShipMaintenanceOffer = {
    id: string;
    shipName: string;
    shipOwnerAgentId: string;
    price: number;
    maximumTicksAllowed: number;
} & (
    | { status: 'open' }
    | { status: 'accepted'; maintenanceProviderAgentId: string; contractDueTick: number }
    | { status: 'fulfilled'; maintenanceProviderAgentId: string }
    | { status: 'cancelled' }
);

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
        | { status: 'fulfilled'; acceptedByAgentId: string }
        | { status: 'cancelled' }
    );
