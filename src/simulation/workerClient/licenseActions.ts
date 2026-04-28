import { COMMERCIAL_LICENSE_COST, WORKFORCE_LICENSE_COST } from '../constants';
import { makeAgentPlanetAssets } from '../utils/testHelper';
import type { GameState } from '../planet/planet';
import type { OutboundMessage, PendingAction } from './messages';

export function handleAcquireLicense(
    state: GameState,
    action: Extract<PendingAction, { type: 'acquireLicense' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, licenseType } = action;

    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({ type: 'licenseAcquisitionFailed', requestId, reason: 'Agent not found' });
        return;
    }

    const planet = state.planets.get(planetId);
    if (!planet) {
        safePostMessage({
            type: 'licenseAcquisitionFailed',
            requestId,
            reason: `Planet '${planetId}' not found`,
        });
        return;
    }

    // Ensure assets entry exists for this planet
    let assets = agent.assets[planetId];
    const isNewPlanet = !assets;

    if (!assets) {
        assets = makeAgentPlanetAssets(planetId, { licenses: {} });
        agent.assets[planetId] = assets;
    }

    // Enforce commercial license must be acquired before workforce
    if (licenseType === 'workforce' && !assets.licenses?.commercial) {
        safePostMessage({
            type: 'licenseAcquisitionFailed',
            requestId,
            reason: `A commercial license must be acquired before a workforce license on planet '${planetId}'`,
        });
        return;
    }

    // Check for duplicate
    if (assets.licenses?.[licenseType]) {
        safePostMessage({
            type: 'licenseAcquisitionFailed',
            requestId,
            reason: `Agent already holds a '${licenseType}' license on planet '${planetId}'`,
        });
        return;
    }

    const cost = licenseType === 'commercial' ? COMMERCIAL_LICENSE_COST : WORKFORCE_LICENSE_COST;

    if (isNewPlanet) {
        // Bootstrap: initial loan funds the license fee
        assets.deposits = 0;
        assets.loans = cost;
        planet.bank.loans += cost;
        planet.bank.deposits += cost; // new money enters the economy
    } else {
        // Agent already has assets on this planet — deduct from deposits
        if (assets.deposits < cost) {
            safePostMessage({
                type: 'licenseAcquisitionFailed',
                requestId,
                reason: `Insufficient deposits. Required: ${cost}, available: ${assets.deposits}`,
            });
            return;
        }
        console.log('before:', assets.deposits);

        assets.deposits -= cost;
        console.log('after:', assets.deposits);
        // No change to planet.bank.deposits: money moves from this agent to the government,
        // keeping aggregate bank deposits (Σ agent deposits) constant.
    }

    // Grant the license
    assets.licenses = assets.licenses ?? {};
    assets.licenses[licenseType] = { acquiredTick: state.tick, frozen: false };

    // Credit the government agent
    const govAssets = state.agents.get(planet.governmentId)?.assets[planetId];
    if (govAssets) {
        govAssets.deposits += cost;
    } else {
        // This should never happen since government should always have assets on its own planet
        console.warn(
            `Government agent '${planet.governmentId}' has no assets on its own planet '${planetId}' to receive license fee`,
        );
    }

    console.log(
        `[worker] Agent '${agentId}' acquired '${licenseType}' license on planet '${planetId}' (cost: ${cost})`,
    );
    safePostMessage({ type: 'licenseAcquired', requestId, agentId, planetId, licenseType });
}
