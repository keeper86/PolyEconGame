import type { GameState, Agent } from '../planet/planet';
import type { OutboundMessage, PendingAction } from './messages';
import { makeAgent } from '../utils/testHelper';

/**
 * Handle 'createAgent' action
 */
export function handleCreateAgent(
    state: GameState,
    action: Extract<PendingAction, { type: 'createAgent' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, agentName, planetId } = action;

    const newAgent: Agent = makeAgent(agentId, planetId, agentName);
    newAgent.automated = false;
    newAgent.automateWorkerAllocation = false;
    newAgent.foundedTick = state.tick;
    state.agents.set(agentId, newAgent);
    console.log(`[worker] Created agent '${agentName}' (${agentId}) on planet '${planetId}'`);
    safePostMessage({ type: 'agentCreated', requestId, agentId });
}

/**
 * Handle 'setAutomation' action
 */
export function handleSetAutomation(
    state: GameState,
    action: Extract<PendingAction, { type: 'setAutomation' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, automateWorkerAllocation } = action;
    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'automationFailed', requestId, reason: 'Agent not found' });
        return;
    }
    agent.automateWorkerAllocation = automateWorkerAllocation;
    console.log(
        `[worker] Automation updated for agent '${agentId}': ` + `workerAllocation=${automateWorkerAllocation}`,
    );
    safePostMessage({ type: 'automationSet', requestId, agentId });
}

/**
 * Handle 'setWorkerAllocationTargets' action
 */
export function handleSetWorkerAllocationTargets(
    state: GameState,
    action: Extract<PendingAction, { type: 'setWorkerAllocationTargets' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, targets } = action;
    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'workerAllocationFailed', requestId, reason: 'Agent not found' });
        return;
    }
    const assets = agent.assets[planetId];
    if (!assets) {
        safePostMessage({
            type: 'workerAllocationFailed',
            requestId,
            reason: `Agent has no assets on planet '${planetId}'`,
        });
        return;
    }
    // Merge provided targets into allocatedWorkers (missing levels stay unchanged)
    for (const [edu, count] of Object.entries(targets)) {
        if (typeof count === 'number' && count >= 0) {
            (assets.allocatedWorkers as Record<string, number>)[edu] = count;
        }
    }
    console.log(`[worker] Worker allocation targets updated for agent '${agentId}' on '${planetId}'`);
    safePostMessage({ type: 'workerAllocationSet', requestId, agentId });
}

/**
 * Dispatch agent-related actions to the appropriate handler
 */
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
        default:
            // This function only handles agent actions
            break;
    }
}
