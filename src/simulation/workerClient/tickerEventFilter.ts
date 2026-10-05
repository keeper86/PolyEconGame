import { z } from 'zod';
import { TICKER_EVENT_CATEGORIES, TICKER_EVENT_FILTER_DEFAULTS, type TickerEvent } from '../../lib/tickerEvents';
import type { Agent } from '../planet/planet';
import { HR_DEPARTMENT_NAME } from '../planet/specialFacilities';

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
        ...TICKER_EVENT_FILTER_DEFAULTS,
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

export function selectTickerEvents(
    events: TickerEvent[],
    filter: TickerEventFilter,
    agentsById: ReadonlyMap<string, Agent>,
    lastSeenId: number | undefined,
): { tickerEvents: TickerEvent[]; lastEventId: number | undefined } {
    const afterWatermark = lastSeenId !== undefined ? events.filter((event) => event.id > lastSeenId) : events;
    const lastEventId = afterWatermark.length > 0 ? Math.max(...afterWatermark.map((event) => event.id)) : lastSeenId;
    return { tickerEvents: filterTickerEvents(afterWatermark, filter, agentsById), lastEventId };
}
