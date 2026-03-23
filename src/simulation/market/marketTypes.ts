import type { Agent, Resource } from '../planet/planet';
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
}

export type MergedBid =
    | { kind: 'household'; index: number; bidPrice: number; quantity: number }
    | { kind: 'agent'; order: AgentBidOrder; bidPrice: number; quantity: number };
