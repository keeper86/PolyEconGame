import { describe, it, expect } from 'vitest';

import { educationLevelKeys } from '../planet';

import { workforceMortalityTick } from './workforceMortality';
import { makeAgent } from './testHelpers';
import { MAX_TENURE_YEARS } from './workforceHelpers';

// ---------------------------------------------------------------------------
// workforceMortalityTick
// ---------------------------------------------------------------------------

describe('workforceMortalityTick', () => {
    it('removes some workers from cohorts with realistic working-age mean', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        wf[0].active.none = 100000;
        wf[0].ageMoments.none = { mean: 60, variance: 0 };

        workforceMortalityTick([agent], 'p', 0.1, 0);

        expect(wf[0].active.none).toBeLessThan(100000);
    });

    it('removes more workers for older cohorts than younger cohorts', () => {
        const makeAgentWithAge = (ageMean: number) => {
            const a = makeAgent(`agent-${ageMean}`);
            a.assets.p.workforceDemography![0].active.none = 100000;
            a.assets.p.workforceDemography![0].ageMoments.none = { mean: ageMean, variance: 0 };
            return a;
        };

        const youngAgent = makeAgentWithAge(25);
        const oldAgent = makeAgentWithAge(70);

        workforceMortalityTick([youngAgent, oldAgent], 'p', 0, 0);

        const youngSurvivors = youngAgent.assets.p.workforceDemography![0].active.none;
        const oldSurvivors = oldAgent.assets.p.workforceDemography![0].active.none;

        expect(oldSurvivors).toBeLessThan(youngSurvivors);
    });

    it('does nothing when workforceDemography is absent', () => {
        const agent = makeAgent();
        agent.assets.p.workforceDemography = undefined;
        expect(() => workforceMortalityTick([agent], 'p', 0, 0)).not.toThrow();
    });

    it('does nothing for cohorts with zero active workers', () => {
        const agent = makeAgent();
        expect(() => workforceMortalityTick([agent], 'p', 0, 0)).not.toThrow();
        const wf = agent.assets.p.workforceDemography!;
        for (const cohort of wf) {
            for (const edu of ['none', 'primary', 'secondary', 'tertiary', 'quaternary'] as const) {
                expect(cohort.active[edu]).toBe(0);
            }
        }
    });

    it('applies higher mortality under starvation', () => {
        const agentNoStarve = makeAgent();
        agentNoStarve.assets.p.workforceDemography![0].active.none = 100000;
        agentNoStarve.assets.p.workforceDemography![0].ageMoments.none = { mean: 60, variance: 0 };

        const agentStarve = makeAgent('agent-starve');
        agentStarve.assets.p.workforceDemography![0].active.none = 100000;
        agentStarve.assets.p.workforceDemography![0].ageMoments.none = { mean: 60, variance: 0 };

        workforceMortalityTick([agentNoStarve], 'p', 0, 0);
        workforceMortalityTick([agentStarve], 'p', 0, 0.8);

        const survivorsNoStarve = agentNoStarve.assets.p.workforceDemography![0].active.none;
        const survivorsStarve = agentStarve.assets.p.workforceDemography![0].active.none;

        expect(survivorsStarve).toBeLessThan(survivorsNoStarve);
    });
});

// ---------------------------------------------------------------------------
// Consistency — never creates negative counts
// ---------------------------------------------------------------------------

describe('workforceMortalityTick — consistency', () => {
    it('never removes more workers than exist', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        wf[0].active.none = 10;
        wf[0].ageMoments.none = { mean: 90, variance: 0 };

        workforceMortalityTick([agent], 'p', 0.5, 0.9);

        expect(wf[0].active.none).toBeGreaterThanOrEqual(0);
    });

    it('does not create negative worker counts even with extreme conditions', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;

        for (let t = 0; t <= MAX_TENURE_YEARS; t++) {
            for (const edu of educationLevelKeys) {
                wf[t].active[edu] = 1;
                wf[t].ageMoments[edu] = { mean: 95, variance: 0 };
            }
        }

        workforceMortalityTick([agent], 'p', 1.0, 1.0);

        for (const cohort of wf) {
            for (const edu of educationLevelKeys) {
                expect(cohort.active[edu]).toBeGreaterThanOrEqual(0);
            }
        }
    });

    it('mortality does not kill a single working-age worker (floor rounds to 0)', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        wf[0].active.none = 1;
        wf[0].ageMoments.none = { mean: 40, variance: 0 };

        workforceMortalityTick([agent], 'p', 0.01, 0);

        expect(wf[0].active.none).toBe(1);
    });
});
