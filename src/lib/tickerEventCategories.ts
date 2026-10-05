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
