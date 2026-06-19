import type { Agent } from '../planet/planet';
import type { Resource } from '../planet/claims';
import type { EducationLevelType } from '../population/education';
import type { GaussianMoments, Occupation, Skill } from '../population/population';

export interface BidOrder {
    age: number;
    edu: EducationLevelType;
    occ: Occupation;
    skill: Skill;
    population: number;
    bidPrice: number;
    quantity: number;
    wealthMoments: GaussianMoments;
}

export interface AgentBidOrder {
    agent: Agent;
    resource: Resource;
    bidPrice: number;
    quantity: number;
    filled: number;
    cost: number;

    remainingDeposits: number;
}

export interface AskOrder {
    agent: Agent;
    resource: Resource;
    askPrice: number;
    quantity: number;
    filled: number;
    revenue: number;
}

export interface TradeRecord {
    price: number;
    quantity: number;
}

export interface UnifiedClearResult {
    householdTrades: TradeRecord[];
    agentTrades: TradeRecord[];
    householdBidFilled: number[];
    householdBidCosts: number[];
}

export type MergedBid =
    | { kind: 'household'; index: number; bidPrice: number; quantity: number }
    | { kind: 'agent'; order: AgentBidOrder; bidPrice: number; quantity: number };

export const BANDS_FOR_RATIO_CLEARING_PRICE_TO_PRODUCTION_COST = [
    { limit: 0.85, label: 'depressed', className: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30' },
    {
        limit: 0.95,
        label: 'lossy',
        className: 'bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30',
    },
    { limit: 1.33, label: 'marginal', className: 'bg-lime-500/20 text-lime-700 dark:text-lime-400 border-lime-500/30' },
    {
        limit: 2.0,
        label: 'highly profitable',
        className: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    },
    {
        limit: 3.0,
        label: 'exceptional',
        className: 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30',
    },
    {
        limit: Number.MAX_SAFE_INTEGER,
        label: 'insane',
        className: 'bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30',
    },
] as const;
