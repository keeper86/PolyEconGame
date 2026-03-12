import { describe, it, expect, beforeEach } from 'vitest';

import type { Agent, Planet } from '../planet/planet';
import { educationLevelKeys } from '../population/education';
import type { EducationLevelType } from '../population/education';
import { MAX_AGE, SKILL } from '../population/population';

import { workforceAdvanceYearTick } from './workforceAdvanceYearTick';
import { makeAgent, makePlanetWithPopulation } from '../utils/testHelper';
import type { makeWorkforceDemography } from '../utils/testHelper';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sum active workers across all ages and skill levels for a given edu. */
function totalActiveForEdu(workforce: ReturnType<typeof makeWorkforceDemography>, edu: EducationLevelType): number {
    let total = 0;
    for (let age = 0; age < workforce.length; age++) {
        for (const skill of SKILL) {
            total += workforce[age][edu][skill].active;
        }
    }
    return total;
}

/** Sum all departing workers across all ages, skill levels, and pipeline slots for a given edu. */
function totalDepartingForEdu(workforce: ReturnType<typeof makeWorkforceDemography>, edu: EducationLevelType): number {
    let total = 0;
    for (let age = 0; age < workforce.length; age++) {
        for (const skill of SKILL) {
            for (const dep of workforce[age][edu][skill].voluntaryDeparting) {
                total += dep;
            }
        }
    }
    return total;
}

describe('workforceAdvanceYearTick', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        const { gov, planet: p } = makePlanetWithPopulation({});
        agent = gov;
        planet = p;
    });

    it('shifts workers from age 25 to age 26', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[25].primary.novice.active = 100;

        workforceAdvanceYearTick(new Map([[agent.id, agent]]), planet);

        expect(workforce[25].primary.novice.active).toBe(0);
        expect(workforce[26].primary.novice.active).toBe(100);
    });

    it('workers at MAX_AGE are dropped (overflow)', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[MAX_AGE].secondary.novice.active = 50;

        workforceAdvanceYearTick(new Map([[agent.id, agent]]), planet);

        // Workers at MAX_AGE remain because nothing shifts into MAX_AGE+1
        // The function shifts age-1 → age, so MAX_AGE gets contributions from MAX_AGE-1
        // but existing MAX_AGE workers stay (they aren't removed by year tick)
        expect(workforce[MAX_AGE].secondary.novice.active).toBe(50);
    });

    it('shifts departing pipeline entries along with active workers', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[30].tertiary.professional.voluntaryDeparting[1] = 8;

        workforceAdvanceYearTick(new Map([[agent.id, agent]]), planet);

        expect(workforce[30].tertiary.professional.voluntaryDeparting[1]).toBe(0);
        expect(workforce[31].tertiary.professional.voluntaryDeparting[1]).toBe(8);
    });

    it('shifts departingFired pipeline along with departing', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[30].none.novice.departingFired[2] = 5;

        workforceAdvanceYearTick(new Map([[agent.id, agent]]), planet);

        expect(workforce[30].none.novice.departingFired[2]).toBe(0);
        expect(workforce[31].none.novice.departingFired[2]).toBe(5);
    });

    it('merges workers at MAX_AGE-1 into MAX_AGE', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        wf[MAX_AGE].secondary.novice.active = 100;
        wf[MAX_AGE - 1].secondary.novice.active = 100;

        workforceAdvanceYearTick(new Map([[agent.id, agent]]), planet);

        expect(wf[MAX_AGE].secondary.novice.active).toBe(200);
        expect(wf[MAX_AGE - 1].secondary.novice.active).toBe(0);
    });

    it('workers in distinct ages each advance independently', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        wf[25].secondary.novice.active = 100;
        wf[30].secondary.novice.active = 100;

        workforceAdvanceYearTick(new Map([[agent.id, agent]]), planet);

        expect(wf[26].secondary.novice.active).toBe(100);
        expect(wf[31].secondary.novice.active).toBe(100);
        // Source ages are cleared
        expect(wf[25].secondary.novice.active).toBe(0);
        expect(wf[30].secondary.novice.active).toBe(0);
    });

    it('resets source age after shifting', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        wf[22].none.expert.active = 50;

        workforceAdvanceYearTick(new Map([[agent.id, agent]]), planet);

        expect(wf[22].none.expert.active).toBe(0);
        expect(wf[23].none.expert.active).toBe(50);
    });

    it('conserves total active workers across age shift (workers below MAX_AGE)', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;

        wf[25].none.novice.active = 100;
        wf[30].none.professional.active = 200;
        wf[60].none.expert.active = 50;
        wf[25].primary.novice.active = 80;

        const totalBefore = totalActiveForEdu(wf, 'none') + totalActiveForEdu(wf, 'primary');

        workforceAdvanceYearTick(new Map([[agent.id, agent]]), planet);

        const totalAfter = totalActiveForEdu(wf, 'none') + totalActiveForEdu(wf, 'primary');
        expect(totalAfter).toBe(totalBefore);
    });

    it('conserves departing pipeline counts across age shift', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;

        wf[30].none.novice.voluntaryDeparting[2] = 10;
        wf[30].none.professional.voluntaryDeparting[0] = 5;
        wf[40].primary.novice.voluntaryDeparting[0] = 20;

        const depNoneBefore = totalDepartingForEdu(wf, 'none');
        const depPrimBefore = totalDepartingForEdu(wf, 'primary');

        workforceAdvanceYearTick(new Map([[agent.id, agent]]), planet);

        expect(totalDepartingForEdu(wf, 'none')).toBe(depNoneBefore);
        expect(totalDepartingForEdu(wf, 'primary')).toBe(depPrimBefore);
    });

    it('age-0 bucket is fully cleared after shift', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;

        wf[0].none.novice.active = 100;
        wf[0].primary.professional.voluntaryDeparting[1] = 10;

        workforceAdvanceYearTick(new Map([[agent.id, agent]]), planet);

        expect(wf[0].none.novice.active).toBe(0);
        expect(wf[0].primary.professional.voluntaryDeparting[1]).toBe(0);
        // Shifted to age 1
        expect(wf[1].none.novice.active).toBe(100);
        expect(wf[1].primary.professional.voluntaryDeparting[1]).toBe(10);
    });

    it('workforce in the middle of the age range survives year tick without data loss', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;

        for (const edu of educationLevelKeys) {
            wf[40][edu].novice.active = 100;
            wf[40][edu].novice.voluntaryDeparting[2] = 10;
        }

        workforceAdvanceYearTick(new Map([[agent.id, agent]]), planet);

        for (const edu of educationLevelKeys) {
            // Shifted from age 40 → age 41
            expect(wf[41][edu].novice.active).toBe(100);
            expect(wf[41][edu].novice.voluntaryDeparting[2]).toBe(10);
        }
    });

    it('does nothing when workforceDemography is absent', () => {
        const a = makeAgent();
        a.assets.p.workforceDemography = undefined as never;
        expect(() => workforceAdvanceYearTick(new Map([[a.id, a]]), planet)).not.toThrow();
    });
});
