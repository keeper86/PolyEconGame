import { TICKS_PER_MONTH, TICKS_PER_YEAR } from './constants';
import { totalOutstandingLoans } from './financial/loanTypes';
import { computeCostOfLiving } from './market/serviceDefinitions';
import { groceryServiceResourceType } from './planet/services';
import type { GameState } from './planet/planet';
import { computePopulationTotal } from './snapshotRepository';

// ── Types (worker-local, no server dependency) ──

interface WorkerAgentReport {
    agentId: string;
    name: string;
    associatedPlanetId: string;
    netBalance: number;
    monthlyNetIncome: number;
    totalWorkers: number;
    facilityCount: number;
    productionValue: number;
}

interface WorkerPlanetReport {
    planetId: string;
    name: string;
    population: number;
    gdp: number;
    costOfLiving: number;
    costOfLivingRich: number;
    wages: { edu0: number; edu1: number; edu2: number; edu3: number };
    policyRate: number;
    moneySupply: number;
    bankEquity: number;
    foodPrice: number;
}

interface WorkerMonthlyReport {
    tick: number;
    agents: WorkerAgentReport[];
    planets: WorkerPlanetReport[];
}

// ── In-memory history (worker-local singleton) ──

const MAX_HISTORY = 12;
const history: WorkerMonthlyReport[] = [];

function storeReport(report: WorkerMonthlyReport): void {
    history.push(report);
    if (history.length > MAX_HISTORY) {
        history.splice(0, history.length - MAX_HISTORY);
    }
}

function getPreviousReport(): WorkerMonthlyReport | null {
    if (history.length < 2) {
        return null;
    }
    return history[history.length - 2];
}

// ── Extractor — works directly on GameState ──

function extractReport(state: GameState): WorkerMonthlyReport {
    const agents: WorkerAgentReport[] = [];

    for (const agent of state.agents.values()) {
        let netBalance = 0;
        let monthlyNetIncome = 0;
        let totalWorkers = 0;
        let facilityCount = 0;
        let productionValue = 0;

        for (const assets of Object.values(agent.assets ?? {})) {
            netBalance += (assets.deposits ?? 0) - totalOutstandingLoans(assets.activeLoans ?? []);
            monthlyNetIncome += assets.monthAcc?.revenue ?? 0;
            const workers = Math.round((assets.monthAcc?.totalWorkersTicks ?? 0) / TICKS_PER_MONTH);
            totalWorkers += workers;
            facilityCount += assets.productionFacilities?.length ?? 0;
            productionValue += assets.monthAcc?.productionValue ?? 0;
        }

        agents.push({
            agentId: agent.id,
            name: agent.name,
            associatedPlanetId: agent.associatedPlanetId ?? '',
            netBalance,
            monthlyNetIncome,
            totalWorkers,
            facilityCount,
            productionValue,
        });
    }

    // Also include forex MMs, shipbuilders, arbitrage traders
    for (const agent of state.forexMarketMakers.values()) {
        let netBalance = 0;
        let monthlyNetIncome = 0;
        for (const assets of Object.values(agent.assets ?? {})) {
            netBalance += (assets.deposits ?? 0) - totalOutstandingLoans(assets.activeLoans ?? []);
            monthlyNetIncome += assets.monthAcc?.revenue ?? 0;
        }
        agents.push({
            agentId: agent.id,
            name: agent.name,
            associatedPlanetId: agent.associatedPlanetId ?? '',
            netBalance,
            monthlyNetIncome,
            totalWorkers: 0,
            facilityCount: 0,
            productionValue: 0,
        });
    }
    for (const agent of state.shipbuilderAgents.values()) {
        let netBalance = 0;
        let monthlyNetIncome = 0;
        for (const assets of Object.values(agent.assets ?? {})) {
            netBalance += (assets.deposits ?? 0) - totalOutstandingLoans(assets.activeLoans ?? []);
            monthlyNetIncome += assets.monthAcc?.revenue ?? 0;
        }
        agents.push({
            agentId: agent.id,
            name: agent.name,
            associatedPlanetId: agent.associatedPlanetId ?? '',
            netBalance,
            monthlyNetIncome,
            totalWorkers: 0,
            facilityCount: 0,
            productionValue: 0,
        });
    }
    for (const agent of state.arbitrageTraders.values()) {
        let netBalance = 0;
        let monthlyNetIncome = 0;
        for (const assets of Object.entries(agent.assets ?? {})) {
            netBalance += (assets[1].deposits ?? 0) - totalOutstandingLoans(assets[1].activeLoans ?? []);
            monthlyNetIncome += assets[1].monthAcc?.revenue ?? 0;
        }
        agents.push({
            agentId: agent.id,
            name: agent.name,
            associatedPlanetId: agent.associatedPlanetId ?? '',
            netBalance,
            monthlyNetIncome,
            totalWorkers: 0,
            facilityCount: 0,
            productionValue: 0,
        });
    }

    const planets: WorkerPlanetReport[] = [...state.planets.values()].map((planet) => ({
        planetId: planet.id,
        name: planet.name,
        population: computePopulationTotal(planet),
        gdp:
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
    }));

    return { tick: state.tick, agents, planets };
}

// ── Prompt builder ──

function buildPrompt(current: WorkerMonthlyReport, previous: WorkerMonthlyReport | null): string {
    const currentData = JSON.stringify(current, null, 2);
    const previousData = previous ? JSON.stringify(previous, null, 2) : 'None (first report)';

    return `Write a monthly economic report for our interstellar strategy game.
Compare this month to last month and highlight significant changes.

DATA (JSON):
${currentData}

Focus on:
1. The rise and fall of major agents.
2. Which commodities are volatile.
3. Overall economic health of the system.

Old data:
${previousData}

Return JSON array of articles with format:
[
  {
    "title": "string",
    "summary": "string",
    "planetId": "string | null",
    "category": "agent | commodity | economy | population",
    "importance": 1-10
  }
]

Important: Only include articles for genuinely interesting or surprising events.
Do not fabricate data - base everything on the numbers provided.`;
}

// ── Public entry point ──

export function generateAndLogNewsPrompt(state: GameState): string {
    const current = extractReport(state);
    const previous = getPreviousReport();
    const prompt = buildPrompt(current, previous);
    storeReport(current);
    return prompt;
}
