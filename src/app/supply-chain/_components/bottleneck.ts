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
import type { SupplyChainBalance } from './computeBalance';

export interface LimitingInput {
    resourceName: string;

    requiredPerTick: number;

    availablePerTick: number;

    coverageRatio: number;
}

export interface BottleneckReport {
    serviceResource: string;
    supplyPerTick: number;
    demandPerTick: number;

    coverageRatio: number;

    limitingInputs: LimitingInput[];
}

const DEMANDED_SERVICES = [
    groceryServiceResourceType,
    healthcareServiceResourceType,
    administrativeServiceResourceType,
    logisticsServiceResourceType,
    retailServiceResourceType,
    constructionServiceResourceType,
];

const TOOL_PLANET = 'tool';
const TOOL_ID = 'preview';

export function computeBottlenecks(
    balance: SupplyChainBalance,
    scales: Record<string, number>,
    population: number,
): BottleneckReport[] {
    const balanceByName = new Map(balance.resources.map((r) => [r.resourceName, r]));

    const reports: BottleneckReport[] = [];

    for (const svc of DEMANDED_SERVICES) {
        const svcDef = getServiceDefinitionByResourceName(svc.name);
        const demandPerTick = population * (svcDef?.consumptionRatePerPersonPerTick(30, 'employed') ?? 0);

        type ServiceProducer = { facilityName: string; outputQuantity: number; scale: number };
        const producers: ServiceProducer[] = [];

        for (const entry of ALL_FACILITY_ENTRIES) {
            const f = entry.factory(TOOL_PLANET, TOOL_ID);
            const scale = scales[f.name] ?? 0;
            for (const prod of f.produces) {
                if (prod.resource.name === svc.name) {
                    producers.push({ facilityName: f.name, outputQuantity: prod.quantity, scale });
                }
            }
        }

        const supplyPerTick = producers.reduce((sum, p) => sum + p.outputQuantity * p.scale, 0);
        const coverageRatio = demandPerTick > 0 ? supplyPerTick / demandPerTick : 1;

        const inputRequired = new Map<string, number>();
        const inputIsExternal = new Set<string>();

        for (const entry of ALL_FACILITY_ENTRIES) {
            const f = entry.factory(TOOL_PLANET, TOOL_ID);
            const scale = scales[f.name] ?? 0;
            if (scale <= 0) {
                continue;
            }

            const producesService = f.produces.some((p) => p.resource.name === svc.name);
            if (!producesService) {
                continue;
            }

            for (const need of f.needs) {
                const prev = inputRequired.get(need.resource.name) ?? 0;
                inputRequired.set(need.resource.name, prev + need.quantity * scale);

                if (need.resource.level === 'source') {
                    inputIsExternal.add(need.resource.name);
                }
            }
        }

        const limitingInputs: LimitingInput[] = [];

        for (const [resourceName, requiredPerTick] of inputRequired) {
            if (requiredPerTick <= 0) {
                continue;
            }

            const bal = balanceByName.get(resourceName);
            const isExternal = inputIsExternal.has(resourceName);

            const availablePerTick = isExternal || !bal ? Infinity : bal.producedPerTick;

            const inputCoverage = isExternal ? Infinity : availablePerTick / requiredPerTick;

            limitingInputs.push({
                resourceName,
                requiredPerTick,
                availablePerTick,
                coverageRatio: inputCoverage,
            });
        }

        limitingInputs.sort((a, b) => a.coverageRatio - b.coverageRatio);

        reports.push({
            serviceResource: svc.name,
            supplyPerTick,
            demandPerTick,
            coverageRatio,
            limitingInputs,
        });
    }

    reports.sort((a, b) => a.coverageRatio - b.coverageRatio);

    return reports;
}
