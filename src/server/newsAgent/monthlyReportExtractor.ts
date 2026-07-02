import { TICKS_PER_YEAR, TICKS_PER_MONTH, START_YEAR } from '@/simulation/constants';
import { computeCostOfLiving } from '@/simulation/market/serviceDefinitions';
import { groceryServiceResourceType } from '@/simulation/planet/services';
import type { Planet, Agent } from '@/simulation/planet/planet';
import type { ProductionFacility } from '@/simulation/planet/facility';
import { computePopulationTotal } from '@/simulation/snapshotRepository';
import { OCCUPATIONS, SKILL } from '@/simulation/population/population';
import { educationLevelKeys } from '@/simulation/population/education';
import {
    getAllAgentsSync,
    getAllPlanetsSync,
    getForexMarketMakersSync,
    getShipbuilderAgentsSync,
    getArbitrageTradersSync,
} from '@/simulation/workerClient/syncQueries';
import { totalOutstandingLoans } from '@/simulation/financial/loanTypes';
import { getCurrencyResourceName, currencyMapping } from '@/simulation/market/currencyResources';
import { DEFAULT_EXCHANGE_RATE } from '@/simulation/market/currencyResources';
import { facilityByName } from '@/simulation/planet/productionFacilities';
import { ALL_RESOURCES } from '@/simulation/planet/resourceCatalog';
import { computeSupplyChainBalance } from '@/app/supply-chain/_components/computeBalance';
import type {
    MonthlyReport,
    MonthlyAgentReport,
    MonthlyPlanetReport,
    CondensedReport,
    AgentDelta,
    FacilityPerf,
    ResourceGap,
    RootCause,
    PlanetSnap,
    PlanetDelta,
    CommodityVol,
    CurInfo,
} from './types';
import { newsMemory } from './newsMemory';
import { buildNewsPrompt } from './promptBuilder';

const TOP_N = 10;
const PRICE_CHANGE_THRESHOLD_PCT = 10;
const MARKET_FAILURE_PRODUCTION_THRESHOLD = 0.7;

// ── Static supply chain mapping (computed once at module load) ────────────

const _STATIC_SC = computeSupplyChainBalance({}, 0);
const RESOURCE_PRODUCERS: Map<string, string[]> = new Map(
    _STATIC_SC.resources.map((r) => [r.resourceName, r.producedBy]),
);
const RESOURCE_CONSUMERS: Map<string, string[]> = new Map(
    _STATIC_SC.resources.map((r) => [r.resourceName, r.consumedBy.filter((c) => c !== r.resourceName)]),
);

/**
 * Convert a simulation tick to a human-readable date string like "September 2233".
 */
function tickToMonthYear(tick: number): string {
    const simTick = tick - 1;
    const year = Math.floor(simTick / TICKS_PER_YEAR) + START_YEAR;
    const monthIndex = Math.floor((simTick % TICKS_PER_YEAR) / TICKS_PER_MONTH);
    const monthNames = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
    ];
    return `${monthNames[monthIndex]} ${year}`;
}

/**
 * Populate demographic fields on MonthlyPlanetReport by iterating the population
 * demography structure directly from the cached Planet object.
 */
function computeDemographicMetrics(planet: Planet): {
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
} {
    let totalEmployed = 0;
    let deathsThisMonth = 0;
    let totalPop = 0;

    let groceryStarveSum = 0;
    let healthcareStarveSum = 0;
    let retailStarveSum = 0;
    let educationStarveSum = 0;
    let groceryBufSum = 0;
    let healthcareBufSum = 0;
    let educationBufSum = 0;
    let retailBufSum = 0;

    for (const cohort of planet.population.demography) {
        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    const cat = cohort[occ][edu][skill];
                    if (cat.total <= 0) {
                        continue;
                    }

                    totalPop += cat.total;
                    if (occ === 'employed') {
                        totalEmployed += cat.total;
                    }
                    deathsThisMonth += cat.deaths.countThisMonth;

                    const svc = cat.services;
                    groceryStarveSum += svc.grocery.starvationLevel * cat.total;
                    healthcareStarveSum += svc.healthcare.starvationLevel * cat.total;
                    retailStarveSum += svc.retail.starvationLevel * cat.total;
                    educationStarveSum += svc.education.starvationLevel * cat.total;
                    groceryBufSum += svc.grocery.buffer * cat.total;
                    healthcareBufSum += svc.healthcare.buffer * cat.total;
                    educationBufSum += svc.education.buffer * cat.total;
                    retailBufSum += svc.retail.buffer * cat.total;
                }
            }
        }
    }

    const safeDiv = (sum: number) => (totalPop > 0 ? sum / totalPop : 0);

    return {
        totalEmployed,
        deathsThisMonth,
        avgGroceryStarvation: safeDiv(groceryStarveSum),
        avgHealthcareStarvation: safeDiv(healthcareStarveSum),
        avgRetailStarvation: safeDiv(retailStarveSum),
        avgEducationStarvation: safeDiv(educationStarveSum),
        avgGroceryBuffer: safeDiv(groceryBufSum),
        avgHealthcareBuffer: safeDiv(healthcareBufSum),
        avgEducationBuffer: safeDiv(educationBufSum),
        avgRetailBuffer: safeDiv(retailBufSum),
    };
}

// ── Facility aggregation (ported from LiveStateTab.tsx) ───────────────────

interface AggEntry {
    instanceCount: number;
    totalScale: number;
    totalMaxScale: number;
    effWeightedSum: number;
    actualProduced: Record<string, number>;
    resourceEffWeighted: Record<string, number>;
    resourceEffScaleSum: Record<string, number>;
    workerEffWeighted: Record<string, number>;
    workerEffScaleSum: Record<string, number>;
}

function aggregateFacilities(agents: Agent[]): FacilityPerf[] {
    const map = new Map<string, AggEntry>();

    function getEntry(name: string): AggEntry {
        let e = map.get(name);
        if (!e) {
            e = {
                instanceCount: 0,
                totalScale: 0,
                totalMaxScale: 0,
                effWeightedSum: 0,
                actualProduced: {},
                resourceEffWeighted: {},
                resourceEffScaleSum: {},
                workerEffWeighted: {},
                workerEffScaleSum: {},
            };
            map.set(name, e);
        }
        return e;
    }

    for (const agent of agents) {
        for (const planetAssets of Object.values(agent.assets ?? {})) {
            for (const fac of (planetAssets.productionFacilities as ProductionFacility[]) ?? []) {
                const entry = getEntry(fac.name);
                entry.instanceCount++;
                entry.totalScale += fac.scale;
                entry.totalMaxScale += fac.maxScale;

                const eff = fac.lastTickResults?.overallEfficiency ?? 0;
                entry.effWeightedSum += eff * fac.scale;

                for (const [rn, qty] of Object.entries(fac.lastTickResults?.lastProduced ?? {})) {
                    entry.actualProduced[rn] = (entry.actualProduced[rn] ?? 0) + qty;
                }

                for (const [rn, re] of Object.entries(fac.lastTickResults?.resourceEfficiency ?? {})) {
                    entry.resourceEffWeighted[rn] = (entry.resourceEffWeighted[rn] ?? 0) + re * fac.scale;
                    entry.resourceEffScaleSum[rn] = (entry.resourceEffScaleSum[rn] ?? 0) + fac.scale;
                }

                for (const [edu, we] of Object.entries(fac.lastTickResults?.workerEfficiency ?? {})) {
                    if (we !== undefined) {
                        entry.workerEffWeighted[edu] = (entry.workerEffWeighted[edu] ?? 0) + we * fac.scale;
                        entry.workerEffScaleSum[edu] = (entry.workerEffScaleSum[edu] ?? 0) + fac.scale;
                    }
                }
            }
        }
    }

    const rows: FacilityPerf[] = [];
    for (const [name, entry] of map.entries()) {
        const avgEff = entry.totalScale > 0 ? entry.effWeightedSum / entry.totalScale : 0;

        // Compute average resource and worker efficiencies
        const avgResourceEff: Record<string, number> = {};
        for (const [rn, ws] of Object.entries(entry.resourceEffWeighted)) {
            const ss = entry.resourceEffScaleSum[rn] ?? 1;
            avgResourceEff[rn] = ss > 0 ? ws / ss : 0;
        }
        const avgWorkerEff: Record<string, number> = {};
        for (const [edu, ws] of Object.entries(entry.workerEffWeighted)) {
            const ss = entry.workerEffScaleSum[edu] ?? 1;
            avgWorkerEff[edu] = ss > 0 ? ws / ss : 0;
        }

        // Find worst resource and worst worker level
        let worstResourceName = '';
        let worstResourceEff = 1;
        for (const [rn, re] of Object.entries(avgResourceEff)) {
            if (re < worstResourceEff) {
                worstResourceEff = re;
                worstResourceName = rn;
            }
        }
        let worstWorkerLevel = '';
        let worstWorkerEff = 1;
        for (const [edu, we] of Object.entries(avgWorkerEff)) {
            if (we < worstWorkerEff) {
                worstWorkerEff = we;
                worstWorkerLevel = edu;
            }
        }

        // Determine main bottleneck
        const isWorkerBottleneck = worstWorkerEff < worstResourceEff;
        const bn: FacilityPerf['bn'] = isWorkerBottleneck ? 'w' : worstResourceEff < 0.995 ? 'r' : '';

        rows.push({
            n: name,
            c: entry.instanceCount,
            sc: r2(entry.totalScale),
            msc: r2(entry.totalMaxScale),
            eff: r2(avgEff),
            bn,
            wi: bn === 'w' ? worstWorkerLevel : bn === 'r' ? worstResourceName : undefined,
            wiv: bn === 'w' ? r2(worstWorkerEff) : bn === 'r' ? r2(worstResourceEff) : undefined,
            out: Object.fromEntries(Object.entries(entry.actualProduced).map(([k, v]) => [k, r2(v)])),
        });
    }

    return rows.sort((a, b) => a.eff - b.eff);
}

// ── Resource production gaps ──────────────────────────────────────────────

function buildResourceActuals(rows: FacilityPerf[], maxScales: Record<string, number>, pop: number): ResourceGap[] {
    const actualByResource: Record<string, number> = {};
    for (const row of rows) {
        for (const [rn, qty] of Object.entries(row.out)) {
            actualByResource[rn] = (actualByResource[rn] ?? 0) + qty;
        }
    }

    const theoretical = computeSupplyChainBalance(maxScales, pop);
    const theoreticalByResource: Record<string, number> = {};
    for (const r of theoretical.resources) {
        if (!r.isExternalSource && r.producedPerTick > 0) {
            theoreticalByResource[r.resourceName] = r.producedPerTick;
        }
    }

    const allResources = new Set([...Object.keys(actualByResource), ...Object.keys(theoreticalByResource)]);
    const result: ResourceGap[] = [];
    for (const rn of allResources) {
        const actual = actualByResource[rn] ?? 0;
        const theoretical = theoreticalByResource[rn] ?? 0;
        if (theoretical === 0 && actual === 0) {
            continue;
        }
        result.push({
            n: rn,
            act: r2(actual),
            max: r2(theoretical),
            rat: theoretical > 0 ? r2(actual / theoretical) : 0,
        });
    }

    return result.sort((a, b) => a.rat - b.rat);
}

// ── Root cause tracing (ported from LiveStateTab.tsx) ─────────────────────

function traceOriginFrom(
    facilityName: string,
    rowsMap: Map<string, FacilityPerf>,
    resourceProductionRatios: Map<string, number>,
    visited: Set<string> = new Set(),
): {
    rootFacility: string;
    rootType: 'w' | 'rs' | 'mf';
    rootResource?: string;
    rootResourceProductionRatio?: number;
} | null {
    if (visited.has(facilityName)) {
        return null;
    }
    visited.add(facilityName);

    const row = rowsMap.get(facilityName);
    if (!row || row.bn === '') {
        return null;
    }

    if (row.bn === 'w') {
        return { rootFacility: facilityName, rootType: 'w' };
    }

    // Resource bottleneck: find the worst resource, then trace its producers
    const worstResource = row.wi;
    if (!worstResource) {
        return null;
    }

    const producers = RESOURCE_PRODUCERS.get(worstResource) ?? [];

    // Check which producers are themselves bottlenecked
    const bottlenecked = [...producers]
        .filter((p) => {
            const r = rowsMap.get(p);
            return r && r.bn !== '';
        })
        .sort((a, b) => (rowsMap.get(a)?.eff ?? 1) - (rowsMap.get(b)?.eff ?? 1));

    for (const upstream of bottlenecked) {
        const result = traceOriginFrom(upstream, rowsMap, resourceProductionRatios, new Set(visited));
        if (result) {
            return result;
        }
    }

    const productionRatio = resourceProductionRatios.get(worstResource) ?? 0;
    if (productionRatio >= MARKET_FAILURE_PRODUCTION_THRESHOLD) {
        return {
            rootFacility: facilityName,
            rootType: 'mf',
            rootResource: worstResource,
            rootResourceProductionRatio: productionRatio,
        };
    }
    return {
        rootFacility: facilityName,
        rootType: 'rs',
        rootResource: worstResource,
        rootResourceProductionRatio: productionRatio,
    };
}

function computeRootCauses(rows: FacilityPerf[], resourceActuals: ResourceGap[]): RootCause[] {
    const rowsMap = new Map(rows.map((r) => [r.n, r]));
    const resourceProductionRatios = new Map(resourceActuals.map((r) => [r.n, r.rat]));

    // First pass: for each bottlenecked facility, find its root
    const originMap = new Map<
        string,
        {
            rootFacility: string;
            rootType: 'w' | 'rs' | 'mf';
            rootResource?: string;
            rootResourceProductionRatio?: number;
        }
    >();
    for (const row of rows) {
        if (row.bn === '') {
            continue;
        }
        const origin = traceOriginFrom(row.n, rowsMap, resourceProductionRatios);
        if (origin) {
            originMap.set(row.n, origin);
        }
    }

    // Second pass: group victims by root facility
    type RootCausesAcc = {
        rootFacility: string;
        rootType: 'w' | 'rs' | 'mf';
        rootResource?: string;
        rootResourceProductionRatio?: number;
        victims: string[];
    };
    const groups = new Map<string, RootCausesAcc>();
    for (const [facName, origin] of originMap.entries()) {
        let group = groups.get(origin.rootFacility);
        if (!group) {
            group = {
                rootFacility: origin.rootFacility,
                rootType: origin.rootType,
                rootResource: origin.rootResource,
                rootResourceProductionRatio: origin.rootResourceProductionRatio,
                victims: [],
            };
            groups.set(origin.rootFacility, group);
        }
        if (origin.rootFacility !== facName) {
            group.victims.push(facName);
        }
    }

    return [...groups.values()]
        .sort((a, b) => b.victims.length - a.victims.length)
        .map((g) => ({
            fac: g.rootFacility,
            rt: g.rootType,
            ri: g.rootResource,
            riv: g.rootResourceProductionRatio,
            v: g.victims,
        }));
}

/**
 * Create a MonthlyReport from the current cached game state.
 */
export function extractMonthlyReport(): MonthlyReport {
    const { tick, planets } = getAllPlanetsSync();
    const { agents } = getAllAgentsSync();
    const forexMMs = getForexMarketMakersSync();
    const shipbuilders = getShipbuilderAgentsSync();
    const arbitrage = getArbitrageTradersSync();
    const allAgents = [...agents, ...forexMMs, ...shipbuilders, ...arbitrage];

    const agentReports: MonthlyAgentReport[] = allAgents.map((a) => {
        let netBalance = 0;
        let monthlyNetIncome = 0;
        let totalWorkers = 0;
        let facilityCount = 0;

        for (const assets of Object.values(a.assets ?? {})) {
            netBalance += (assets.deposits ?? 0) - totalOutstandingLoans(assets.activeLoans ?? []);
            monthlyNetIncome += assets.monthAcc?.revenue ?? 0;
            totalWorkers += Math.round((assets.monthAcc?.totalWorkersTicks ?? 0) / 30);
            facilityCount += assets.productionFacilities?.length ?? 0;
        }

        return {
            agentId: a.id,
            name: a.name,
            associatedPlanetId: a.associatedPlanetId ?? '',
            netBalance,
            monthlyNetIncome,
            totalWorkers,
            facilityCount,
        };
    });

    const planetReports: MonthlyPlanetReport[] = planets.map((planet) => {
        const agentCount = allAgents.filter((a) => a.assets?.[planet.id] !== undefined).length;
        const demo = computeDemographicMetrics(planet);
        return {
            planetId: planet.id,
            name: planet.name,
            population: computePopulationTotal(planet),
            gdp:
                planet._gdp ??
                Object.values(planet.avgMarketResult).reduce((sum, r) => sum + r.clearingPrice * r.totalVolume, 0) *
                    TICKS_PER_YEAR +
                    (planet.monthTransferVolume * 1) / 3,
            costOfLiving: computeCostOfLiving(planet, false),
            costOfLivingRich: computeCostOfLiving(planet, true),
            wages: {
                edu0: planet.wagePerEdu.none ?? 0,
                edu1: planet.wagePerEdu.primary ?? 0,
                edu2: planet.wagePerEdu.secondary ?? 0,
                edu3: planet.wagePerEdu.tertiary ?? 0,
            },
            policyRate: planet.bank.loanRate,
            moneySupply: planet.bank.deposits,
            bankEquity: planet.bank.equity,
            foodPrice: planet.marketPrices[groceryServiceResourceType.name] ?? 1,
            agentCount,
            ...demo,
        };
    });

    return { tick, agents: agentReports, planets: planetReports };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function r2(v: number): number {
    return Math.round(v * 100) / 100;
}

function pctChange(before: number, after: number): number {
    if (before === 0) {
        return after === 0 ? 0 : 100;
    }
    return r2(((after - before) / Math.abs(before)) * 100);
}

function computeEmploymentRate(planet: MonthlyPlanetReport): number {
    return planet.population > 0 ? planet.totalEmployed / planet.population : 0;
}

function computeDeathRatePer100k(planet: MonthlyPlanetReport): number {
    return planet.population > 0 ? ((planet.deathsThisMonth * TICKS_PER_YEAR) / planet.population) * 100000 : 0;
}

/**
 * Build the condensed prompt-friendly report.
 */
export function computeCondensedReport(current: MonthlyReport, previous: MonthlyReport | null): CondensedReport {
    // ── 0. Human-readable dates ───────────────────────────────────────────
    const date = tickToMonthYear(current.tick);
    const previousDate = previous ? tickToMonthYear(previous.tick) : null;

    // ── 1. Agent deltas (compact keys) ────────────────────────────────────
    const agentDeltas: AgentDelta[] = [];
    if (previous) {
        const prevByAgent = new Map<string, number>();
        for (const a of previous.agents) {
            prevByAgent.set(a.agentId, a.netBalance);
        }
        for (const a of current.agents) {
            const prevBal = prevByAgent.get(a.agentId) ?? a.netBalance;
            agentDeltas.push({
                aid: a.agentId,
                n: a.name,
                pid: a.associatedPlanetId,
                pn: r2(prevBal),
                cn: r2(a.netBalance),
                d: r2(a.netBalance - prevBal),
                dp: pctChange(prevBal, a.netBalance),
            });
        }
    } else {
        for (const a of current.agents) {
            agentDeltas.push({
                aid: a.agentId,
                n: a.name,
                pid: a.associatedPlanetId,
                pn: 0,
                cn: r2(a.netBalance),
                d: r2(a.netBalance),
                dp: 100,
            });
        }
    }
    const sorted = [...agentDeltas].sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const topMovers = sorted.slice(0, TOP_N);
    const bottomMovers = sorted.slice(-TOP_N).reverse();

    // ── 2. Facility performance (aggregated, pre-digested) ────────────────
    const allAgentsForFac = [
        ...getAllAgentsSync().agents,
        ...getForexMarketMakersSync(),
        ...getShipbuilderAgentsSync(),
        ...getArbitrageTradersSync(),
    ];
    const facilityRows = aggregateFacilities(allAgentsForFac);

    // Max scales for resource gap computation
    const maxScales: Record<string, number> = {};
    for (const row of facilityRows) {
        maxScales[row.n] = row.msc;
    }

    // Total population for resource demand
    const planetsRaw = getAllPlanetsSync().planets;
    const totalPop = current.planets.reduce((s, p) => s + p.population, 0);

    // ── 3. Resource production gaps ───────────────────────────────────────
    const resourceGaps = buildResourceActuals(facilityRows, maxScales, totalPop);

    // ── 4. Root cause chains ──────────────────────────────────────────────
    const rootCauses = computeRootCauses(facilityRows, resourceGaps);

    // ── 5. Planet snapshots (current month) ───────────────────────────────
    const planetSnaps: PlanetSnap[] = current.planets.map((p) => ({
        id: p.planetId,
        n: p.name,
        pop: p.population,
        gdpPC: p.population > 0 ? r2(p.gdp / p.population) : 0,
        emp: r2(computeEmploymentRate(p)),
        dr: r2(computeDeathRatePer100k(p)),
        col: r2(p.costOfLiving),
        gStv: r2(p.avgGroceryStarvation),
        hStv: r2(p.avgHealthcareStarvation),
        eStv: r2(p.avgEducationStarvation),
        rStv: r2(p.avgRetailStarvation),
    }));

    // ── 6. Planet deltas (month-over-month) ───────────────────────────────
    const planetDeltas: PlanetDelta[] = [];
    if (previous) {
        const prevByPlanet = new Map<string, MonthlyPlanetReport>();
        for (const p of previous.planets) {
            prevByPlanet.set(p.planetId, p);
        }
        for (const p of current.planets) {
            const prev = prevByPlanet.get(p.planetId);
            if (!prev) {
                continue;
            }

            const prevGdpPC = prev.population > 0 ? prev.gdp / prev.population : 0;
            const curGdpPC = p.population > 0 ? p.gdp / p.population : 0;
            const prevEmp = computeEmploymentRate(prev);
            const curEmp = computeEmploymentRate(p);
            const prevDr = computeDeathRatePer100k(prev);
            const curDr = computeDeathRatePer100k(p);

            planetDeltas.push({
                id: p.planetId,
                n: p.name,
                gdpPC_d: pctChange(prevGdpPC, curGdpPC),
                pop_d: pctChange(prev.population, p.population),
                emp_d: r2(curEmp - prevEmp),
                col_d: pctChange(prev.costOfLiving, p.costOfLiving),
                ms_d: pctChange(prev.moneySupply, p.moneySupply),
                dr_d: r2(curDr - prevDr),
            });
        }
    } else {
        for (const p of current.planets) {
            planetDeltas.push({
                id: p.planetId,
                n: p.name,
                gdpPC_d: 100,
                pop_d: 100,
                emp_d: r2(computeEmploymentRate(p)),
                col_d: 100,
                ms_d: 100,
                dr_d: r2(computeDeathRatePer100k(p)),
            });
        }
    }

    // ── 7. Commodity volatility ───────────────────────────────────────────
    const volatileCommodities: CommodityVol[] = [];
    if (previous) {
        for (const planet of planetsRaw) {
            const prevPlanet = previous.planets.find((p) => p.planetId === planet.id);
            if (!prevPlanet) {
                continue;
            }

            for (const resource of ALL_RESOURCES) {
                if (resource.form === 'services' || resource.form === 'currency') {
                    continue;
                }

                const currentPrice = planet.marketPrices[resource.name] ?? 0;
                const marketResult = planet.avgMarketResult[resource.name];
                if (!marketResult || marketResult.totalVolume === 0) {
                    continue;
                }

                const prevPrice = marketResult.clearingPrice * 0.95 + currentPrice * 0.05;
                const deltaPct = pctChange(prevPrice, currentPrice);
                if (Math.abs(deltaPct) > PRICE_CHANGE_THRESHOLD_PCT) {
                    volatileCommodities.push({
                        pid: planet.id,
                        pn: planet.name,
                        rn: resource.name,
                        d: r2(deltaPct),
                    });
                }
            }
        }
    }

    // ── 8. Currency info ──────────────────────────────────────────────────
    const currencyInfo: CurInfo[] = [];
    for (const planet of planetsRaw) {
        const curName = getCurrencyResourceName(planet.id);
        const mapping = currencyMapping[planet.id];
        const rate = planet.marketPrices[curName] ?? DEFAULT_EXCHANGE_RATE;
        currencyInfo.push({
            pid: planet.id,
            pn: planet.name,
            cn: mapping?.resource.name ?? curName,
            sy: mapping?.symbol ?? '?',
            ex: r2(rate),
        });
    }

    return {
        t: current.tick,
        d: date,
        pd: previousDate,
        a: topMovers,
        b: bottomMovers,
        fp: facilityRows,
        rg: resourceGaps,
        rc: rootCauses,
        pl: planetSnaps,
        pd_d: planetDeltas,
        cv: volatileCommodities,
        ci: currencyInfo,
    };
}

/**
 * Generate and log the current monthly news prompt (condensed, enriched).
 */
export function generateAndLogNewsPrompt(): string {
    const currentReport = extractMonthlyReport();
    const previousReport = newsMemory.getLatest();
    const condensed = computeCondensedReport(currentReport, previousReport);
    const prompt = buildNewsPrompt(condensed);
    newsMemory.store(currentReport);

    console.log('[newsAgent] Condensed prompt generated:\n' + prompt);
    return prompt;
}
