'use client';

import type { ConstructionShip, PassengerShip, Ship, TransportShip } from '@/simulation/ships/ships';
import React from 'react';
import { ShipConstructionTransportRow } from './ShipConstructionTransportRow';
import { ShipLoadingRow } from './ShipLoadingRow';
import { ShipPassengerBoardingRow } from './ShipPassengerBoardingRow';
import { ShipPassengerProvisioningRow } from './ShipPassengerProvisioningRow';
import { ShipPassengerTransportingRow } from './ShipPassengerTransportingRow';
import { ShipPassengerUnloadingRow } from './ShipPassengerUnloadingRow';
import { ShipPreFabricationRow } from './ShipPreFabricationRow';
import { ShipReconstructionRow } from './ShipReconstructionRow';
import { ShipTransportingRow } from './ShipTransportingRow';
import { ShipTransportUnloadingRow } from './ShipTransportUnloadingRow';
import type { PlanetSummary } from './shipFormatting';

type Props = {
    ship: Ship;
    planetSummaries: PlanetSummary[];
    tick: number;
    agentId: string;
};

export function ShipStatusDetail({ ship, planetSummaries, tick, agentId }: Props): React.ReactElement | null {
    if (ship.type.type === 'transport') {
        const state = (ship as TransportShip).state;
        if (state.type === 'loading') {
            return <ShipLoadingRow state={state} planetSummaries={planetSummaries} />;
        }
        if (state.type === 'transporting') {
            return <ShipTransportingRow state={state} planetSummaries={planetSummaries} tick={tick} />;
        }
        if (state.type === 'unloading') {
            return <ShipTransportUnloadingRow state={state} />;
        }
        return null;
    }

    if (ship.type.type === 'construction') {
        const state = (ship as ConstructionShip).state;
        if (state.type === 'pre-fabrication') {
            return <ShipPreFabricationRow state={state} planetSummaries={planetSummaries} />;
        }
        if (state.type === 'construction_transporting') {
            return <ShipConstructionTransportRow state={state} planetSummaries={planetSummaries} tick={tick} />;
        }
        if (state.type === 'reconstruction') {
            return <ShipReconstructionRow state={state} />;
        }
        return null;
    }

    if (ship.type.type === 'passenger') {
        const state = (ship as PassengerShip).state;
        if (state.type === 'passenger_boarding') {
            return <ShipPassengerBoardingRow state={state} planetSummaries={planetSummaries} />;
        }
        if (state.type === 'passenger_provisioning') {
            return <ShipPassengerProvisioningRow state={state} planetSummaries={planetSummaries} agentId={agentId} />;
        }
        if (state.type === 'passenger_transporting') {
            return <ShipPassengerTransportingRow state={state} planetSummaries={planetSummaries} tick={tick} />;
        }
        if (state.type === 'passenger_unloading') {
            return <ShipPassengerUnloadingRow state={state} planetSummaries={planetSummaries} />;
        }
        return null;
    }

    return null;
}
