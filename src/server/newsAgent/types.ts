export interface MonthlyAgentReport {
    agentId: string;
    name: string;
    associatedPlanetId: string;
    netBalance: number;
    monthlyNetIncome: number;
    totalWorkers: number;
    facilityCount: number;
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
    // Demographics
    totalEmployed: number;
    deathsThisMonth: number;
    avgGroceryStarvation: number;
    avgHealthcareStarvation: number;
    avgRetailStarvation: number;
    avgEducationStarvation: number;
    avgGroceryBuffer: number;
    avgHealthcareBuffer: number;
    avgEducationBuffer: number;
    avgRetailBuffer: number;
}

export interface MonthlyReport {
    tick: number;
    agents: MonthlyAgentReport[];
    planets: MonthlyPlanetReport[];
}

// ── Pre-digested types for the LLM ──────────────────────────────────────────

/** One facility type, aggregated across all instances+planets */
export interface FacilityPerf {
    n: string; // name
    c: number; // instance count
    sc: number; // total scale (used)
    msc: number; // total max scale
    eff: number; // scale-weighted avg efficiency (0-1)
    bn: 'w' | 'r' | ''; // bottleneck: worker | resource | none
    // worst input (depending on bottleneck type):
    wi?: string; // worst input name (edu-level if workers, resource if resources)
    wiv?: number; // worst input value (fill rate 0-1)
    out: Record<string, number>; // actual produced per tick by resource name
}

/** Production gap for one resource across all planets */
export interface ResourceGap {
    n: string; // resource name
    act: number; // actual produced / tick
    max: number; // theoretical max / tick
    rat: number; // ratio (act/max), 0-1
}

/** Root-cause bottleneck chain */
export interface RootCause {
    // The origin facility that is the root cause
    fac: string; // root facility name
    rt: 'w' | 'rs' | 'mf'; // root type: worker | resource_shortage | market_failure
    ri?: string; // root resource (for rs/mf)
    riv?: number; // root resource production ratio (for rs/mf)
    // Downstream victims
    v: string[]; // downstream facility names blocked by this root cause
}

/** Pre-digested planet economy snapshot */
export interface PlanetSnap {
    id: string;
    n: string;
    pop: number; // population
    gdpPC: number; // GDP per capita
    emp: number; // employment rate (0-1)
    dr: number; // death rate per 100k (annualized)
    col: number; // cost of living
    gStv: number; // grocery starvation (0-1)
    hStv: number; // healthcare starvation (0-1)
    eStv: number; // education starvation (0-1)
    rStv: number; // retail starvation (0-1)
}

/** Planet economy month-over-month delta (compact) */
export interface PlanetDelta {
    id: string;
    n: string;
    gdpPC_d: number; // GDP per capita delta %
    pop_d: number; // population delta %
    emp_d: number; // employment rate delta (abs change, -1 to 1)
    col_d: number; // cost of living delta %
    ms_d: number; // money supply delta %
    dr_d: number; // death rate delta (abs change, deaths per 100k)
}

/** Commodity price volatility */
export interface CommodityVol {
    pid: string; // planetId
    pn: string; // planetName
    rn: string; // resource name
    d: number; // price delta %
}

/** Currency info (compact) */
export interface CurInfo {
    pid: string;
    pn: string;
    cn: string; // currency name
    sy: string; // symbol
    ex: number; // exchange rate
}

// ── Agent delta (keep existing shape but short keys for JSON) ───────────────

export interface AgentDelta {
    aid: string; // agentId
    n: string; // name
    pid: string; // planetId
    pn: number; // previous net balance
    cn: number; // current net balance
    d: number; // delta (absolute)
    dp: number; // delta percent
}

export interface CondensedReport {
    t: number; // tick
    d: string; // date
    pd: string | null; // previous date
    a: AgentDelta[]; // top movers (wealth gainers)
    b: AgentDelta[]; // bottom movers (wealth losers)
    fp: FacilityPerf[]; // facility performance (all types)
    rg: ResourceGap[]; // resource production gaps
    rc: RootCause[]; // root cause chains
    pl: PlanetSnap[]; // planet snapshots (current month)
    pd_d: PlanetDelta[]; // planet deltas (month-over-month)
    cv: CommodityVol[]; // commodity volatility
    ci: CurInfo[]; // currency info
}
