import type { useTranslations } from 'next-intl';
import { formatNumberWithUnit, resourceFormToUnit } from '@/lib/utils';
import type { TickerEventDetails } from '@/server/controller/simulation';
import type { Locale } from './config';

export type EventTranslator = ReturnType<typeof useTranslations<'Events'>>;

type ShipDispatchedDetails = Extract<TickerEventDetails, { kind: 'shipDispatched' }>;
type ShipLoad = ShipDispatchedDetails['load'];

const renderLoad = (load: ShipLoad, t: EventTranslator, locale: Locale): string => {
    switch (load.kind) {
        case 'empty':
            return t('load.empty');
        case 'cargo':
            return t('load.cargo', {
                quantity: formatNumberWithUnit(load.quantity, resourceFormToUnit(load.resourceForm), undefined, locale),
            });
        case 'cargoRange':
            return t('load.cargoRange', {
                current: formatNumberWithUnit(load.current, resourceFormToUnit(load.resourceForm), undefined, locale),
                goal: formatNumberWithUnit(load.goal, resourceFormToUnit(load.resourceForm), undefined, locale),
                resourceName: load.resourceName,
            });
        case 'construction':
            return t('load.construction');
        case 'passenger':
            return t('load.passenger');
    }
};

export const renderTickerEventMessage = (
    details: TickerEventDetails,
    agentName: string,
    t: EventTranslator,
    locale: Locale,
): string => {
    switch (details.kind) {
        case 'agentCreated':
            return t('agentCreated', { agentName, planetName: details.planetName });
        case 'licenseAcquired':
            return t('licenseAcquired', {
                agentName,
                licenseType: details.licenseType,
                planetName: details.planetName,
            });
        case 'facilityCompleted':
            return t('facilityCompleted', {
                agentName,
                facilityName: details.facilityName,
                planetName: details.planetName,
            });
        case 'facilityScrapped':
            return t('facilityScrapped', {
                agentName,
                facilityName: details.facilityName,
                planetName: details.planetName,
            });
        case 'shipCompleted':
            return t('shipCompleted', {
                agentName,
                shipName: details.shipName,
                shipType: details.shipType,
                planetName: details.planetName,
            });
        case 'shipDispatched':
            return t('shipDispatched', {
                agentName,
                shipName: details.shipName,
                from: details.from,
                to: details.to,
                load: renderLoad(details.load, t, locale),
            });
        case 'shipArrived':
            return t('shipArrived', {
                agentName,
                shipName: details.shipName,
                from: details.from,
                to: details.to,
            });
        case 'companyDissolved':
            return t('companyDissolved', { agentName });
        case 'companyRefounded':
            return t('companyRefounded', { agentName, successorName: details.successorName });
        case 'companyRestructured':
            return t('companyRestructured', { agentName, successorName: details.successorName });
    }
};
