export interface MonthlyAgentReport {
    agentId: string;
    name: string;
    associatedPlanetId: string;
    netBalance: number;
    monthlyNetIncome: number;
    totalWorkers: number;
    wages: number;
    productionValue: number;
    consumptionValue: number;
    facilityCount: number;
    storageValue: number;
    purchases: number;
    claimPayments: number;
}

export interface MonthlyPlanetReport {
    planetId: string;
    name: string;
    population: number;
    gdp: number;
    costOfLiving: number;
    costOfLivingRich: number;
    wages: {
        edu0: number;
        edu1: number;
        edu2: number;
        edu3: number;
    };
    policyRate: number;
    moneySupply: number;
    bankEquity: number;
    foodPrice: number;
    agentCount: number;
}

export interface MonthlyReport {
    tick: number;
    agents: MonthlyAgentReport[];
    planets: MonthlyPlanetReport[];
}

export interface AgentDelta {
    agentId: string;
    name: string;
    planetId: string;
    previousNetBalance: number;
    currentNetBalance: number;
    delta: number;
    deltaPercent: number;
}

export interface CommodityVolatility {
    planetId: string;
    planetName: string;
    productName: string;
    previousAvgPrice: number;
    currentAvgPrice: number;
    deltaPercent: number;
}

export interface NewsArticle {
    title: string;
    summary: string;
    planetId: string | null;
    category: 'agent' | 'commodity' | 'economy' | 'population';
    importance: number; // 1-10, higher = more important
}