import { describe, it, expect } from 'vitest';

import { educationLevelKeys } from '../planet';
import { emptyAccumulator } from '../population/populationHelpers';

import { syncWorkforceWithPopulation } from './workforceSync';
import { laborMarketTick } from './laborMarketTick';
import { makeAgent, makePlanet } from './testHelpers';
import { totalActiveForEdu } from './workforceHelpers';

// ---------------------------------------------------------------------------
// syncWorkforceWithPopulation — conservation
// ---------------------------------------------------------------------------

describe('syncWorkforceWithPopulation — conservation', () => {
    it('removes exactly the right number of deaths from workforce', () => {
        const { planet } = makePlanet({ none: 5000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.none = 500;
        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        const wfBefore = totalActiveForEdu(agent.assets.p.workforceDemography!, 'none');

        planet.population.tickDeaths = emptyAccumulator();
        planet.population.tickDeaths.none.company = 10;
        planet.population.tickNewDisabilities = emptyAccumulator();

        syncWorkforceWithPopulation(new Map([[agent.id, agent]]), planet.id, planet.population, planet.environment);

        const wfAfter = totalActiveForEdu(agent.assets.p.workforceDemography!, 'none');
        expect(wfAfter).toBe(wfBefore - 10);
    });

    it('removes exactly the right number of disabilities from workforce', () => {
        const { planet } = makePlanet({ primary: 5000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.primary = 300;
        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        const wfBefore = totalActiveForEdu(agent.assets.p.workforceDemography!, 'primary');

        planet.population.tickDeaths = emptyAccumulator();
        planet.population.tickNewDisabilities = emptyAccumulator();
        planet.population.tickNewDisabilities.primary.company = 5;

        syncWorkforceWithPopulation(new Map([[agent.id, agent]]), planet.id, planet.population, planet.environment);

        const wfAfter = totalActiveForEdu(agent.assets.p.workforceDemography!, 'primary');
        expect(wfAfter).toBe(wfBefore - 5);
    });

    it('distributes deaths across multiple agents proportionally', () => {
        const { planet } = makePlanet({ none: 10000 });
        const agent1 = makeAgent('agent-1');
        const agent2 = makeAgent('agent-2');

        agent1.assets.p.allocatedWorkers.none = 300;
        agent2.assets.p.allocatedWorkers.none = 700;
        laborMarketTick(
            new Map([
                [agent1.id, agent1],
                [agent2.id, agent2],
            ]),
            new Map([[planet.id, planet]]),
        );

        const wf1Before = totalActiveForEdu(agent1.assets.p.workforceDemography!, 'none');
        const wf2Before = totalActiveForEdu(agent2.assets.p.workforceDemography!, 'none');

        planet.population.tickDeaths = emptyAccumulator();
        planet.population.tickDeaths.none.company = 100;
        planet.population.tickNewDisabilities = emptyAccumulator();

        syncWorkforceWithPopulation(
            new Map([
                [agent1.id, agent1],
                [agent2.id, agent2],
            ]),
            planet.id,
            planet.population,
            planet.environment,
        );

        const wf1After = totalActiveForEdu(agent1.assets.p.workforceDemography!, 'none');
        const wf2After = totalActiveForEdu(agent2.assets.p.workforceDemography!, 'none');

        expect(wf1Before - wf1After + (wf2Before - wf2After)).toBe(100);

        const agent1Share = (wf1Before - wf1After) / 100;
        expect(agent1Share).toBeGreaterThan(0.15);
        expect(agent1Share).toBeLessThan(0.45);
    });

    it('never makes workforce counts negative during sync', () => {
        const { planet } = makePlanet({ none: 5000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.none = 10;
        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        planet.population.tickDeaths = emptyAccumulator();
        planet.population.tickDeaths.none.company = 100;
        planet.population.tickNewDisabilities = emptyAccumulator();

        syncWorkforceWithPopulation(new Map([[agent.id, agent]]), planet.id, planet.population, planet.environment);

        const wf = agent.assets.p.workforceDemography!;
        for (const cohort of wf) {
            for (const edu of educationLevelKeys) {
                expect(cohort.active[edu]).toBeGreaterThanOrEqual(0);
            }
        }
    });

    it('redistributes overflow when a cohort cannot absorb all assigned deaths', () => {
        // Set up two agents: one with very few workers, one with many.
        // If age-weighted distribution assigns more deaths to the small
        // agent's cohort than it has, overflow must be redistributed.
        const { planet } = makePlanet({ none: 10000 });
        const agent1 = makeAgent('agent-1');
        const agent2 = makeAgent('agent-2');

        agent1.assets.p.allocatedWorkers.none = 5;
        agent2.assets.p.allocatedWorkers.none = 500;
        laborMarketTick(
            new Map([
                [agent1.id, agent1],
                [agent2.id, agent2],
            ]),
            new Map([[planet.id, planet]]),
        );

        const wf1Before = totalActiveForEdu(agent1.assets.p.workforceDemography!, 'none');
        const wf2Before = totalActiveForEdu(agent2.assets.p.workforceDemography!, 'none');

        // Report deaths much larger than agent1's workforce
        planet.population.tickDeaths = emptyAccumulator();
        planet.population.tickDeaths.none.company = 100;
        planet.population.tickNewDisabilities = emptyAccumulator();

        syncWorkforceWithPopulation(
            new Map([
                [agent1.id, agent1],
                [agent2.id, agent2],
            ]),
            planet.id,
            planet.population,
            planet.environment,
        );

        const wf1After = totalActiveForEdu(agent1.assets.p.workforceDemography!, 'none');
        const wf2After = totalActiveForEdu(agent2.assets.p.workforceDemography!, 'none');

        // Total removed must equal 100 (all deaths accounted for)
        expect(wf1Before - wf1After + (wf2Before - wf2After)).toBe(100);
    });

    it('removes all deaths even when concentrated in a single tenure cohort', () => {
        const { planet } = makePlanet({ none: 5000 });
        const agent = makeAgent();

        // Hire into tenure 0, then manually split: 3 workers at tenure 5 (old), rest at tenure 0 (young)
        agent.assets.p.allocatedWorkers.none = 200;
        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        const wf = agent.assets.p.workforceDemography!;
        // Move 3 workers to a high-tenure cohort with high mean age
        wf[5].active.none = 3;
        wf[5].ageMoments.none = { mean: 80, variance: 4 };
        wf[0].active.none -= 3;

        const totalBefore = totalActiveForEdu(wf, 'none');

        // Report 10 deaths — age-weighting will try to assign many to the old cohort
        planet.population.tickDeaths = emptyAccumulator();
        planet.population.tickDeaths.none.company = 10;
        planet.population.tickNewDisabilities = emptyAccumulator();

        syncWorkforceWithPopulation(new Map([[agent.id, agent]]), planet.id, planet.population, planet.environment);

        const totalAfter = totalActiveForEdu(wf, 'none');
        // Exactly 10 deaths should be removed, even though old cohort only had 3
        expect(totalBefore - totalAfter).toBe(10);
    });
});
