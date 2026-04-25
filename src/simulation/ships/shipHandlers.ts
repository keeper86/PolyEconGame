/**
 * Per-state handler functions for shipTick.
 *
 * Each handler encapsulates the logic for a single ship state type and returns
 * a TransitionResult describing whether the state should change. The main
 * shipTick loop applies the result.
 *
 * Shared helpers (applyMaintenance, travelTime, settleTransportContract,
 * settleConstructionContract) are also exported so they can be tested in
 * isolation.
 */

import {
    EPSILON,
    MAX_DISPATCH_TIMEOUT_TICKS,
    MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE,
    TICKS_PER_YEAR,
} from '../constants';
import type { Facility, ProductionFacility } from '../planet/facility';
import {
    MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
    putIntoStorageFacility,
    removeFromStorageFacility,
    transferFromEscrow,
} from '../planet/facility';
import type { Agent, GameState } from '../planet/planet';
import { consumeConstructionForFacility } from '../planet/production';
import {
    educationServiceResourceType,
    groceryServiceResourceType,
    healthcareServiceResourceType,
    maintenanceServiceResourceType,
} from '../planet/services';
import {
    advanceManifestAge,
    boardPassengersFromWorkforce,
    calculateProvisions,
    refundBoardedPassengers,
    unloadPassengersToPlanet,
} from '../population/manifest';
import type {
    ConstructionContract,
    ConstructionShip,
    ConstructionShipStatus,
    ConstructionShipStatusLoading,
    ConstructionShipStatusTransporting,
    ConstructionShipStatusType,
    ConstructionShipStatusUnloading,
    PassengerShip,
    PassengerShipStatus,
    PassengerShipStatusLoading,
    PassengerShipStatusProvisioning,
    PassengerShipStatusType,
    Ship,
    ShipStatusDerelict,
    ShipStatusIdle,
    TransportShip,
    TransportShipStatus,
    TransportShipStatusLoading,
    TransportShipStatusType,
    TransportShipStatusUnloading,
} from './ships';

export type TransitionResult =
    | { action: 'stay' }
    | { action: 'transition'; newState: TransportShipStatus | ConstructionShipStatus | PassengerShipStatus };

const STAY: TransitionResult = { action: 'stay' };

export function travelTime(ship: Ship): number {
    return Math.ceil(1000 / ship.type.speed);
}

export function applyMaintenance(ship: Ship, agent: Agent, gameState: GameState): boolean {
    // Degradation rate depends on ship activity
    let maintenanceDecreasePerYear = 0.05;
    if (
        ship.state.type === 'transporting' ||
        ship.state.type === 'construction_transporting' ||
        ship.state.type === 'passenger_transporting'
    ) {
        maintenanceDecreasePerYear *= 5;
    }
    if (ship.state.type === 'idle' || ship.state.type === 'listed') {
        maintenanceDecreasePerYear /= 5;
    }
    ship.maintainanceStatus = Math.max(0, ship.maintainanceStatus - maintenanceDecreasePerYear / TICKS_PER_YEAR);

    // Repair is only possible when the ship is sitting at a planet with storage
    if (ship.state.type !== 'idle' && ship.state.type !== 'listed') {
        return false;
    }

    const planetId = ship.state.planetId;
    const assets = agent.assets[planetId];
    const storage = assets?.storageFacility;
    if (!storage) {
        return false;
    }

    const maintenancePerTick = Math.min(1, 3 / ship.type.buildingTime);
    const maintenanceNeeded = Math.min(maintenancePerTick, ship.maxMaintenance - ship.maintainanceStatus);
    const consumed = removeFromStorageFacility(storage, maintenanceServiceResourceType.name, maintenanceNeeded);
    if (consumed <= 0) {
        return false;
    }

    ship.maintainanceStatus = Math.min(ship.maxMaintenance, ship.maintainanceStatus + consumed);
    assets.monthAcc.consumptionValue +=
        consumed * (gameState.planets.get(planetId)?.marketPrices[maintenanceServiceResourceType.name] ?? 0);

    // Aging: accumulate repair; degrade maxMaintenance after each full cycle
    ship.cumulativeRepairAcc += consumed;
    while (ship.cumulativeRepairAcc >= 1.0) {
        ship.cumulativeRepairAcc -= 1.0;
        ship.maxMaintenance = Math.max(0, ship.maxMaintenance - MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE);
    }

    if (ship.maxMaintenance > 0) {
        return false;
    }

    // Transition to derelict
    ship.maintainanceStatus = 0;
    if (ship.state.type === 'listed') {
        const listingAssets = agent.assets[planetId];
        if (listingAssets) {
            listingAssets.shipListings = listingAssets.shipListings.filter((l) => l.shipName !== ship.name);
        }
    }
    ship.state = { type: 'derelict', planetId } satisfies ShipStatusDerelict;
    return true;
}

export function settleTransportContract(
    shipName: string,
    carrierAgentId: string,
    arrivedPlanetId: string,
    gameState: GameState,
): void {
    const carrierAgent = gameState.agents.get(carrierAgentId);

    for (const posterAgent of gameState.agents.values()) {
        for (const posterAssets of Object.values(posterAgent.assets)) {
            const contract = posterAssets.transportContracts.find(
                (c) =>
                    c.status === 'accepted' &&
                    c.acceptedByAgentId === carrierAgentId &&
                    c.shipName === shipName &&
                    c.toPlanetId === arrivedPlanetId,
            );
            if (contract) {
                if (contract.status === 'accepted') {
                    const index = posterAssets.transportContracts.indexOf(contract);
                    if (index === -1) {
                        console.warn(
                            `Contract not found in poster's assets for delivered cargo on ship ${shipName} owned by agent ${carrierAgentId}`,
                        );
                        break;
                    }
                    posterAssets.transportContracts.splice(index, 1);
                    posterAssets.depositHold -= contract.offeredReward;
                    const carrierAssets =
                        carrierAgent?.assets[arrivedPlanetId] ??
                        (carrierAgent ? carrierAgent.assets[carrierAgent.associatedPlanetId] : undefined);
                    if (carrierAssets) {
                        carrierAssets.deposits += contract.offeredReward;
                    }
                }
                break;
            } else {
                console.warn(
                    `No matching contract found for delivered cargo on ship ${shipName} owned by agent ${carrierAgentId}`,
                );
            }
        }
    }
}

export function settleConstructionContract(
    contractId: string,
    buildingTarget: Facility,
    carrierAgentId: string,
    arrivedPlanetId: string,
    gameState: GameState,
): void {
    const carrierAgent = gameState.agents.get(carrierAgentId);

    let receivingAgentId: string = carrierAgentId;
    let matched = false;

    for (const posterAgent of gameState.agents.values()) {
        for (const posterAssets of Object.values(posterAgent.assets)) {
            const contract = posterAssets.constructionContracts.find(
                (c): c is ConstructionContract & { status: 'accepted' } =>
                    c.id === contractId && c.status === 'accepted',
            );
            if (contract) {
                matched = true;
                receivingAgentId = contract.commissioningAgentId;
                const idx = posterAssets.constructionContracts.indexOf(contract);
                posterAssets.constructionContracts[idx] = { ...contract, status: 'completed' };
                posterAssets.depositHold -= contract.offeredReward;
                const carrierAssets =
                    carrierAgent?.assets[arrivedPlanetId] ??
                    (carrierAgent ? carrierAgent.assets[carrierAgent.associatedPlanetId] : undefined);
                if (carrierAssets) {
                    carrierAssets.deposits += contract.offeredReward;
                }
                break;
            }
        }
        if (matched) {
            break;
        }
    }

    // Place the facility into the receiving agent's assets
    const receivingAgent = gameState.agents.get(receivingAgentId);
    if (receivingAgent) {
        const destAssets = receivingAgent.assets[arrivedPlanetId];
        if (destAssets) {
            const placedFacility = structuredClone({ ...buildingTarget, planetId: arrivedPlanetId });
            destAssets.productionFacilities.push(placedFacility as ProductionFacility);
        }
    }
}

// ---------------------------------------------------------------------------
// Transport ship handlers
// ---------------------------------------------------------------------------

function handleIdle(_ship: Ship, _ctx: GameState, _agent: Agent): TransitionResult {
    // Maintenance is applied before dispatch; nothing further to do.
    return STAY;
}

function handleListed(_ship: Ship, _ctx: GameState, _agent: Agent): TransitionResult {
    return STAY;
}

function handleTransportLoading(ship: TransportShip, ctx: GameState, agent: Agent): TransitionResult {
    const s = ship.state as TransportShipStatusLoading;

    // Dispatch timeout — abort mission, go idle
    if (s.deadlineTick !== undefined && ctx.tick > s.deadlineTick) {
        return { action: 'transition', newState: { type: 'idle', planetId: s.planetId } satisfies ShipStatusIdle };
    }

    if (!s.cargoGoal) {
        return {
            action: 'transition',
            newState: {
                type: 'transporting',
                from: s.planetId,
                to: s.to,
                cargo: s.currentCargo,
                arrivalTick: ctx.tick + travelTime(ship),
            },
        };
    }

    const storageAgent = s.posterAgentId ? (ctx.agents.get(s.posterAgentId) ?? agent) : agent;
    const storage = storageAgent.assets[s.planetId]?.storageFacility;
    if (!storage) {
        return {
            action: 'transition',
            newState: {
                type: 'transporting',
                from: s.planetId,
                to: s.to,
                cargo: s.currentCargo,
                arrivalTick: ctx.tick + travelTime(ship),
            },
        };
    }

    const missingCargo = s.cargoGoal.quantity - s.currentCargo.quantity;
    const removedQuantity = s.contractId
        ? transferFromEscrow(storage, s.cargoGoal.resource.name, missingCargo)
        : removeFromStorageFacility(storage, s.cargoGoal.resource.name, missingCargo);
    s.currentCargo.quantity += removedQuantity;

    if (removedQuantity === missingCargo) {
        return {
            action: 'transition',
            newState: {
                type: 'transporting',
                from: s.planetId,
                to: s.to,
                cargo: s.currentCargo,
                arrivalTick: ctx.tick + travelTime(ship),
            },
        };
    }
    return STAY;
}

function handleTransporting(ship: TransportShip, ctx: GameState): TransitionResult {
    const s = ship.state;
    if (s.type !== 'transporting') {
        return STAY;
    }
    if (ctx.tick < s.arrivalTick) {
        return STAY;
    }

    const cargo = s.cargo;
    if (!cargo) {
        return { action: 'transition', newState: { type: 'idle', planetId: s.to } };
    }
    return {
        action: 'transition',
        newState: { type: 'unloading', planetId: s.to, cargo } satisfies TransportShipStatusUnloading,
    };
}

function handleTransportUnloading(ship: TransportShip, ctx: GameState, agent: Agent): TransitionResult {
    const s = ship.state as TransportShipStatusUnloading;
    const assets = agent.assets[s.planetId];
    if (!assets) {
        return STAY;
    }
    const storage = assets.storageFacility;
    if (!storage) {
        return STAY;
    }

    if (s.cargo) {
        const stored = putIntoStorageFacility(storage, s.cargo.resource, s.cargo.quantity);
        s.cargo.quantity -= stored;
        if (s.cargo.quantity > EPSILON) {
            return STAY;
        }
    }

    const arrivedPlanetId = s.planetId;
    // Settle any matching transport contract
    settleTransportContract(ship.name, agent.id, arrivedPlanetId, ctx);
    return { action: 'transition', newState: { type: 'idle', planetId: arrivedPlanetId } };
}

// ---------------------------------------------------------------------------
// Construction ship handlers
// ---------------------------------------------------------------------------

function handlePreFabrication(ship: ConstructionShip, ctx: GameState, agent: Agent): TransitionResult {
    const s = ship.state as ConstructionShipStatusLoading;

    // Dispatch timeout — abort, go idle
    if (s.deadlineTick !== undefined && ctx.tick > s.deadlineTick) {
        return { action: 'transition', newState: { type: 'idle', planetId: s.planetId } };
    }

    if (!s.buildingTarget) {
        return {
            action: 'transition',
            newState: {
                type: 'construction_transporting',
                from: s.planetId,
                to: s.to,
                buildingTarget: null,
                arrivalTick: ctx.tick + travelTime(ship),
            } satisfies ConstructionShipStatusTransporting,
        };
    }

    const target = s.buildingTarget;
    if (target.construction === null) {
        return {
            action: 'transition',
            newState: {
                type: 'construction_transporting',
                from: s.planetId,
                to: s.to,
                buildingTarget: target,
                arrivalTick: ctx.tick + travelTime(ship),
                contractId: s.contractId,
                posterAgentId: s.posterAgentId,
            } satisfies ConstructionShipStatusTransporting,
        };
    }

    const assets = agent.assets[s.planetId];
    consumeConstructionForFacility(target, assets?.storageFacility);
    s.progress = target.construction?.progress ?? s.progress;
    return STAY;
}

function handleConstructionTransporting(ship: ConstructionShip, ctx: GameState): TransitionResult {
    const s = ship.state as ConstructionShipStatusTransporting;
    if (ctx.tick < s.arrivalTick) {
        return STAY;
    }

    const target = s.buildingTarget;
    if (!target) {
        return { action: 'transition', newState: { type: 'idle', planetId: s.to } };
    }
    return {
        action: 'transition',
        newState: {
            type: 'reconstruction',
            planetId: s.to,
            buildingTarget: target,
            progress: 1,
            contractId: s.contractId,
        } satisfies ConstructionShipStatusUnloading,
    };
}

function handleReconstruction(ship: ConstructionShip, ctx: GameState, agent: Agent): TransitionResult {
    const s = ship.state as ConstructionShipStatusUnloading;
    const updatedProgress = Math.max(0, s.progress - 1 / MINIMUM_CONSTRUCTION_TIME_IN_TICKS);
    s.progress = updatedProgress;

    if (updatedProgress > 0) {
        return STAY;
    }

    const arrivedPlanetId = s.planetId;

    if (s.contractId) {
        settleConstructionContract(s.contractId, s.buildingTarget, agent.id, arrivedPlanetId, ctx);
    } else {
        // No contract — place facility directly for the carrying agent
        const destAssets = agent.assets[arrivedPlanetId];
        if (destAssets) {
            const placedFacility = structuredClone({ ...s.buildingTarget, planetId: arrivedPlanetId });
            destAssets.productionFacilities.push(placedFacility as ProductionFacility);
        }
    }

    return { action: 'transition', newState: { type: 'idle', planetId: arrivedPlanetId } };
}

// ---------------------------------------------------------------------------
// Passenger ship handlers
// ---------------------------------------------------------------------------

function handlePassengerBoarding(ship: PassengerShip, ctx: GameState, agent: Agent): TransitionResult {
    const shipState = ship.state as PassengerShipStatusLoading;

    // Dispatch timeout — de-board any passengers already on the manifest back
    // to the source planet, then go idle.
    if (shipState.deadlineTick !== undefined && ctx.tick > shipState.deadlineTick) {
        const sourcePlanet = ctx.planets.get(shipState.planetId);
        if (sourcePlanet && Object.keys(shipState.manifest).length > 0) {
            unloadPassengersToPlanet(sourcePlanet, shipState.manifest);
        }
        return { action: 'transition', newState: { type: 'idle', planetId: shipState.planetId } };
    }

    const sourcePlanet = ctx.planets.get(shipState.planetId);
    if (!sourcePlanet) {
        return { action: 'transition', newState: { type: 'idle', planetId: shipState.planetId } };
    }

    const needed = shipState.passengerGoal - shipState.currentPassengers;
    const boarded = boardPassengersFromWorkforce(agent, sourcePlanet, shipState.planetId, shipState.manifest, needed);
    shipState.currentPassengers += boarded;

    const goalReached = shipState.currentPassengers >= shipState.passengerGoal;
    const noMoreAvailable = boarded === 0 && shipState.currentPassengers > 0;
    // No workers available at all — abort immediately
    const noWorkersAtAll = boarded === 0 && shipState.currentPassengers === 0;

    if (noWorkersAtAll) {
        return { action: 'transition', newState: { type: 'idle', planetId: shipState.planetId } };
    }

    if (!goalReached && !noMoreAvailable) {
        return STAY;
    }

    // Boarding complete — hand off to provisioning phase.
    const provisionsTracker = calculateProvisions(shipState.manifest, travelTime(ship));
    return {
        action: 'transition',
        newState: {
            type: 'passenger_provisioning',
            planetId: shipState.planetId,
            to: shipState.to,
            manifest: shipState.manifest,
            deadlineTick: ctx.tick + MAX_DISPATCH_TIMEOUT_TICKS,
            ...provisionsTracker,
        } satisfies PassengerShipStatusProvisioning,
    };
}

function handlePassengerProvisioning(ship: PassengerShip, gameState: GameState, agent: Agent): TransitionResult {
    const shipState = ship.state;
    if (shipState.type !== 'passenger_provisioning') {
        return STAY;
    }

    // Provisioning timeout — refund passengers and go idle.
    if (shipState.deadlineTick !== undefined && gameState.tick > shipState.deadlineTick) {
        const sourcePlanet = gameState.planets.get(shipState.planetId);
        if (sourcePlanet && Object.keys(shipState.manifest).length > 0) {
            refundBoardedPassengers(agent, sourcePlanet, shipState.planetId, shipState.manifest);
        }
        return { action: 'transition', newState: { type: 'idle', planetId: shipState.planetId } };
    }

    const storage = gameState.agents.get(agent.id)?.assets[shipState.planetId]?.storageFacility;
    if (!storage) {
        return STAY;
    }

    shipState.groceryProvisioned.currently += removeFromStorageFacility(
        storage,
        groceryServiceResourceType.name,
        shipState.groceryProvisioned.goal - shipState.groceryProvisioned.currently,
    );
    shipState.healthcareProvisioned.currently += removeFromStorageFacility(
        storage,
        healthcareServiceResourceType.name,
        shipState.healthcareProvisioned.goal - shipState.healthcareProvisioned.currently,
    );
    shipState.educationProvisioned.currently += removeFromStorageFacility(
        storage,
        educationServiceResourceType.name,
        shipState.educationProvisioned.goal - shipState.educationProvisioned.currently,
    );

    const provisionsOk =
        shipState.groceryProvisioned.currently >= shipState.groceryProvisioned.goal &&
        shipState.healthcareProvisioned.currently >= shipState.healthcareProvisioned.goal &&
        shipState.educationProvisioned.currently >= shipState.educationProvisioned.goal;

    if (!provisionsOk) {
        return STAY;
    } // Wait for production to catch up

    const flightTicks = travelTime(ship);
    const travelYears = flightTicks / TICKS_PER_YEAR;
    return {
        action: 'transition',
        newState: {
            type: 'passenger_transporting',
            from: shipState.planetId,
            to: shipState.to,
            arrivalTick: gameState.tick + flightTicks,
            manifest: advanceManifestAge(shipState.manifest, travelYears),
        },
    };
}

function handlePassengerTransporting(ship: PassengerShip, ctx: GameState): TransitionResult {
    const s = ship.state;
    if (s.type !== 'passenger_transporting') {
        return STAY;
    }
    if (ctx.tick < s.arrivalTick) {
        return STAY;
    }

    const destPlanet = ctx.planets.get(s.to);
    if (!destPlanet) {
        return { action: 'transition', newState: { type: 'idle', planetId: s.from } };
    }

    // Unload immediately on arrival — no separate unloading tick needed
    unloadPassengersToPlanet(destPlanet, s.manifest);
    return { action: 'transition', newState: { type: 'idle', planetId: s.to } };
}

function handlePassengerUnloading(ship: PassengerShip, ctx: GameState, _agent: Agent): TransitionResult {
    const s = ship.state;
    if (s.type !== 'passenger_unloading') {
        return STAY;
    }

    const destPlanet = ctx.planets.get(s.planetId);
    if (!destPlanet) {
        return { action: 'transition', newState: { type: 'idle', planetId: s.planetId } };
    }

    unloadPassengersToPlanet(destPlanet, s.manifest);
    return { action: 'transition', newState: { type: 'idle', planetId: s.planetId } };
}

// ---------------------------------------------------------------------------
// Dispatch tables
// ---------------------------------------------------------------------------

export const transportHandlers: Record<
    TransportShipStatusType,
    (ship: TransportShip, ctx: GameState, agent: Agent) => TransitionResult
> = {
    idle: handleIdle,
    listed: handleListed,
    loading: handleTransportLoading,
    transporting: handleTransporting,
    unloading: handleTransportUnloading,
    derelict: () => STAY, // Never reached — derelict is skipped before dispatch
    lost: () => STAY, // Never reached — lost is skipped before dispatch
};

export const constructionHandlers: Record<
    ConstructionShipStatusType,
    (ship: ConstructionShip, ctx: GameState, agent: Agent) => TransitionResult
> = {
    'idle': handleIdle,
    'listed': handleListed,
    'pre-fabrication': handlePreFabrication,
    'construction_transporting': handleConstructionTransporting,
    'reconstruction': handleReconstruction,
    'derelict': () => STAY,
    'lost': () => STAY,
};

export const passengerHandlers: Record<
    PassengerShipStatusType,
    (ship: PassengerShip, ctx: GameState, agent: Agent) => TransitionResult
> = {
    idle: handleIdle,
    listed: handleListed,
    passenger_boarding: handlePassengerBoarding,
    passenger_provisioning: handlePassengerProvisioning,
    passenger_transporting: handlePassengerTransporting,
    passenger_unloading: handlePassengerUnloading,
    derelict: () => STAY,
    lost: () => STAY,
};
