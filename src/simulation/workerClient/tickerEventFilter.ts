import { z } from 'zod';
import { TICKER_EVENT_CATEGORIES } from '../../lib/tickerEventCategories';
import type { Agent } from '../planet/planet';
import { HR_DEPARTMENT_NAME } from '../planet/specialFacilities';
import type { TickerEvent } from '../../server/controller/simulation';

export const tickerEventFilterSchema = z.object({
    categories: z.array(z.enum([...TICKER_EVENT_CATEGORIES])),
    hideAutomated: z.boolean(),
    localPlanetOnly: z.boolean(),
    planetId: z.string().optional(),
    showHrCompletion: z.boolean(),
});

export type TickerEventFilter = z.infer<typeof tickerEventFilterSchema>;

export function defaultTickerEventFilter(): TickerEventFilter {
    return {
        categories: [...TICKER_EVENT_CATEGORIES],
        hideAutomated: false,
        localPlanetOnly: false,
        showHrCompletion: true,
    };
}

function isHrCompletion(event: TickerEvent): boolean {
    return (
        event.category === 'facilityCompleted' &&
        event.details.kind === 'facilityCompleted' &&
        event.details.facilityName === HR_DEPARTMENT_NAME
    );
}

export function filterTickerEvents(
    events: TickerEvent[],
    filter: TickerEventFilter,
    agentsById: ReadonlyMap<string, Agent>,
): TickerEvent[] {
    const enabled = new Set(filter.categories);
    return events.filter((event) => {
        if (!enabled.has(event.category)) {
            return false;
        }
        if (filter.localPlanetOnly && filter.planetId !== undefined && event.planetId !== filter.planetId) {
            return false;
        }
        if (!filter.showHrCompletion && isHrCompletion(event)) {
            return false;
        }
        if (filter.hideAutomated && event.agentId !== undefined && agentsById.get(event.agentId)?.automated === true) {
            return false;
        }
        return true;
    });
}
