/**
 * First-order bottleneck detection for the supply-chain tool.
 *
 * For each population-demanded service, identifies which direct inputs are
 * most limiting the service's ability to meet demand.
 *
 * "First-order" means we look at the direct inputs of the service-producing
 * facilities only, not at their upstream inputs recursively.
 */

import { ALL_FACILITY_ENTRIES } from '@/simulation/planet/productionFacilities';
import { SERVICE_PER_PERSON_PER_TICK } from '@/simulation/constants';
import {
    groceryServiceResourceType,
    healthcareServiceResourceType,
    administrativeServiceResourceType,
    logisticsServiceResourceType,
    retailServiceResourceType,
    constructionServiceResourceType,
} from '@/simulation/planet/services';
import type { SupplyChainBalance } from './computeBalance';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface LimitingInput {
    resourceName: string;
    /** How much of this input is required per tick by all service-producing facilities at current scale. */
    requiredPerTick: number;
    /** How much of this input is available (produced) per tick. External sources report Infinity. */
    availablePerTick: number;
    /** availablePerTick / requiredPerTick — lower is more limiting. */
    coverageRatio: number;
}

export interface BottleneckReport {
    serviceResource: string;
    supplyPerTick: number;
    demandPerTick: number;
    /** supplyPerTick / demandPerTick — lower is more constrained. */
    coverageRatio: number;
    /** Direct inputs sorted worst-first (ascending coverageRatio). */
    limitingInputs: LimitingInput[];
}

// ─── Demanded services ────────────────────────────────────────────────────────

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

// ─── Main function ────────────────────────────────────────────────────────────

export function computeBottlenecks(
    balance: SupplyChainBalance,
    scales: Record<string, number>,
    population: number,
): BottleneckReport[] {
    const demandPerTick = population * SERVICE_PER_PERSON_PER_TICK;

    // Build a lookup from resource name → ResourceBalance for quick access
    const balanceByName = new Map(balance.resources.map((r) => [r.resourceName, r]));

    const reports: BottleneckReport[] = [];

    for (const svc of DEMANDED_SERVICES) {
        // ── Collect all facilities that produce this service ──────────────────
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

        // ── Total supply/tick at current scales ───────────────────────────────
        const supplyPerTick = producers.reduce((sum, p) => sum + p.outputQuantity * p.scale, 0);
        const coverageRatio = demandPerTick > 0 ? supplyPerTick / demandPerTick : 1;

        // ── Aggregate direct input requirements across all producers ──────────
        const inputRequired = new Map<string, number>(); // resource name → total required/tick
        const inputIsExternal = new Set<string>();

        for (const entry of ALL_FACILITY_ENTRIES) {
            const f = entry.factory(TOOL_PLANET, TOOL_ID);
            const scale = scales[f.name] ?? 0;
            if (scale <= 0) {
                continue;
            }

            // Only look at facilities that produce this service
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

        // ── Compute limiting inputs ────────────────────────────────────────────
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

        // Sort: most limiting (lowest ratio) first; external sources (Infinity) last
        limitingInputs.sort((a, b) => a.coverageRatio - b.coverageRatio);

        reports.push({
            serviceResource: svc.name,
            supplyPerTick,
            demandPerTick,
            coverageRatio,
            limitingInputs,
        });
    }

    // Sort: most under-supplied services first
    reports.sort((a, b) => a.coverageRatio - b.coverageRatio);

    return reports;
}
