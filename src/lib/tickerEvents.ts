import type { ResourceType } from '@/simulation/planet/claims';

export const TICKER_EVENT_CATEGORIES = [
    'agentCreated',
    'shipDispatched',
    'shipArrived',
    'shipCompleted',
    'facilityCompleted',
    'facilityScrapped',
    'licenseAcquired',
    'agentBankrupt',
    'contractAccepted',
    'loanRollover',
    'priceSpike',
    'populationMilestone',
] as const;

export type TickerEventCategory = (typeof TICKER_EVENT_CATEGORIES)[number];

export function isTickerEventCategoryList(raw: unknown): raw is TickerEventCategory[] {
    return Array.isArray(raw) && raw.every((value) => (TICKER_EVENT_CATEGORIES as readonly unknown[]).includes(value));
}

export type TickerEventLoad =
    | { kind: 'empty' }
    | { kind: 'cargo'; quantity: number; resourceForm: ResourceType }
    | { kind: 'cargoRange'; current: number; goal: number; resourceForm: ResourceType; resourceName: string }
    | { kind: 'construction' }
    | { kind: 'passenger' };

export type TickerEventDetails =
    | { kind: 'agentCreated'; planetName: string }
    | { kind: 'licenseAcquired'; planetName: string; licenseType: string }
    | { kind: 'facilityCompleted'; planetName: string; facilityName: string }
    | { kind: 'facilityScrapped'; planetName: string; facilityName: string }
    | { kind: 'shipCompleted'; planetName: string; shipName: string; shipType: string }
    | { kind: 'shipDispatched'; shipName: string; fromPlanetId: string; toPlanetId: string; load: TickerEventLoad }
    | { kind: 'shipArrived'; shipName: string; fromPlanetId: string; toPlanetId: string }
    | { kind: 'companyDissolved' }
    | { kind: 'companyRefounded'; successorName: string }
    | { kind: 'companyRestructured'; successorName: string }
    | { kind: 'populationMilestone'; planetName: string; population: number };

export type TickerEvent = {
    id: number;
    planetId: string;
    tick: number;
    agentLogo: string;
    category: TickerEventCategory;
    agentId?: string;
    agentName?: string;
    details: TickerEventDetails;
};

export const TICKER_EVENT_FILTER_DEFAULTS = {
    hideAutomated: true,
    localPlanetOnly: true,
    showHrCompletion: false,
} as const;
