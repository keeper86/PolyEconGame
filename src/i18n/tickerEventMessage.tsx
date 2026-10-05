import { isValidElement, type ReactNode } from 'react';
import type { useTranslations } from 'next-intl';
import { PLANET_NAMES } from '@/lib/planetAssets';
import { formatNumberWithUnit, resourceFormToUnit } from '@/lib/utils';
import type { TickerEventDetails } from '@/lib/tickerEvents';
import type { Locale } from './config';
import { termFor } from './terms';

export type EventTranslator = ReturnType<typeof useTranslations<'Events'>>;

const ENTITY_CLASS = 'text-[12pt] text-foreground/90';

const entityTag = (chunks: ReactNode): ReactNode => <span className={ENTITY_CLASS}>{chunks}</span>;

const planetName = (planetId: string): string => PLANET_NAMES[planetId] ?? planetId;

type ShipDispatchedDetails = Extract<TickerEventDetails, { kind: 'shipDispatched' }>;
type ShipLoad = ShipDispatchedDetails['load'];

const renderLoad = (load: ShipLoad, t: EventTranslator, locale: Locale): ReactNode => {
    switch (load.kind) {
        case 'empty':
            return t('load.empty');
        case 'cargo':
            return t.rich('load.cargo', {
                entity: entityTag,
                quantity: formatNumberWithUnit(load.quantity, resourceFormToUnit(load.resourceForm), undefined, locale),
            });
        case 'cargoRange':
            return t.rich('load.cargoRange', {
                entity: entityTag,
                current: formatNumberWithUnit(load.current, resourceFormToUnit(load.resourceForm), undefined, locale),
                goal: formatNumberWithUnit(load.goal, resourceFormToUnit(load.resourceForm), undefined, locale),
                resourceName: termFor(locale, load.resourceName),
            });
        case 'construction':
            return t('load.construction');
        case 'passenger':
            return t('load.passenger');
    }
};

export const renderTickerEvent = (
    details: TickerEventDetails,
    agentName: string,
    t: EventTranslator,
    locale: Locale,
): ReactNode => {
    switch (details.kind) {
        case 'agentCreated':
            return t.rich('agentCreated', { entity: entityTag, agentName });
        case 'licenseAcquired':
            return t.rich('licenseAcquired', {
                entity: entityTag,
                agentName,
                licenseType: termFor(locale, details.licenseType),
            });
        case 'facilityCompleted':
            return t.rich('facilityCompleted', {
                entity: entityTag,
                agentName,
                facilityName: termFor(locale, details.facilityName),
            });
        case 'facilityScrapped':
            return t.rich('facilityScrapped', {
                entity: entityTag,
                agentName,
                facilityName: termFor(locale, details.facilityName),
            });
        case 'shipCompleted':
            return t.rich('shipCompleted', {
                entity: entityTag,
                agentName,
                shipName: details.shipName,
                shipType: termFor(locale, details.shipType),
            });
        case 'shipDispatched':
            return t.rich('shipDispatched', {
                entity: entityTag,
                agentName,
                shipName: details.shipName,
                from: planetName(details.fromPlanetId),
                to: planetName(details.toPlanetId),
                load: renderLoad(details.load, t, locale) as unknown as string,
            });
        case 'shipArrived':
            return t.rich('shipArrived', {
                entity: entityTag,
                agentName,
                shipName: details.shipName,
                from: planetName(details.fromPlanetId),
                to: planetName(details.toPlanetId),
            });
        case 'companyDissolved':
            return t.rich('companyDissolved', { entity: entityTag, agentName });
        case 'companyRefounded':
            return t.rich('companyRefounded', { entity: entityTag, agentName, successorName: details.successorName });
        case 'companyRestructured':
            return t.rich('companyRestructured', {
                entity: entityTag,
                agentName,
                successorName: details.successorName,
            });
        case 'populationMilestone':
            return t.rich('populationMilestone', {
                entity: entityTag,
                planet: details.planetName,
                population: formatNumberWithUnit(details.population, 'persons', undefined, locale),
            });
    }
};

export const tickerEventText = (node: ReactNode): string => {
    if (typeof node === 'string') {
        return node;
    }
    if (typeof node === 'number') {
        return String(node);
    }
    if (Array.isArray(node)) {
        return node.map(tickerEventText).join('');
    }
    if (isValidElement(node)) {
        return tickerEventText((node.props as { children?: ReactNode }).children);
    }
    return '';
};
