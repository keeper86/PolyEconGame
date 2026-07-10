import { getServiceDefinitionByResourceName } from '@/simulation/market/serviceDefinitions';
import { ALL_FACILITY_ENTRIES } from '@/simulation/planet/productionFacilities';
import {
    administrativeServiceResourceType,
    constructionServiceResourceType,
    groceryServiceResourceType,
    healthcareServiceResourceType,
    logisticsServiceResourceType,
    retailServiceResourceType,
} from '@/simulation/planet/services';

const POPULATION_DEMANDED_SERVICES = [
    groceryServiceResourceType,
    healthcareServiceResourceType,
    administrativeServiceResourceType,
    logisticsServiceResourceType,
    retailServiceResourceType,
    constructionServiceResourceType,
];

const TOOL_PLANET = 'tool';
const TOOL_ID = 'preview';
const LEVEL_ORDER = ['source', 'raw', 'refined', 'manufactured', 'services'];

export interface ResourceBalance {
    resourceName: string;
    resourceLevel: string;
    resourceForm: string;

    isExternalSource: boolean;
    producedPerTick: number;
    consumedByFacilitiesPerTick: number;
    populationDemandPerTick: number;

    balance: number;
    producedBy: string[];
    consumedBy: string[];
}

export interface FacilityInfo {
    name: string;
    primaryOutputLevel: string;
    needs: { resourceName: string; quantity: number }[];
    produces: { resourceName: string; quantity: number }[];
    workerRequirement: { none: number; primary: number; secondary: number; tertiary: number };

    powerConsumptionPerTick: number;
}

export interface SupplyChainBalance {
    resources: ResourceBalance[];
    totalPowerConsumedPerTick: number;
    totalPowerProducedPerTick: number;
    totalWorkers: { none: number; primary: number; secondary: number; tertiary: number };
    facilities: FacilityInfo[];
}

export function computeSupplyChainBalance(scales: Record<string, number>, population: number): SupplyChainBalance {
    const resourceMap = new Map<string, ResourceBalance>();

    function getOrCreate(name: string, level: string, form: string, isExternalSource: boolean): ResourceBalance {
        if (!resourceMap.has(name)) {
            resourceMap.set(name, {
                resourceName: name,
                resourceLevel: level,
                resourceForm: form,
                isExternalSource,
                producedPerTick: 0,
                consumedByFacilitiesPerTick: 0,
                populationDemandPerTick: 0,
                balance: 0,
                producedBy: [],
                consumedBy: [],
            });
        }
        return resourceMap.get(name)!;
    }

    let totalPowerConsumedPerTick = 0;
    let totalPowerProducedPerTick = 0;
    const totalWorkers = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const facilities: FacilityInfo[] = [];

    for (const entry of ALL_FACILITY_ENTRIES) {
        const f = entry.factory(TOOL_PLANET, TOOL_ID);
        const scale = scales[f.name] ?? 0;

        facilities.push({
            name: f.name,
            primaryOutputLevel: entry.primaryOutputLevel,
            needs: f.needs.map((n) => ({ resourceName: n.resource.name, quantity: n.quantity })),
            produces: f.produces.map((p) => ({ resourceName: p.resource.name, quantity: p.quantity })),
            workerRequirement: {
                none: f.workerRequirement.none ?? 0,
                primary: f.workerRequirement.primary ?? 0,
                secondary: f.workerRequirement.secondary ?? 0,
                tertiary: f.workerRequirement.tertiary ?? 0,
            },
            powerConsumptionPerTick: f.powerConsumptionPerTick,
        });

        if (f.powerConsumptionPerTick < 0) {
            totalPowerProducedPerTick += Math.abs(f.powerConsumptionPerTick) * scale;
        } else {
            totalPowerConsumedPerTick += f.powerConsumptionPerTick * scale;
        }

        if (scale > 0) {
            totalWorkers.none += (f.workerRequirement.none ?? 0) * scale;
            totalWorkers.primary += (f.workerRequirement.primary ?? 0) * scale;
            totalWorkers.secondary += (f.workerRequirement.secondary ?? 0) * scale;
            totalWorkers.tertiary += (f.workerRequirement.tertiary ?? 0) * scale;
        }

        for (const prod of f.produces) {
            const r = getOrCreate(prod.resource.name, prod.resource.level, prod.resource.form, false);
            r.producedPerTick += prod.quantity * scale;
            if (!r.producedBy.includes(f.name)) {
                r.producedBy.push(f.name);
            }
        }

        for (const need of f.needs) {
            const isSource = need.resource.level === 'source';
            const r = getOrCreate(need.resource.name, need.resource.level, need.resource.form, isSource);
            r.consumedByFacilitiesPerTick += need.quantity * scale;
            if (!r.consumedBy.includes(f.name)) {
                r.consumedBy.push(f.name);
            }
        }
    }

    if (population > 0) {
        for (const svc of POPULATION_DEMANDED_SERVICES) {
            const r = getOrCreate(svc.name, 'services', 'services', false);
            const rate =
                getServiceDefinitionByResourceName(svc.name)?.consumptionRatePerPersonPerTick(30, 'employed') ?? 0;
            r.populationDemandPerTick += population * rate;
        }
    }

    for (const r of resourceMap.values()) {
        r.balance = r.isExternalSource
            ? 0
            : r.producedPerTick - r.consumedByFacilitiesPerTick - r.populationDemandPerTick;
    }

    return {
        resources: Array.from(resourceMap.values()).sort(
            (a, b) =>
                LEVEL_ORDER.indexOf(a.resourceLevel) - LEVEL_ORDER.indexOf(b.resourceLevel) ||
                a.resourceName.localeCompare(b.resourceName),
        ),
        totalPowerConsumedPerTick,
        totalPowerProducedPerTick,
        totalWorkers,
        facilities,
    };
}
