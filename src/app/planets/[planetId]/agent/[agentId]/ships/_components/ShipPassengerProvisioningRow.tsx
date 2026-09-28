'use client';

import { ProductQuantity } from '@/components/client/ProductQuantity';
import { formatNumberWithUnit } from '@/lib/utils';
import {
    educationServiceResourceType,
    groceryServiceResourceType,
    healthcareServiceResourceType,
} from '@/simulation/planet/services';
import type { PassengerShipStatusProvisioning } from '@/simulation/ships/ships';
import { ArrowRight } from 'lucide-react';
import React from 'react';
import { countManifestPassengers } from './PassengerManifestDialog';
import { PassengerManifestButton } from './PassengerManifestButton';
import { planetName, type PlanetSummary } from './shipFormatting';

function provisionEfficiency(provision: { currently: number; goal: number }): number {
    return provision.goal > 0 ? Math.min(provision.currently / provision.goal, 1) : 1;
}

export function ShipPassengerProvisioningRow({
    state,
    planetSummaries,
    agentId,
}: {
    state: PassengerShipStatusProvisioning;
    planetSummaries: PlanetSummary[];
    agentId: string;
}): React.ReactElement {
    const total = countManifestPassengers(state.manifest);
    const grocery = state.groceryProvisioned;
    const healthcare = state.healthcareProvisioned;
    const education = state.educationProvisioned;
    const groceryEff = provisionEfficiency(grocery);
    const healthcareEff = provisionEfficiency(healthcare);
    const educationEff = provisionEfficiency(education);
    const minEff = Math.min(groceryEff, healthcareEff, educationEff);
    const destination = planetName(planetSummaries, state.to);

    return (
        <div className='space-y-1.5'>
            <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
                <span>
                    Provisioning{' '}
                    <span className='tabular-nums text-foreground'>{formatNumberWithUnit(total, 'persons')}</span>{' '}
                    passengers
                </span>
                <ArrowRight className='h-3 w-3' />
                <span>{destination}</span>
                <PassengerManifestButton manifest={state.manifest} toPlanetName={destination} phase={state.type} />
            </div>
            <div className='flex gap-2 flex-wrap'>
                <ProductQuantity
                    resource={groceryServiceResourceType}
                    quantity={grocery.currently}
                    efficiency={groceryEff}
                    isLimiting={groceryEff === minEff}
                    planetId={state.planetId}
                    agentId={agentId}
                    quantityLabel={`${formatNumberWithUnit(grocery.currently, 'units')} (${formatNumberWithUnit(grocery.goal, 'units')})`}
                />
                <ProductQuantity
                    resource={healthcareServiceResourceType}
                    quantity={healthcare.currently}
                    efficiency={healthcareEff}
                    isLimiting={healthcareEff === minEff}
                    planetId={state.planetId}
                    agentId={agentId}
                    quantityLabel={`${formatNumberWithUnit(healthcare.currently, 'units')} (${formatNumberWithUnit(healthcare.goal, 'units')})`}
                />
                {education.goal > 0 && (
                    <ProductQuantity
                        resource={educationServiceResourceType}
                        quantity={education.currently}
                        efficiency={educationEff}
                        isLimiting={educationEff === minEff}
                        planetId={state.planetId}
                        agentId={agentId}
                        quantityLabel={`${formatNumberWithUnit(education.currently, 'units')} (${formatNumberWithUnit(education.goal, 'units')})`}
                    />
                )}
            </div>
        </div>
    );
}
