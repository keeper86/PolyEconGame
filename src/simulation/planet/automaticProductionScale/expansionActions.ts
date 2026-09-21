import type { Facility, FacilityBase, ManagementFacility, ProductionFacility } from '../facility';
import { calculateCostsForConstruction, getFacilityType } from '../facility';
import type { AgentPlanetAssets, Planet } from '../planet';
import { checkExpansionFunds } from './expansionUtils';

export function initiateCapacityExpansion(
    facility: FacilityBase,
    assets: AgentPlanetAssets,
    planet: Planet,
    hasOwnConstruction: boolean,
    targetMax: number,
): boolean {
    const facilityType = getFacilityType(facility as Facility);
    const { cost, time } = calculateCostsForConstruction(facilityType, facility.maxScale, targetMax);

    if (!hasOwnConstruction) {
        const fundsCheck = checkExpansionFunds(
            facility as ManagementFacility | ProductionFacility,
            assets,
            planet,
            cost,
            time,
        );
        if (!fundsCheck.hasSufficientFunds) {
            return false;
        }
    }

    facility.construction = {
        type: 'expansion',
        constructionTargetMaxScale: targetMax,
        totalConstructionServiceRequired: cost,
        maximumConstructionServiceConsumption: cost / time,
        progress: 0,
        lastTickInvestedConstructionServices: 0,
        suspended: false,
    };
    return true;
}
