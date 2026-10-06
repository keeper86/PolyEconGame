import { describe, expect, it } from 'vitest';
import type { TickerEvent } from '../../lib/tickerEvents';
import { HR_DEPARTMENT_NAME } from '../planet/specialFacilities';
import {
    defaultTickerEventFilter,
    filterTickerEvents,
    selectTickerEvents,
    type TickerEventFilter,
} from './tickerEventFilter';

function event(params: {
    id: number;
    planetId?: string;
    agentId?: string;
    automated?: boolean;
    category: TickerEvent['category'];
    details: TickerEvent['details'];
}): TickerEvent {
    return {
        id: params.id,
        planetId: params.planetId ?? 'p1',
        tick: 1,
        agentLogo: '',
        automated: params.automated ?? false,
        category: params.category,
        agentId: params.agentId ?? 'a1',
        agentName: 'Alpha',
        details: params.details,
    };
}

function withFilter(overrides: Partial<TickerEventFilter>): TickerEventFilter {
    return { ...defaultTickerEventFilter(), ...overrides };
}

const autoCreated = (id: number) =>
    event({ id, automated: true, category: 'agentCreated', details: { kind: 'agentCreated', planetName: 'P1' } });

const created = (id: number, planetId = 'p1') =>
    event({ id, planetId, category: 'agentCreated', details: { kind: 'agentCreated', planetName: planetId } });

const facilityCompleted = (id: number, facilityName: string) =>
    event({
        id,
        category: 'facilityCompleted',
        details: { kind: 'facilityCompleted', planetName: 'P1', facilityName },
    });

describe('filterTickerEvents', () => {
    it('keeps only the enabled categories', () => {
        const events = [created(1), facilityCompleted(2, 'Refinery')];

        const result = filterTickerEvents(events, withFilter({ categories: ['facilityCompleted'] }));

        expect(result.map((e) => e.id)).toEqual([2]);
    });

    it('drops events from automated agents when hideAutomated is set', () => {
        expect(filterTickerEvents([autoCreated(1)], withFilter({ hideAutomated: true }))).toHaveLength(0);
        expect(filterTickerEvents([created(1)], withFilter({ hideAutomated: true }))).toHaveLength(1);
    });

    it('hides an automated event whose agent is no longer in the snapshot', () => {
        const dispatched = event({
            id: 1,
            agentId: 'refounded-away',
            automated: true,
            category: 'shipDispatched',
            details: {
                kind: 'shipDispatched',
                shipName: 'Hauler',
                fromPlanetId: 'p1',
                toPlanetId: 'p2',
                load: { kind: 'empty' },
            },
        });

        expect(filterTickerEvents([dispatched], withFilter({ hideAutomated: true }))).toHaveLength(0);
    });

    it('keeps only the local planet when the scope is set', () => {
        const events = [created(1, 'p1'), created(2, 'p2')];

        const result = filterTickerEvents(events, withFilter({ localPlanetOnly: true, planetId: 'p2' }));

        expect(result.map((e) => e.id)).toEqual([2]);
    });

    it('ignores the planet when the scope is off', () => {
        const events = [created(1, 'p1'), created(2, 'p2')];

        const result = filterTickerEvents(events, withFilter({ localPlanetOnly: false, planetId: 'p2' }));

        expect(result.map((e) => e.id)).toEqual([1, 2]);
    });

    it('drops the HR Department completion when disabled', () => {
        const events = [facilityCompleted(1, HR_DEPARTMENT_NAME), facilityCompleted(2, 'Refinery')];

        const hidden = filterTickerEvents(events, withFilter({ showHrCompletion: false }));
        const shown = filterTickerEvents(events, withFilter({ showHrCompletion: true }));

        expect(hidden.map((e) => e.id)).toEqual([2]);
        expect(shown.map((e) => e.id)).toEqual([1, 2]);
    });
});

describe('selectTickerEvents', () => {
    it('returns every filtered event and the highest id without a watermark', () => {
        const events = [created(1), created(2), facilityCompleted(3, 'Refinery')];

        const result = selectTickerEvents(events, withFilter({ categories: ['agentCreated'] }), undefined);

        expect(result.tickerEvents.map((e) => e.id)).toEqual([1, 2]);
        expect(result.lastEventId).toBe(3);
    });

    it('only returns events newer than the watermark', () => {
        const events = [created(1), created(2), created(3)];

        const result = selectTickerEvents(events, defaultTickerEventFilter(), 1);

        expect(result.tickerEvents.map((e) => e.id)).toEqual([2, 3]);
        expect(result.lastEventId).toBe(3);
    });

    it('advances the watermark past events that are filtered out', () => {
        const events = [created(1), facilityCompleted(2, 'Refinery')];

        const result = selectTickerEvents(events, withFilter({ categories: ['agentCreated'] }), 0);

        expect(result.tickerEvents.map((e) => e.id)).toEqual([1]);
        expect(result.lastEventId).toBe(2);
    });

    it('keeps the watermark when there is nothing new', () => {
        const result = selectTickerEvents([created(1)], defaultTickerEventFilter(), 5);

        expect(result.tickerEvents).toEqual([]);
        expect(result.lastEventId).toBe(5);
    });
});
