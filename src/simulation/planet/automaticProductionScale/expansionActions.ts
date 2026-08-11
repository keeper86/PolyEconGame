import { processFacilityContraction } from '../../agents/recycler';
import type { Facility, FacilityBase, ManagementFacility, ProductionFacility } from '../facility';
import { calculateCostsForConstruction, getFacilityType } from '../facility';
import type { Agent, AgentPlanetAssets, GameState, Planet } from '../planet';
import { MAX_SCALE_CONTRACT_FRACTION } from './constants';
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
    };
    return true;
}

export function initiateCapacityContraction(
    facility: ProductionFacility,
    planet: Planet,
    agent: Agent,
    gameState: GameState,
): boolean {
    const currentMax = facility.maxScale;
    const targetMax = Math.max(1, Math.floor(currentMax * (1 - MAX_SCALE_CONTRACT_FRACTION)));
    if (targetMax >= currentMax) {
        return false;
    }

    return processFacilityContraction(planet, facility, agent, targetMax, gameState);
}
