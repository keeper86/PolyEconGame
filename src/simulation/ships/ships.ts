import type { ResourceQuantity, TransportableResourceType } from '../planet/claims';
import type { Facility } from '../planet/facility';
import type { GameState, Planet } from '../planet/planet';
import {
    electronicComponentResourceType,
    machineryResourceType,
    plasticResourceType,
    steelResourceType,
} from '../planet/resources';
import type { PassengerManifest } from './manifest';
import type { EducationLevelType } from '../population/population';
import type { TransitionResult } from './shipHandlers';
import { applyMaintenance, constructionHandlers, passengerHandlers, transportHandlers } from './shipHandlers';

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

export type PassengerShipType = BaseShipType & {
    type: 'passenger';
    passengerCapacity: number;
};

export type TransportShipType = BaseShipType & {
    type: 'transport';
    cargoSpecification: {
        type: TransportableResourceType; // type of resource this ship can carry
        volume: number; // in cubic meters
        mass: number; // in tons
    };
};

export type ShipType = ConstructionShipType | TransportShipType | PassengerShipType;

// ship status types
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

export type ShipStatusLost = {
    type: 'lost';
    lostAtTick: number;
};

export type CommonShipStatus = ShipStatusIdle | ShipStatusListed | ShipStatusDerelict | ShipStatusLost;

export type BaseShipStatusLoading = {
    planetId: string;
    to: string;
    contractId?: string;
    posterAgentId?: string;
    deadlineTick?: number;
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

export type PassengerShipStatusLoading = BaseShipStatusLoading & {
    type: 'passenger_boarding';
    passengerGoal: number;
    currentPassengers: number;
    manifest: PassengerManifest;
};

export type Provision = {
    groceryProvisioned: { currently: number; goal: number };
    healthcareProvisioned: { currently: number; goal: number };
    educationProvisioned: { currently: number; goal: number };
};
export type PassengerShipStatusProvisioning = BaseShipStatusLoading &
    Provision & {
        type: 'passenger_provisioning';
        passengerCount: number;
        manifest: PassengerManifest;
    };

export type BaseShipStatusTransporting = {
    from: string; // planet id
    to: string; // planet id
    arrivalTick: number; // tick when the ship will arrive at destination
    contractId?: string;
    posterAgentId?: string;
};

export type PassengerShipStatusTransporting = BaseShipStatusTransporting & {
    type: 'passenger_transporting';
    manifest: PassengerManifest;
};

export type TransportShipStatusTransporting = BaseShipStatusTransporting & {
    type: 'transporting';
    cargo: ResourceQuantity | null;
};

export type ConstructionShipStatusTransporting = BaseShipStatusTransporting & {
    type: 'construction_transporting';
    buildingTarget: Facility | null;
};

export type BaseShipStatusUnloading = {
    planetId: string;
    contractId?: string;
    posterAgentId?: string;
};

export type PassengerShipStatusUnloading = BaseShipStatusUnloading & {
    type: 'passenger_unloading';
    manifest: PassengerManifest;
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

export type TransportShipStatus =
    | CommonShipStatus
    | TransportShipStatusTransporting
    | TransportShipStatusLoading
    | TransportShipStatusUnloading;

export type TransportShipStatusType = TransportShipStatus['type'];

export type ConstructionShipStatus =
    | CommonShipStatus
    | ConstructionShipStatusTransporting
    | ConstructionShipStatusLoading
    | ConstructionShipStatusUnloading;

export type ConstructionShipStatusType = ConstructionShipStatus['type'];

export type PassengerShipStatus =
    | CommonShipStatus
    | PassengerShipStatusLoading
    | PassengerShipStatusProvisioning
    | PassengerShipStatusTransporting
    | PassengerShipStatusUnloading;

export type PassengerShipStatusType = PassengerShipStatus['type'];

export type ShipState = TransportShipStatus | ConstructionShipStatus | PassengerShipStatus;

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

export type PassengerShip = BaseShip & {
    type: PassengerShipType;
    state: PassengerShipStatus;
};

export type Ship = TransportShip | ConstructionShip | PassengerShip;

export const shipTick = (gameState: GameState): void => {
    for (const agent of gameState.agents.values()) {
        for (const ship of agent.ships) {
            if (ship.state.type === 'derelict' || ship.state.type === 'lost') {
                continue;
            }

            if (applyMaintenance(ship, agent, gameState)) {
                continue;
            }

            let result: TransitionResult;
            if (ship.type.type === 'transport') {
                result = transportHandlers[ship.state.type as TransportShipStatusType](
                    ship as TransportShip,
                    gameState,
                    agent,
                );
            } else if (ship.type.type === 'construction') {
                result = constructionHandlers[ship.state.type as ConstructionShipStatusType](
                    ship as ConstructionShip,
                    gameState,
                    agent,
                );
            } else {
                result = passengerHandlers[ship.state.type as PassengerShipStatusType](
                    ship as PassengerShip,
                    gameState,
                    agent,
                );
            }

            if (result.action === 'transition') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ship.state = result.newState as any;
            }
        }
    }
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

export const passengerLiner: PassengerShipType = {
    type: 'passenger',
    name: 'Passenger Liner',
    scale: 'large',
    speed: 8,
    passengerCapacity: 50_000,
    requiredCrew: {
        none: 0,
        primary: 10,
        secondary: 8,
        tertiary: 4,
    },
    buildingCost: [
        { resource: steelResourceType, quantity: 600 },
        { resource: electronicComponentResourceType, quantity: 200 },
        { resource: machineryResourceType, quantity: 150 },
        { resource: plasticResourceType, quantity: 100 },
    ],
    buildingTime: 240,
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

    frozenGoods: {
        reefer1: smallReefer,
        reefer2: scaleShipType('medium', 'Reefer 2', smallReefer),
        reefer3: scaleShipType('large', 'Reefer 3', smallReefer),
        reefer4: scaleShipType('super', 'Reefer 4', smallReefer),
    } as const,

    passenger: {
        liner: passengerLiner,
    } as const,
} as const;

export type ShipTypeKey = {
    [K in keyof typeof shiptypes]: keyof (typeof shiptypes)[K];
}[keyof typeof shiptypes];

export const createShip = (
    shipTemplate: TransportShipType | ConstructionShipType | PassengerShipType,
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
    if (shipTemplate.type === 'passenger') {
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
        } satisfies PassengerShip;
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
    } satisfies TransportShip;
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
    emaPrice: Record<string, number>;
};

export type ContractStatus = 'open' | 'accepted';

export type ShipBuyingOffer = {
    id: string;
    shipType: ShipTypeKey;
    buyerAgentId: string;
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
