import { ALL_PRODUCTION_FACILITY_ENTRIES } from '../../src/simulation/planet/productionFacilities';
import {
    auxiliaryCostRates,
    auxiliaryCostPerTick,
    facilityInputCostPerTick,
    facilityWageCostPerTick,
    storageScaleForFacility,
} from '../../src/simulation/planet/auxiliaryCosts';
import { humanResourcesOfficeFacilityType, logisticsDepartmentFacilityType } from '../../src/simulation/planet/specialFacilities';

const CATALOG_PLANET = 'catalog';
const CATALOG_ID = 'preview';
const hrTemplate = humanResourcesOfficeFacilityType(CATALOG_PLANET, CATALOG_ID);
const storageTemplate = logisticsDepartmentFacilityType(CATALOG_PLANET, CATALOG_ID);
import { facilityMaintenanceConsumptionPerTick, facilityMaintenanceMultiplier } from '../../src/simulation/planet/facilityMaintenance';
import { facilityConstructionMultiplier, getFacilityType, maintenanceCostFactor, type Facility } from '../../src/simulation/planet/facility';
import { initialMarketPrices } from '../../src/simulation/initialUniverse/initialMarketPrices';
import {
    FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK,
    MAINTENANCE_SERVICE_PER_STATUS_UNIT,
    MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE,
    SERVICE_DEPRECIATION_COST_MULTIPLIER,
    TICKS_PER_YEAR,
} from '../../src/simulation/constants';
import { facilityFullRestoreCost, facilityRestorationCostFactor } from '../../src/simulation/planet/facilityMaintenance';
import type { Planet } from '../../src/simulation/planet/planet';

const restorationDemandPerTick = (facility: Facility): number => {
    const degradationRate =
        (FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK / MAINTENANCE_SERVICE_PER_STATUS_UNIT) *
        MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE;
    return degradationRate * facilityFullRestoreCost(facility) * facilityRestorationCostFactor(facility.maxMaintenance);
};

const MAINTENANCE_PRICE = initialMarketPrices['Maintenance Service'] ?? 1;

const planet = {
    marketPrices: { ...initialMarketPrices },
    landBoundCostPerUnit: {},
    wagePerEdu: { none: 1, primary: 1, secondary: 1, tertiary: 1 },
} as unknown as Planet;

const rates = auxiliaryCostRates(planet);

const atOperatingPoint = (template: Facility, overallEfficiency: number, scaleFraction: number): Facility => {
    const facility = structuredClone(template);
    facility.lastTickResults.overallEfficiency = overallEfficiency;
    facility.maxScale = 1;
    facility.scale = scaleFraction;
    return facility;
};

const actualMaintCostPerScale = (facility: Facility): number => {
    const perScale = facilityMaintenanceConsumptionPerTick(facility) / Math.max(1e-9, facility.scale);
    return perScale * MAINTENANCE_PRICE * SERVICE_DEPRECIATION_COST_MULTIPLIER;
};

console.log('maintenance market price used:', MAINTENANCE_PRICE);
console.log('theoretical maintenance charge per unit scale (auxiliaryCostRates):', rates.maintenanceCostPerScale.toFixed(4));
console.log('  = 2 * DECREASE_PER_YEAR/TICKS_PER_YEAR * SERVICE_PER_STATUS_UNIT * price * depreciationMultiplier');
console.log(
    '  actual per unit scale = (0.5 + 1.5*eff*scale/maxScale) * cM * maintenanceCostFactor * DECREASE_PER_YEAR/TICKS_PER_YEAR * SERVICE_PER_STATUS_UNIT * price * depreciationMultiplier',
);
console.log(`  constants: DECREASE_PER_YEAR=0.5  SERVICE_PER_STATUS_UNIT=${MAINTENANCE_SERVICE_PER_STATUS_UNIT}  TICKS_PER_YEAR=${TICKS_PER_YEAR}  depreciation=${SERVICE_DEPRECIATION_COST_MULTIPLIER.toFixed(4)}  maintenanceCostFactor=${maintenanceCostFactor}`);
console.log();

console.log('ratio theoretical/actual (eff=1):');
console.log('type              cM   s/m=1.0  s/m=0.5  s/m=0.25   floor over-charges maintenance when >1');
for (const type of ['raw', 'refined', 'manufactured', 'services', 'ship_construction'] as const) {
    const cM = facilityConstructionMultiplier[type];
    const ratios = [1, 0.5, 0.25].map((f) => 2 / ((0.5 + 1.5 * f) * cM * maintenanceCostFactor));
    console.log(`${type.padEnd(17)} ${String(cM).padEnd(4)} ${ratios.map((r) => r.toFixed(2).padStart(8)).join(' ')}`);
}
console.log();

console.log('HR / storage department cost composition (these feed every facility via hrCostPerWorker / storageCostPerScale):');
for (const [label, template] of [
    ['HR office', hrTemplate],
    ['storage dept', storageTemplate],
] as const) {
    const type = getFacilityType(template);
    const facility = atOperatingPoint(template, 1, 1);
    const wage = facilityWageCostPerTick(facility as never, planet);
    const input = facilityInputCostPerTick(facility as never, planet);
    const maint = rates.maintenanceCostPerScale;
    const resto = restorationDemandPerTick(facility) * rates.constructionServicePrice;
    const storage = storageScaleForFacility(facility as never) * rates.storageCostPerScale;
    const total = input + wage + maint + resto + storage;
    console.log(
        `${label.padEnd(13)} type=${type} cM=${facilityConstructionMultiplier[type]} mcf=${maintenanceCostFactor} multiplier=${facilityMaintenanceMultiplier(facility)}  ` +
            `input=${input.toFixed(2)} wage=${wage.toFixed(2)} maint=${maint.toFixed(2)} resto=${resto.toFixed(2)} storage=${storage.toFixed(2)} total=${total.toFixed(2)}  ` +
            `upkeep(two maintenance terms)=${(((maint + resto) / total) * 100).toFixed(1)}%`,
    );
}
console.log();
console.log('effect of multiplying the two upkeep terms by facilityMaintenanceMultiplier(facility):');
for (const [label, template] of [
    ['HR office', hrTemplate],
    ['storage dept', storageTemplate],
] as const) {
    const facility = atOperatingPoint(template, 1, 1);
    const wage = facilityWageCostPerTick(facility as never, planet);
    const input = facilityInputCostPerTick(facility as never, planet);
    const maint = rates.maintenanceCostPerScale;
    const resto = restorationDemandPerTick(facility) * rates.constructionServicePrice;
    const storage = storageScaleForFacility(facility as never) * rates.storageCostPerScale;
    const before = input + wage + maint + resto + storage;
    const after = input + wage + (maint + resto) * facilityMaintenanceMultiplier(facility) + storage;
    console.log(`${label.padEnd(13)} department cost ${before.toFixed(2)} -> ${after.toFixed(2)}  (${(((after - before) / before) * 100).toFixed(1)}%)`);
}

for (const { template } of Object.values(ALL_PRODUCTION_FACILITY_ENTRIES)) {
    if (template.produces.length === 0) {
        continue;
    }
    const type = getFacilityType(template);
    const facility = atOperatingPoint(template, 1, 0.5);
    const aux = auxiliaryCostPerTick(facility as never, rates);
    const wage = facilityWageCostPerTick(facility as never, planet);
    const input = facilityInputCostPerTick(facility as never, planet);
    const restoration = restorationDemandPerTick(facility) * rates.constructionServicePrice;
    const total = input + wage + aux;
    console.log(
        `${template.name.padEnd(24)} ${type.padEnd(10)} cM=${facilityConstructionMultiplier[type]}  ` +
            `floor/out=${(total / template.produces[0]!.quantity).toFixed(3)}  ` +
            `input=${(input / total * 100).toFixed(0)}% wage=${(wage / total * 100).toFixed(0)}% ` +
            `maintenanceTerm=${(rates.maintenanceCostPerScale / total * 100).toFixed(2)}% ` +
            `restorationTerm=${(restoration / total * 100).toFixed(2)}%  ` +
            `(restoration charged at construction price, actual repair is charged at maintenance price)`,
    );
}

