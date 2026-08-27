import { makeAgentPlanetAssets, makeStorage } from '../initialUniverse/helpers';
import type { Agent, GameState } from '../planet/planet';
import { pushTickerEvent } from '../planet/planet';
import type { OutboundMessage, PendingAction } from './messages';

export function handleCreateAgent(
    state: GameState,
    action: Extract<PendingAction, { type: 'createAgent' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, agentName, planetId, logo } = action;

    const storage = makeStorage({ planetId, id: `${agentId}-storage` });
    const assets = makeAgentPlanetAssets([], storage, null);

    const newAgent: Agent = {
        id: agentId,
        name: agentName,
        logo: logo ?? 'ai_company',
        foundedTick: state.tick,
        starterLoanTaken: false,
        associatedPlanetId: planetId,
        ships: [],
        automated: false,
        automateWorkerAllocation: false,
        assets: { [planetId]: assets },
    };

    assets.licenses = {
        commercial: { acquiredTick: state.tick, frozen: false },
        workforce: { acquiredTick: state.tick, frozen: false },
    };
    const homePlanet = state.planets.get(planetId);
    if (homePlanet) {
        assets.wagePerEdu = { ...homePlanet.wagePerEdu };
    }

    state.agents.set(agentId, newAgent);

    const planet = state.planets.get(planetId);
    pushTickerEvent(state, {
        category: 'agentCreated',
        planetId,
        agentId,
        agentName,
        message: `${agentName} founded on ${planet?.name ?? planetId}`,
        tick: state.tick,
    });

    console.log(`[worker] Created agent '${agentName}' (${agentId}) on planet '${planetId}'`);
    safePostMessage({ type: 'agentCreated', requestId, agentId, processedAtTick: state.tick });
}

export function handleSetAutomation(
    state: GameState,
    action: Extract<PendingAction, { type: 'setAutomation' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, automateWorkerAllocation } = action;
    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({
            type: 'automationFailed',
            requestId,
            reason: 'Agent not found',
            processedAtTick: state.tick,
        });
        return;
    }
    agent.automateWorkerAllocation = automateWorkerAllocation;
    console.log(
        `[worker] Automation updated for agent '${agentId}': ` + `workerAllocation=${automateWorkerAllocation}`,
    );
    safePostMessage({ type: 'automationSet', requestId, agentId, processedAtTick: state.tick });
}

export function handleSetWorkerAllocationTargets(
    state: GameState,
    action: Extract<PendingAction, { type: 'setWorkerAllocationTargets' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, targets } = action;
    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({
            type: 'workerAllocationFailed',
            requestId,
            reason: 'Agent not found',
            processedAtTick: state.tick,
        });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'workerAllocationFailed',
            requestId,
            reason: `Agent has no assets on planet '${planetId}'`,
            processedAtTick: state.tick,
        });
        return;
    }

    for (const [edu, count] of Object.entries(targets)) {
        if (typeof count === 'number' && count >= 0) {
            (assets.allocatedWorkers as Record<string, number>)[edu] = count;
        }
    }
    console.log(`[worker] Worker allocation targets updated for agent '${agentId}' on '${planetId}'`);
    safePostMessage({ type: 'workerAllocationSet', requestId, agentId, processedAtTick: state.tick });
}

export function handleAcknowledgeBankruptcy(
    state: GameState,
    action: Extract<PendingAction, { type: 'acknowledgeBankruptcy' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId } = action;
    const recordIndex = state.bankruptcies.findIndex((record) => record.agentId === agentId);
    if (recordIndex === -1) {
        safePostMessage({
            type: 'bankruptcyAcknowledgeFailed',
            requestId,
            reason: 'No bankruptcy record found for agent',
            processedAtTick: state.tick,
        });
        return;
    }
    state.bankruptcies.splice(recordIndex, 1);
    console.log(`[worker] Bankruptcy acknowledged for agent '${agentId}'`);
    safePostMessage({ type: 'bankruptcyAcknowledged', requestId, agentId, processedAtTick: state.tick });
}

export function handleAgentAction(
    state: GameState,
    action: PendingAction,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    switch (action.type) {
        case 'createAgent':
            handleCreateAgent(state, action, safePostMessage);
            break;
        case 'setAutomation':
            handleSetAutomation(state, action, safePostMessage);
            break;
        case 'setWorkerAllocationTargets':
            handleSetWorkerAllocationTargets(state, action, safePostMessage);
            break;
        case 'acknowledgeBankruptcy':
            handleAcknowledgeBankruptcy(state, action, safePostMessage);
            break;
        default:
            break;
    }
}
