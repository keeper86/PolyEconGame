import { ALL_PRODUCTION_FACILITY_ENTRIES } from './productionFacilities';
import type { ProductionFacility } from './facility';
import type { GameState } from './planet';

export type RecipeBackfillResult = {
    updated: number;
    unknownNames: string[];
};

export function recipeTemplatesByName(): Map<string, ProductionFacility> {
    const templates = new Map<string, ProductionFacility>();
    for (const { template } of Object.values(ALL_PRODUCTION_FACILITY_ENTRIES)) {
        templates.set(template.name, template);
    }
    return templates;
}

export function backfillRecipes(state: GameState): RecipeBackfillResult {
    const templates = recipeTemplatesByName();
    const unknownNames = new Set<string>();
    let updated = 0;

    for (const agent of state.agents.values()) {
        for (const assets of Object.values(agent.assets)) {
            for (const facility of assets.productionFacilities) {
                const template = templates.get(facility.name);
                if (!template) {
                    unknownNames.add(facility.name);
                    continue;
                }

                facility.needs = template.needs.map((quantity) => ({ ...quantity }));
                facility.produces = template.produces.map((quantity) => ({ ...quantity }));
                facility.workerRequirement = { ...template.workerRequirement };
                facility.powerConsumptionPerTick = template.powerConsumptionPerTick;
                facility.pollutionPerTick = { ...template.pollutionPerTick };
                updated++;
            }
        }
    }

    return { updated, unknownNames: [...unknownNames] };
}
