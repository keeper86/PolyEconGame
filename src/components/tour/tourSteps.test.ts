import { describe, expect, it } from 'vitest';
import { getStepsForPage } from './tourSteps';

const t = ((key: string) => key) as unknown as Parameters<typeof getStepsForPage>[0];

type TourStepData = { actionKey?: string; blocking?: boolean; navStep?: boolean };

function actionKeys(steps: ReturnType<typeof getStepsForPage>): string[] {
    const keys: string[] = [];
    for (const step of steps) {
        const data = (step as { data?: TourStepData }).data;
        if (data && typeof data.actionKey === 'string') {
            keys.push(data.actionKey);
        }
    }
    return keys;
}

describe('getStepsForPage — blocking build steps', () => {
    it('workforce includes a blocking build-hr step when HR is not built yet', () => {
        const steps = getStepsForPage(t, 'workforce', 'planet-1', 'agent-1', []);

        expect(actionKeys(steps)).toContain('build-hr');
        const hrStep = steps.find((s) => (s as { data?: TourStepData }).data?.actionKey === 'build-hr');
        expect((hrStep as { data?: TourStepData }).data?.blocking).toBe(true);
    });

    it('workforce omits the build-hr step once build-hr is completed', () => {
        const steps = getStepsForPage(t, 'workforce', 'planet-1', 'agent-1', ['build-hr']);

        expect(actionKeys(steps)).not.toContain('build-hr');
    });

    it('market includes Administration/Logistics/Maintenance buy steps when not completed', () => {
        const steps = getStepsForPage(t, 'market', 'planet-1', 'agent-1', []);

        expect(actionKeys(steps)).toEqual(
            expect.arrayContaining([
                'expand-administration-accordion',
                'enable-buy-administration',
                'expand-logistics-accordion',
                'enable-buy-logistics',
                'expand-maintenance-accordion',
                'enable-buy-maintenance',
            ]),
        );
    });

    it('market omits completed buy steps from the step list', () => {
        const steps = getStepsForPage(t, 'market', 'planet-1', 'agent-1', [
            'expand-administration-accordion',
            'enable-buy-administration',
            'enable-buy-logistics',
        ]);

        const keys = actionKeys(steps);
        expect(keys).not.toContain('expand-administration-accordion');
        expect(keys).not.toContain('enable-buy-administration');
        expect(keys).not.toContain('enable-buy-logistics');
    });
});
