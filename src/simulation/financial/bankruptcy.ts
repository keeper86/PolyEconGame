import {
    BANKRUPTCY_ASSET_FRACTION,
    BANKRUPTCY_DEBT_WRITE_OFF_FRACTION,
    BANKRUPTCY_RESTRUCTURE_MARKET_SHARE,
} from '../constants';
import { processFacilityContraction } from '../agents/recycler';
import type { Agent, GameState, Planet } from '../planet/planet';
import { pushTickerEvent, pushBankruptcyRecord } from '../planet/planet';
import { LOAN_TERM_TICKS, makeLoan, totalOutstandingLoans } from './loanTypes';
import { nextRefoundName, refoundId } from './refound';
import { liquidateAgent } from './liquidation';

let debtWriteOffFraction = BANKRUPTCY_DEBT_WRITE_OFF_FRACTION;

export function setBankruptcyDebtWriteOffFraction(fraction: number): void {
    debtWriteOffFraction = fraction;
}

const AGENT_ID_FIELDS = new Set([
    'tenantAgentId',
    'posterAgentId',
    'postedByAgentId',
    'commissioningAgentId',
    'acceptedByAgentId',
    'sellerAgentId',
    'buyerAgentId',
]);

function repointAgentReferences(value: unknown, oldId: string, newId: string): void {
    if (Array.isArray(value)) {
        for (const item of value) {
            repointAgentReferences(item, oldId, newId);
        }
    } else if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        for (const [key, val] of Object.entries(obj)) {
            if (AGENT_ID_FIELDS.has(key) && typeof val === 'string' && val === oldId) {
                obj[key] = newId;
            } else {
                repointAgentReferences(val, oldId, newId);
            }
        }
    }
}

function agentMarketShare(gameState: GameState, planet: Planet, agent: Agent): number {
    const total = [...gameState.agents.values()].reduce((sum, a) => {
        if (a.id === planet.governmentId) {
            return sum;
        }
        const assets = a.assets[planet.id];
        if (!assets) {
            return sum;
        }
        return sum + assets.lastMonthAcc.productionValue;
    }, 0);
    const own = agent.assets[planet.id]?.lastMonthAcc.productionValue ?? 0;
    if (total <= 0) {
        return 0;
    }
    return own / total;
}

function canLiquidate(agent: Agent): boolean {
    for (const ship of agent.ships) {
        if (ship.state.type === 'idle' || ship.state.type === 'listed' || ship.state.type === 'derelict') {
            continue;
        }
        return false;
    }
    return true;
}

export function processBankruptcy(gameState: GameState, planet: Planet, agent: Agent, tick: number): Agent | null {
    if (agent.id === planet.governmentId || agent.id === planet.recycler.id) {
        return null;
    }
    if (!agent.assets[planet.id]) {
        return null;
    }

    if (agent.automated) {
        return terminateAndRefound(gameState, planet, agent, tick);
    }

    if (agentMarketShare(gameState, planet, agent) > BANKRUPTCY_RESTRUCTURE_MARKET_SHARE || !canLiquidate(agent)) {
        const refound = terminateAndRefound(gameState, planet, agent, tick);
        if (!refound) {
            return null;
        }
        refound.automated = true;
        refound.automateWorkerAllocation = true;
        refound.logo = 'ai_company';

        pushBankruptcyRecord(gameState, {
            agentId: agent.id,
            agentName: agent.name,
            planetId: planet.id,
            tick,
            outcome: 'restructured',
            message: `${agent.name} bankrupt; restructured as ${refound.name} under automated administration`,
        });

        return refound;
    }

    return liquidateAgent(gameState, planet, agent, tick);
}

export function terminateAndRefound(gameState: GameState, planet: Planet, agent: Agent, tick: number): Agent | null {
    if (agent.id === planet.governmentId) {
        return null;
    }
    const assets = agent.assets[planet.id];
    if (!assets) {
        return null;
    }
    const bank = planet.bank;

    const debt = totalOutstandingLoans(assets.activeLoans);
    const writtenOff = debt * debtWriteOffFraction;
    if (writtenOff > 0) {
        bank.writeOffs += writtenOff;
        bank.loans -= writtenOff;
    }
    bank.bankruptcies += 1;

    for (const facility of assets.productionFacilities) {
        const targetMax = Math.max(1, Math.floor(facility.maxScale * BANKRUPTCY_ASSET_FRACTION));
        if (targetMax < facility.maxScale) {
            processFacilityContraction(planet, facility, agent, targetMax, gameState, 0, 1, 'bank');
        }
    }

    const retained = assets.deposits * (1 - BANKRUPTCY_ASSET_FRACTION);
    assets.deposits *= BANKRUPTCY_ASSET_FRACTION;
    bank.deposits -= retained;
    bank.profit += retained;

    const retainedDebt = debt - writtenOff;
    assets.activeLoans = [];
    if (retainedDebt > 0) {
        assets.activeLoans.push(
            makeLoan('rollover', retainedDebt, bank.loanRatePerYear, tick, tick + LOAN_TERM_TICKS.rollover, false),
        );
    }

    const oldId = agent.id;
    let newId = refoundId(agent.name, tick);
    let suffix = 2;
    while (newId !== oldId && gameState.agents.has(newId)) {
        newId = `${refoundId(agent.name, tick)}-${suffix}`;
        suffix++;
    }

    const refound: Agent = {
        ...agent,
        id: newId,
        name: nextRefoundName(agent.name),
        foundedTick: tick,
        starterLoanTaken: true,
    };

    repointAgentReferences(assets, oldId, newId);
    repointAgentReferences(refound.ships, oldId, newId);
    repointAgentReferences(planet.resources, oldId, newId);

    gameState.agents.delete(oldId);
    gameState.agents.set(newId, refound);

    pushTickerEvent(gameState, {
        category: 'agentBankrupt',
        planetId: planet.id,
        agentId: oldId,
        agentName: agent.name,
        details: { kind: 'companyRefounded', successorName: refound.name },
        tick,
    });

    return refound;
}
