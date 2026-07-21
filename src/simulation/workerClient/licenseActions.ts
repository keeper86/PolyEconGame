import { COMMERCIAL_LICENSE_COST, WORKFORCE_LICENSE_COST } from '../constants';
import { makeAgentPlanetAssets } from '../utils/testHelper';
import { grantLoan } from '../financial/loanTypes';
import type { GameState } from '../planet/planet';
import { pushTickerEvent } from '../planet/planet';
import type { OutboundMessage, PendingAction } from './messages';

export function handleAcquireLicense(
    state: GameState,
    action: Extract<PendingAction, { type: 'acquireLicense' }>,
    safePostMessage: (msg: OutboundMessage) => void,
): void {
    const { requestId, agentId, planetId, licenseType } = action;

    const agent = state.agents.get(agentId);
    if (!agent) {
        safePostMessage({
            type: 'licenseAcquisitionFailed',
            requestId,
            reason: 'Agent not found',
            processedAtTick: state.tick,
        });
        return;
    }

    const planet = state.planets.get(planetId);
    if (!planet) {
        safePostMessage({
            type: 'licenseAcquisitionFailed',
            requestId,
            reason: `Planet '${planetId}' not found`,
            processedAtTick: state.tick,
        });
        return;
    }

    let assets = agent.assets[planetId];
    const isNewPlanet = !assets;

    if (!assets) {
        assets = makeAgentPlanetAssets(planetId, { licenses: {} });
        agent.assets[planetId] = assets;
    }

    if (licenseType === 'workforce' && !assets.licenses?.commercial) {
        safePostMessage({
            type: 'licenseAcquisitionFailed',
            requestId,
            reason: `A commercial license must be acquired before a workforce license on planet '${planetId}'`,
            processedAtTick: state.tick,
        });
        return;
    }

    if (assets.licenses?.[licenseType]) {
        safePostMessage({
            type: 'licenseAcquisitionFailed',
            requestId,
            reason: `Agent already holds a '${licenseType}' license on planet '${planetId}'`,
            processedAtTick: state.tick,
        });
        return;
    }

    const cost = licenseType === 'commercial' ? COMMERCIAL_LICENSE_COST : WORKFORCE_LICENSE_COST;

    if (isNewPlanet) {
        grantLoan(assets, planet.bank, cost, 'licenseBootstrap', state.tick);
        assets.deposits -= cost;
    } else {
        if (assets.deposits < cost) {
            safePostMessage({
                type: 'licenseAcquisitionFailed',
                requestId,
                reason: `Insufficient deposits. Required: ${cost}, available: ${assets.deposits}`,
                processedAtTick: state.tick,
            });
            return;
        }
        assets.deposits -= cost;
    }

    assets.licenses = assets.licenses ?? {};
    assets.licenses[licenseType] = { acquiredTick: state.tick, frozen: false };

    const govAssets = state.agents.get(planet.governmentId)?.assets[planetId];
    if (govAssets) {
        govAssets.deposits += cost;
    } else {
        console.warn(
            `Government agent '${planet.governmentId}' has no assets on its own planet '${planetId}' to receive license fee`,
        );
    }

    pushTickerEvent(state, {
        category: 'licenseAcquired',
        planetId,
        agentId,
        agentName: agent.name,
        message: `${agent.name} acquired ${licenseType} license on ${planet.name}`,
        tick: state.tick,
    });

    console.log(
        `[worker] Agent '${agentId}' acquired '${licenseType}' license on planet '${planetId}' (cost: ${cost})`,
    );
    safePostMessage({
        type: 'licenseAcquired',
        requestId,
        agentId,
        planetId,
        licenseType,
        processedAtTick: state.tick,
    });
}
