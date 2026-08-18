import { describe, expect, it } from 'vitest';

import { facilityRestorationCapacityPerTick } from '../planet/facilityMaintenance';
import { waterResourceType } from '../planet/resources';
import { constructionServiceResourceType } from '../planet/services';
import { makeProductionFacility } from '../utils/testHelper';
import { computeAllConsumptionRates, computeConsumptionBreakdown } from './consumptionSources';

function makeDegradedProducer(id: string) {
    const facility = makeProductionFacility({ none: 1 }, { id, scale: 1 });
    facility.needs = [];
    facility.produces = [{ resource: waterResourceType, quantity: 100 }];
    facility.maxMaintenance = 0.5;
    facility.maintenanceStatus = 0.5;
    return facility;
}

describe('consumptionSources — facility restoration demand', () => {
    it('adds restoration capacity to the Construction-service consumption rate for a degraded operating facility', () => {
        const facility = makeDegradedProducer('degraded');

        const rates = computeAllConsumptionRates([facility], null, null, [], [], 'p');

        expect(rates.get(constructionServiceResourceType.name)).toBeCloseTo(
            facilityRestorationCapacityPerTick(facility),
            10,
        );
    });

    it('omits restoration demand for a fully healthy facility', () => {
        const facility = makeProductionFacility({ none: 1 }, { id: 'healthy', scale: 1 });
        facility.needs = [];
        facility.produces = [{ resource: waterResourceType, quantity: 100 }];

        const rates = computeAllConsumptionRates([facility], null, null, [], [], 'p');

        expect(rates.get(constructionServiceResourceType.name)).toBeUndefined();
    });

    it('omits restoration demand for a facility under construction', () => {
        const facility = makeDegradedProducer('under-construction');
        facility.construction = {
            type: 'new',
            constructionTargetMaxScale: 2,
            totalConstructionServiceRequired: 1000,
            maximumConstructionServiceConsumption: 20,
            progress: 0,
            lastTickInvestedConstructionServices: 0,
        };

        const rates = computeAllConsumptionRates([facility], null, null, [], [], 'p');

        expect(rates.get(constructionServiceResourceType.name)).toBeCloseTo(20, 10);
    });

    it('lists restoration as a Construction-service breakdown source', () => {
        const facility = makeDegradedProducer('degraded');

        const info = computeConsumptionBreakdown(
            [facility],
            null,
            null,
            [],
            [],
            'p',
            constructionServiceResourceType.name,
        );

        expect(info.breakdown.some((item) => item.sourceType === 'restoration')).toBe(true);
    });
});
