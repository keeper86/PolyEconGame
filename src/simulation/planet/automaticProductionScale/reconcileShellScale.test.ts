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

        const remaining = reconcileShellScale(planet, agent, state, assets, shell, 10, true, 5000);

        expect(shell.construction).not.toBeNull();
        expect(shell.construction!.type).toBe('expansion');
        expect(shell.construction!.constructionTargetMaxScale).toBe(15);
        expect(remaining).toBeLessThan(5000);
    });

    it('skips construction entirely when the installed scale already holds a slightly large footprint', () => {
        const { planet, agent, state, storage, assets } = fixture();
        const shell = storage.shells.solid;
        shell.maxScale = 3;

        const remaining = reconcileShellScale(planet, agent, state, assets, shell, 2, true, 5000);

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
        };

        const remaining = reconcileShellScale(planet, agent, state, assets, shell, 10, true, 5000);

        expect(shell.construction).not.toBeNull();
        expect(shell.construction!.constructionTargetMaxScale).toBe(12);
        expect(remaining).toBe(5000);
    });

    it('starts nothing when there is no remaining construction budget', () => {
        const { planet, agent, state, storage, assets } = fixture();
        const shell = storage.shells.solid;

        const remaining = reconcileShellScale(planet, agent, state, assets, shell, 10, true, 0);

        expect(shell.construction).toBeNull();
        expect(remaining).toBe(0);
    });
});
