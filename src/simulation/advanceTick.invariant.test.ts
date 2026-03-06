import { describe, it, expect } from 'vitest';

import type { GameState } from './engine';
import { advanceTick } from './engine';
import { totalPopulation } from './population/populationHelpers';
import { makeAgent, makePlanet } from './testUtils';

describe('advanceTick invariants', () => {
    it('total active workforce across agents never exceeds planet population', () => {
        const { planet, gov } = makePlanet({ none: 10000 });
        const company = makeAgent('company-1');

        // Company requests more workers than exist to stress hiring
        company.assets.p.allocatedWorkers.none = 20000;

        const gameState: GameState = {
            tick: 0,
            planets: new Map([[planet.id, planet]]),
            agents: new Map([
                [company.id, company],
                [gov.id, gov],
            ]),
        };

        for (let t = 1; t <= 12; t++) {
            gameState.tick = t;
            advanceTick(gameState);

            // Sum population
            const popTotal = totalPopulation(planet.population);

            // Sum active workforce across agents (active + departing considered as still part of workforce demography)
            let workforceTotal = 0;
            for (const a of gameState.agents.values()) {
                const wf = a.assets.p.workforceDemography;
                if (!wf) {
                    continue;
                }
                for (const cohort of wf) {
                    for (const m of Object.values(cohort.active)) {
                        workforceTotal += m.count;
                    }

                    if (cohort.departing) {
                        for (const depArr of Object.values(cohort.departing)) {
                            for (const m of depArr) {
                                workforceTotal += m.count;
                            }
                        }
                    }
                }
            }

            expect(workforceTotal).toBeLessThanOrEqual(popTotal);
        }
    });
});
