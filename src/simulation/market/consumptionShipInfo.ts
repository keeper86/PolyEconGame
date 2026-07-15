import type { ConstructionShip, Ship, TransportShip } from '../ships/ships';

// ── Slim ship info needed for consumption computation ──────────────────────
// Plain TypeScript interface (no zod dependency) so it can be used both in
// the simulation worker and server code without pulling zod into the worker
// bundle.

export type ConsumptionShipInfo = {
    id: string;
    type: { type: string };
    state: {
        type: string;
        planetId: string;
        cargoGoal: { resource: { name: string }; quantity: number } | null;
        currentCargo: { resource: { name: string }; quantity: number } | null;
        buildingTarget: {
            construction: { maximumConstructionServiceConsumption: number } | null;
        } | null;
    };
};

export function toConsumptionShipInfo(ship: Ship): ConsumptionShipInfo {
    const base: ConsumptionShipInfo['state'] = {
        type: ship.state.type,
        planetId: 'planetId' in ship.state ? ship.state.planetId : '',
        cargoGoal: null,
        currentCargo: null,
        buildingTarget: null,
    };

    const state = ship.state;

    // Transport ship states that carry cargo
    if (state.type === 'loading' || state.type === 'unloading' || state.type === 'transporting') {
        const ts = state as TransportShip['state'];
        if ('cargoGoal' in ts) {
            base.cargoGoal = ts.cargoGoal;
        }
        if ('currentCargo' in ts) {
            base.currentCargo = ts.currentCargo;
        }
    }

    // Construction ship states that carry a building target
    if (state.type === 'pre-fabrication' || state.type === 'reconstruction') {
        const cs = state as ConstructionShip['state'];
        if ('buildingTarget' in cs) {
            base.buildingTarget = cs.buildingTarget as ConsumptionShipInfo['state']['buildingTarget'];
        }
    }

    return { id: ship.id, type: { type: ship.type.type }, state: base };
}
