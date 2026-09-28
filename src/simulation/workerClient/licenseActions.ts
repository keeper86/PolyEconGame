import { COMMERCIAL_LICENSE_COST, WORKFORCE_LICENSE_COST } from '../constants';
import { makeAgentPlanetAssets, makeStorage } from '../initialUniverse/helpers';
import { grantAutomaticLoan } from '../financial/loanConditions';
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
            error: { code: 'agentNotFound', params: {} },
            processedAtTick: state.tick,
        });
        return;
    }

    const planet = state.planets.get(planetId);
    if (!planet) {
        safePostMessage({
            type: 'licenseAcquisitionFailed',
            requestId,
            error: { code: 'planetNotFound', params: { planetId: planetId } },
            processedAtTick: state.tick,
        });
        return;
    }

    let assets = agent.assets[planetId];
    const isNewPlanet = !assets;

    if (!assets) {
        const storage = makeStorage({ planetId, id: `${agentId}-license-storage` });
        assets = makeAgentPlanetAssets([], storage, null);
        assets.licenses = {};
        agent.assets[planetId] = assets;
    }

    if (licenseType === 'workforce' && !assets.licenses?.commercial) {
        safePostMessage({
            type: 'licenseAcquisitionFailed',
            requestId,
            error: { code: 'licensePrerequisiteMissing', params: { planetId: planetId } },
            processedAtTick: state.tick,
        });
        return;
    }

    if (assets.licenses?.[licenseType]) {
        safePostMessage({
            type: 'licenseAcquisitionFailed',
            requestId,
            error: { code: 'licenseAlreadyHeld', params: { licenseType: licenseType, planetId: planetId } },
            processedAtTick: state.tick,
        });
        return;
    }

    const cost = licenseType === 'commercial' ? COMMERCIAL_LICENSE_COST : WORKFORCE_LICENSE_COST;

    if (isNewPlanet) {
        const result = grantAutomaticLoan(state, agent, planet, cost, 'licenseBootstrap', state.tick);
        if (result.kind === 'bankrupt') {
            return;
        }
        assets.deposits -= cost;
    } else {
        if (assets.deposits < cost) {
            safePostMessage({
                type: 'licenseAcquisitionFailed',
                requestId,
                error: {
                    code: 'insufficientDepositsForLicense',
                    params: { required: cost, available: assets.deposits },
                },
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
        details: { kind: 'licenseAcquired', planetName: planet.name, licenseType },
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
