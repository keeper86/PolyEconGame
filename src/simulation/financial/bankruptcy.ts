import { BANKRUPTCY_ASSET_FRACTION } from '../constants';
import { processFacilityContraction } from '../agents/recycler';
import type { Agent, GameState, Planet } from '../planet/planet';
import { pushTickerEvent } from '../planet/planet';
import { totalOutstandingLoans } from './loanTypes';
import { nextRefoundName, refoundId } from './refound';

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

export function terminateAndRefound(gameState: GameState, planet: Planet, agent: Agent, tick: number): Agent | null {
    if (agent.id === planet.governmentId) {
        return null;
    }
    const assets = agent.assets[planet.id];
    if (!assets) {
        return null;
    }
    const bank = planet.bank;

    // Write off all outstanding loans; the bank absorbs them.
    const debt = totalOutstandingLoans(assets.activeLoans);
    if (debt > 0) {
        planet.debtWriteOffs += debt;
        bank.loans -= debt;
    }
    planet.bankruptcies += 1;

    // Sell the removed 2.5% of every facility's scale to the recycler at full value; the bank gets the price.
    for (const facility of assets.productionFacilities) {
        const targetMax = Math.max(1, Math.floor(facility.maxScale * BANKRUPTCY_ASSET_FRACTION));
        if (targetMax < facility.maxScale) {
            processFacilityContraction(planet, facility, agent, targetMax, gameState, 0, 1, 'bank');
        }
    }

    // Re-found with 97.5% of deposits, loan-free. The retained 2.5% stays with the bank.
    const retained = assets.deposits * (1 - BANKRUPTCY_ASSET_FRACTION);
    assets.deposits *= BANKRUPTCY_ASSET_FRACTION;
    bank.deposits -= retained;
    planet.bankProfit += retained;
    assets.activeLoans = [];

    const oldId = agent.id;
    const refound: Agent = {
        ...agent,
        id: refoundId(agent.name, tick),
        name: nextRefoundName(agent.name),
        foundedTick: tick,
        starterLoanTaken: true,
    };

    // Re-point contracts, ships and resource claims from the old id to the re-founded company.
    repointAgentReferences(assets, oldId, refound.id);
    repointAgentReferences(refound.ships, oldId, refound.id);
    repointAgentReferences(planet.resources, oldId, refound.id);

    gameState.agents.delete(oldId);
    gameState.agents.set(refound.id, refound);

    planet.refoundCount += 1;
    pushTickerEvent(gameState, {
        category: 'agentBankrupt',
        planetId: planet.id,
        agentId: oldId,
        agentName: agent.name,
        message: `${agent.name} bankrupt; refounded as ${refound.name}`,
        tick,
    });

    return refound;
}
