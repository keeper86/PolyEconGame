import { describe, expect, it } from 'vitest';

import {
    makeAgent,
    makeAgentPlanetAssets,
    makeGameState,
    makePlanet,
    makeStorageFacility,
} from '../../utils/testHelper';
import { reconcileShellScale } from '../automaticProductionScale';
import type { Storage } from '../facility';
import { coalResourceType } from '../resources';
import { constructionServiceResourceType } from '../services';
import type { AgentPlanetAssets } from '../planet';

function fixture(): {
    planet: ReturnType<typeof makePlanet>;
    agent: ReturnType<typeof makeAgent>;
    state: ReturnType<typeof makeGameState>;
    storage: Storage;
    assets: AgentPlanetAssets;
} {
    const planet = makePlanet({ id: 'p' });
    const agent = makeAgent('a', 'p');
    const storage = makeStorageFacility({ planetId: 'p', id: 'storage-p', department: null });
    storage.shells.solid.scale = 1;
    storage.shells.solid.maxScale = 1;
    const assets = makeAgentPlanetAssets('p', { storage });
    return { planet, agent, state: makeGameState(), storage, assets };
}

describe('reconcileShellScale', () => {
    it('starts an expansion toward a 1.5x buffer when the shell is below the required footprint scale', () => {
        const { planet, agent, state, storage, assets } = fixture();
        const shell = storage.shells.solid;

        const remaining = reconcileShellScale(planet, agent, state, assets, shell, 10, 5000);

        expect(shell.construction).not.toBeNull();
        expect(shell.construction!.type).toBe('expansion');
        expect(shell.construction!.constructionTargetMaxScale).toBe(15);
        expect(remaining).toBeLessThan(5000);
    });

    it('skips construction entirely when the installed scale already holds a slightly large footprint', () => {
        const { planet, agent, state, storage, assets } = fixture();
        const shell = storage.shells.solid;
        shell.maxScale = 3;

        const remaining = reconcileShellScale(planet, agent, state, assets, shell, 2, 5000);

        expect(shell.construction).toBeNull();
        expect(remaining).toBe(5000);
    });

    it('does not start when an expansion is already in flight, leaving the budget untouched', () => {
        const { planet, agent, state, storage, assets } = fixture();
        const shell = storage.shells.solid;
        shell.construction = {
            type: 'expansion',
            constructionTargetMaxScale: 12,
            totalConstructionServiceRequired: 999,
            maximumConstructionServiceConsumption: 50,
            progress: 0,
            lastTickInvestedConstructionServices: 0,
            suspended: false,
        };

        const remaining = reconcileShellScale(planet, agent, state, assets, shell, 10, 5000);

        expect(shell.construction).not.toBeNull();
        expect(shell.construction!.constructionTargetMaxScale).toBe(12);
        expect(remaining).toBe(5000);
    });

    it('starts an expansion even with no remaining construction budget (shells are not budget-gated)', () => {
        const { planet, agent, state, storage, assets } = fixture();
        const shell = storage.shells.solid;

        const remaining = reconcileShellScale(planet, agent, state, assets, shell, 10, 0);

        expect(shell.construction).not.toBeNull();
        expect(shell.construction!.constructionTargetMaxScale).toBe(15);
        expect(remaining).toBe(0);
    });

    it('contracts an oversized shell back toward the buffer scale', () => {
        const { planet, agent, state, storage, assets } = fixture();
        const shell = storage.shells.solid;
        planet.avgMarketResult[constructionServiceResourceType.name] = {
            resourceName: constructionServiceResourceType.name,
            clearingPrice: 10,
            totalVolume: 1,
            totalDemand: 1000,
            totalSupply: 1,
            unfilledDemand: 1000,
            unsoldSupply: 1,
        };
        shell.maxScale = 500;
        shell.scale = 500;

        reconcileShellScale(planet, agent, state, assets, shell, 10, 5000);

        expect(shell.maxScale).toBe(15);
    });

    it('keeps an oversized shell whose contents exceed the reduced capacity', () => {
        const { planet, agent, state, storage, assets } = fixture();
        const shell = storage.shells.solid;
        planet.avgMarketResult[constructionServiceResourceType.name] = {
            resourceName: constructionServiceResourceType.name,
            clearingPrice: 10,
            totalVolume: 1,
            totalDemand: 1000,
            totalSupply: 1,
            unfilledDemand: 1000,
            unsoldSupply: 1,
        };
        shell.maxScale = 500;
        shell.scale = 500;
        shell.compartments[coalResourceType.name] = 1;
        shell.currentInStorage[coalResourceType.name] = { resource: coalResourceType, quantity: shell.capacity.mass * 300 };

        reconcileShellScale(planet, agent, state, assets, shell, 10, 5000);

        expect(shell.maxScale).toBeGreaterThanOrEqual(300);
    });
});
