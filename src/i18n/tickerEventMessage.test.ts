import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import de from './messages/de.json';
import en from './messages/en.json';
import type { TickerEventDetails } from '@/server/controller/simulation';
import { renderTickerEventMessage } from './tickerEventMessage';

const translator = (locale: 'en' | 'de') =>
    createTranslator({ locale, messages: locale === 'de' ? de : en, namespace: 'Events' });

const eventVariants: TickerEventDetails[] = [
    { kind: 'agentCreated', planetName: 'Gune' },
    { kind: 'licenseAcquired', planetName: 'Gune', licenseType: 'commercial' },
    { kind: 'facilityCompleted', planetName: 'Gune', facilityName: 'Iron Mine' },
    { kind: 'facilityScrapped', planetName: 'Gune', facilityName: 'Iron Mine' },
    { kind: 'shipCompleted', planetName: 'Gune', shipName: 'SS Test', shipType: 'transport' },
    { kind: 'shipArrived', shipName: 'Ferry', fromPlanetId: 'gune', toPlanetId: 'icedonia' },
    {
        kind: 'shipDispatched',
        shipName: 'Ferry',
        fromPlanetId: 'gune',
        toPlanetId: 'icedonia',
        load: { kind: 'empty' },
    },
    {
        kind: 'shipDispatched',
        shipName: 'Ferry',
        fromPlanetId: 'gune',
        toPlanetId: 'icedonia',
        load: { kind: 'cargo', quantity: 1500, resourceForm: 'solid' },
    },
    {
        kind: 'shipDispatched',
        shipName: 'Ferry',
        fromPlanetId: 'gune',
        toPlanetId: 'icedonia',
        load: { kind: 'cargoRange', current: 100, goal: 200, resourceForm: 'liquid', resourceName: 'Crude Oil' },
    },
    {
        kind: 'shipDispatched',
        shipName: 'Ferry',
        fromPlanetId: 'gune',
        toPlanetId: 'icedonia',
        load: { kind: 'construction' },
    },
    {
        kind: 'shipDispatched',
        shipName: 'Ferry',
        fromPlanetId: 'gune',
        toPlanetId: 'icedonia',
        load: { kind: 'passenger' },
    },
    { kind: 'companyDissolved' },
    { kind: 'companyRefounded', successorName: 'New Co' },
    { kind: 'companyRestructured', successorName: 'New Co' },
];

describe('renderTickerEventMessage', () => {
    it('renders the English wording', () => {
        const message = renderTickerEventMessage(
            { kind: 'facilityCompleted', planetName: 'Gune', facilityName: 'Iron Mine' },
            'Acme',
            translator('en'),
            'en',
        );

        expect(message).toBe('Acme completed Iron Mine');
    });

    it('renders the German wording with translated terms', () => {
        const message = renderTickerEventMessage(
            { kind: 'facilityCompleted', planetName: 'Gune', facilityName: 'Iron Mine' },
            'Acme',
            translator('de'),
            'de',
        );

        expect(message).toBe('Acme stellte Eisenbergwerk fertig');
    });

    it('formats the ship cargo with the active locale', () => {
        const details: TickerEventDetails = {
            kind: 'shipDispatched',
            shipName: 'Ferry',
            fromPlanetId: 'gune',
            toPlanetId: 'icedonia',
            load: { kind: 'cargo', quantity: 1500, resourceForm: 'solid' },
        };

        expect(renderTickerEventMessage(details, 'Acme', translator('en'), 'en')).toContain('1.5kt');
        expect(renderTickerEventMessage(details, 'Acme', translator('de'), 'de')).toContain('1,5kt');
    });

    it('resolves planet names from the registry', () => {
        const details: TickerEventDetails = {
            kind: 'shipArrived',
            shipName: 'Ferry',
            fromPlanetId: 'gune',
            toPlanetId: 'icedonia',
        };

        expect(renderTickerEventMessage(details, 'Acme', translator('en'), 'en')).toBe(
            "Acme's Ferry arrived at Icedonia from Gune",
        );
    });

    it('leaves no unresolved placeholder in any locale', () => {
        for (const locale of ['en', 'de'] as const) {
            for (const details of eventVariants) {
                const message = renderTickerEventMessage(details, 'Acme', translator(locale), locale);
                expect(message, `${locale} ${details.kind}`).not.toMatch(/[{}]/);
            }
        }
    });
});
