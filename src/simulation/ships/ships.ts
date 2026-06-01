import type { Resource, ResourceQuantity, TransportableResourceType } from '../planet/claims';
import type { Facility } from '../planet/facility';
import type { GameState, Planet } from '../planet/planet';
import {
    defaultBuildingCost,
    electronicComponentResourceType,
    machineryResourceType,
    plasticResourceType,
    steelResourceType,
} from '../planet/resources';
import type { EducationLevelType } from '../population/population';
import type { PassengerManifest } from './manifest';
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
    currentCargo: ResourceQuantity | null;
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
    id: string;
    name: string;
    builtAtTick: number;
    idleAtTick?: number; // tick at which the ship last became idle; undefined for legacy deserialized ships
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
        | { status: 'accepted'; acceptedByAgentId: string; shipId: string; fulfillmentDueAtTick: number }
        | { status: 'completed' }
    );

export type PassengerShip = BaseShip & {
    type: PassengerShipType;
    state: PassengerShipStatus;
};

export type Ship = TransportShip | ConstructionShip | PassengerShip;

// ---------------------------------------------------------------------------
// Transport pipeline helpers
// ---------------------------------------------------------------------------

function addPipelineEntry(planets: Map<string, Planet>, toPlanetId: string, cargo: ResourceQuantity): void {
    const planet = planets.get(toPlanetId);
    if (!planet) {
        return;
    }
    const existing = planet.transportPipeline[cargo.resource.name];
    if (existing) {
        existing.quantity += cargo.quantity;
    } else {
        planet.transportPipeline[cargo.resource.name] = { ...cargo };
    }
}

function removePipelineEntry(planets: Map<string, Planet>, toPlanetId: string, cargo: ResourceQuantity): void {
    const planet = planets.get(toPlanetId);
    if (!planet) {
        return;
    }
    const existing = planet.transportPipeline[cargo.resource.name];
    if (existing) {
        existing.quantity = Math.max(0, existing.quantity - cargo.quantity);
    }
}

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
                const oldState = ship.state;
                ship.state = result.newState;
                if (ship.type.type === 'transport') {
                    if (oldState.type === 'loading' && result.newState.type === 'transporting') {
                        const newTransporting = result.newState as TransportShipStatusTransporting;
                        if (newTransporting.cargo && newTransporting.cargo.quantity > 0) {
                            addPipelineEntry(gameState.planets, newTransporting.to, newTransporting.cargo);
                        }
                    } else if (oldState.type === 'transporting') {
                        const oldTransporting = oldState as TransportShipStatusTransporting;
                        if (oldTransporting.cargo && oldTransporting.cargo.quantity > 0) {
                            removePipelineEntry(gameState.planets, oldTransporting.to, oldTransporting.cargo);
                        }
                    }
                }
            }
        }
    }
};

export { defaultBuildingCost };

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
    name: 'Bulk Carrier 1',
    scale: 'small',
    speed: 6,
    cargoSpecification: { type: 'solid', volume: 200000, mass: 150000 },
    requiredCrew: { ...defaultRequiredCrew },
    buildingCost: [...defaultBuildingCost],
    buildingTime: 60,
};

const smallTanker: TransportShipType = {
    type: 'transport',
    name: 'Tanker 1',
    scale: 'small',
    speed: 5,
    cargoSpecification: { type: 'liquid', volume: 150000, mass: 120000 },
    requiredCrew: { ...defaultRequiredCrew },
    buildingCost: [...defaultBuildingCost],
    buildingTime: 60,
};

const smallGasCarrier: TransportShipType = {
    type: 'transport',
    name: 'Gas Carrier 1',
    scale: 'small',
    speed: 6,
    cargoSpecification: { type: 'gas', volume: 150000, mass: 120000 },
    requiredCrew: { ...defaultRequiredCrew },
    buildingCost: [...defaultBuildingCost],
    buildingTime: 60,
};

const smallFreighter: TransportShipType = {
    type: 'transport',
    name: 'Freighter 1',
    scale: 'small',
    speed: 8,
    cargoSpecification: { type: 'pieces', volume: 100000, mass: 80000 },
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
            id: crypto.randomUUID(),
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
            idleAtTick: builtAtTick,
        };
    }
    if (shipTemplate.type === 'passenger') {
        return {
            id: crypto.randomUUID(),
            name,
            builtAtTick,
            idleAtTick: builtAtTick,
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
        id: crypto.randomUUID(),
        name,
        builtAtTick,
        idleAtTick: builtAtTick,
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
    shipId: string;
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

/**
 * Returns true if the given transport ship can carry the given resource.
 * Solid/liquid/gas/pieces resources are matched against the ship's cargo spec type.
 * Services, land-bound resources, and currencies cannot be transported.
 */
export function canCarryResource(ship: Ship, resource: Resource): boolean {
    if (ship.type.type !== 'transport') {
        return false;
    }
    const form = resource.form;
    if (form === 'services' || form === 'landBoundResource' || form === 'currency') {
        return false;
    }
    return ship.type.cargoSpecification.type === (form as TransportableResourceType);
}

export type ContractStatus = 'open' | 'accepted';

export type ShipBuyingOffer = {
    id: string;
    shipType: ShipTypeKey;
    buyerAgentId: string;
    price: number;
} & ({ status: 'open' } | { status: 'accepted'; sellerAgentId: string; shipId: string });

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
        | { status: 'accepted'; acceptedByAgentId: string; shipId: string; fulfillmentDueAtTick: number }
    );
