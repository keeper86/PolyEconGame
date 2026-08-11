import { ALL_PRODUCTION_FACILITY_ENTRIES } from '@/simulation/planet/productionFacilities';
import { humanResourcesOfficeFacilityType, storageDepartmentFacilityType } from '@/simulation/planet/specialFacilities';
import { computePopulationServiceDemand } from './populationDemandHelper';

const TOOL_PLANET = 'tool';
const TOOL_ID = 'preview';
const LEVEL_ORDER = ['source', 'raw', 'refined', 'manufactured', 'services', 'internal'];

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

    for (const entry of Object.values(ALL_PRODUCTION_FACILITY_ENTRIES)) {
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

    const specialFacilities = [
        humanResourcesOfficeFacilityType(TOOL_PLANET, `${TOOL_ID}-hr`),
        storageDepartmentFacilityType(TOOL_PLANET, `${TOOL_ID}-sto`),
    ];

    for (const sf of specialFacilities) {
        const scale = scales[sf.name] ?? 0;

        facilities.push({
            name: sf.name,
            primaryOutputLevel: 'internal',
            needs: sf.needs.map((n) => ({ resourceName: n.resource.name, quantity: n.quantity })),
            produces: sf.produces.map((p) => ({ resourceName: p.resource.name, quantity: p.quantity })),
            workerRequirement: {
                none: sf.workerRequirement.none ?? 0,
                primary: sf.workerRequirement.primary ?? 0,
                secondary: sf.workerRequirement.secondary ?? 0,
                tertiary: sf.workerRequirement.tertiary ?? 0,
            },
            powerConsumptionPerTick: sf.powerConsumptionPerTick,
        });

        if (sf.powerConsumptionPerTick < 0) {
            totalPowerProducedPerTick += Math.abs(sf.powerConsumptionPerTick) * scale;
        } else {
            totalPowerConsumedPerTick += sf.powerConsumptionPerTick * scale;
        }

        if (scale > 0) {
            totalWorkers.none += (sf.workerRequirement.none ?? 0) * scale;
            totalWorkers.primary += (sf.workerRequirement.primary ?? 0) * scale;
            totalWorkers.secondary += (sf.workerRequirement.secondary ?? 0) * scale;
            totalWorkers.tertiary += (sf.workerRequirement.tertiary ?? 0) * scale;
        }

        for (const prod of sf.produces) {
            const r = getOrCreate(prod.resource.name, prod.resource.level, prod.resource.form, false);
            r.producedPerTick += prod.quantity * scale;
            if (!r.producedBy.includes(sf.name)) {
                r.producedBy.push(sf.name);
            }
        }

        for (const need of sf.needs) {
            const isSource = need.resource.level === 'source';
            const r = getOrCreate(need.resource.name, need.resource.level, need.resource.form, isSource);
            r.consumedByFacilitiesPerTick += need.quantity * scale;
            if (!r.consumedBy.includes(sf.name)) {
                r.consumedBy.push(sf.name);
            }
        }
    }

    if (population > 0) {
        const populationDemand = computePopulationServiceDemand(population);
        for (const [resourceName, demandPerTick] of Object.entries(populationDemand)) {
            const r = getOrCreate(resourceName, 'services', 'services', false);
            r.populationDemandPerTick += demandPerTick;
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
