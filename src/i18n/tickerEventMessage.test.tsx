import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from 'tests/vitest/renderWithIntl';
import de from './messages/de.json';
import en from './messages/en.json';
import type { TickerEventDetails } from '@/server/controller/simulation';
import { renderTickerEvent, tickerEventText } from './tickerEventMessage';

const translator = (locale: 'en' | 'de') =>
    createTranslator({ locale, messages: locale === 'de' ? de : en, namespace: 'Events' });

const text = (details: TickerEventDetails, agentName: string, locale: 'en' | 'de'): string =>
    tickerEventText(renderTickerEvent(details, agentName, translator(locale), locale));

function Ticker({
    details,
    agentName,
    locale,
}: {
    details: TickerEventDetails;
    agentName: string;
    locale: 'en' | 'de';
}) {
    return <span>{renderTickerEvent(details, agentName, translator(locale), locale)}</span>;
}

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
    { kind: 'populationMilestone', planetName: 'Gune', population: 8_000_000_000 },
];

describe('renderTickerEvent', () => {
    it('renders the English wording', () => {
        const message = text(
            { kind: 'facilityCompleted', planetName: 'Gune', facilityName: 'Iron Mine' },
            'Acme',
            'en',
        );

        expect(message).toBe('Acme completed Iron Mine');
    });

    it('renders the German wording with translated terms', () => {
        const message = text(
            { kind: 'facilityCompleted', planetName: 'Gune', facilityName: 'Iron Mine' },
            'Acme',
            'de',
        );

        expect(message).toBe('Acme erweitert Eisenbergwerk');
    });

    it('formats the ship cargo with the active locale', () => {
        const details: TickerEventDetails = {
            kind: 'shipDispatched',
            shipName: 'Ferry',
            fromPlanetId: 'gune',
            toPlanetId: 'icedonia',
            load: { kind: 'cargo', quantity: 1500, resourceForm: 'solid' },
        };

        expect(text(details, 'Acme', 'en')).toContain('1.5kt');
        expect(text(details, 'Acme', 'de')).toContain('1,5kt');
    });

    it('resolves planet names from the registry', () => {
        const details: TickerEventDetails = {
            kind: 'shipArrived',
            shipName: 'Ferry',
            fromPlanetId: 'gune',
            toPlanetId: 'icedonia',
        };

        expect(text(details, 'Acme', 'en')).toBe("Acme's Ferry arrived at Icedonia from Gune");
    });

    it('leaves no unresolved placeholder in any locale', () => {
        for (const locale of ['en', 'de'] as const) {
            for (const details of eventVariants) {
                const message = text(details, 'Acme', locale);
                expect(message, `${locale} ${details.kind}`).not.toMatch(/[{}]/);
            }
        }
    });

    it('wraps the facility name in its own span', () => {
        const { container } = renderWithIntl(
            <Ticker
                details={{ kind: 'facilityCompleted', planetName: 'Gune', facilityName: 'Iron Mine' }}
                agentName='Acme'
                locale='en'
            />,
        );

        expect(container.textContent).toBe('Acme completed Iron Mine');
        const entities = [...container.querySelectorAll('span span')].map((el) => el.textContent);
        expect(entities).toEqual(['Acme', 'Iron Mine']);
    });

    it('wraps the ship and planet names in their own spans', () => {
        const { container } = renderWithIntl(
            <Ticker
                details={{
                    kind: 'shipDispatched',
                    shipName: 'Ferry',
                    fromPlanetId: 'gune',
                    toPlanetId: 'icedonia',
                    load: { kind: 'empty' },
                }}
                agentName='Acme'
                locale='en'
            />,
        );

        expect(container.textContent).toBe("Acme's Ferry departed Gune → Icedonia (empty)");
        const entities = [...container.querySelectorAll('span span')].map((el) => el.textContent);
        expect(entities).toEqual(['Acme', 'Ferry', 'Gune', 'Icedonia', 'empty']);
    });

    it('wraps the nested cargo quantity in its own span', () => {
        const { container } = renderWithIntl(
            <Ticker
                details={{
                    kind: 'shipDispatched',
                    shipName: 'Ferry',
                    fromPlanetId: 'gune',
                    toPlanetId: 'icedonia',
                    load: { kind: 'cargo', quantity: 1500, resourceForm: 'solid' },
                }}
                agentName='Acme'
                locale='en'
            />,
        );

        expect(container.textContent).toBe("Acme's Ferry departed Gune → Icedonia (cargo 1.5kt)");
        const entities = [...container.querySelectorAll('span span')].map((el) => el.textContent);
        expect(entities).toEqual(['Acme', 'Ferry', 'Gune', 'Icedonia', 'cargo 1.5kt', '1.5kt']);
    });
});
