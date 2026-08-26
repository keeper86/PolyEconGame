import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetLocalStorageStores } from '@/hooks/useLocalStorageState';
import { TourProvider, useTour } from './TourContext';

const STORAGE_KEY = 'polyecongame-tour';

function Probe() {
    const tour = useTour();
    return (
        <div>
            <span data-testid='active'>{String(tour.isTourActive)}</span>
            <span data-testid='step'>{tour.currentStepIndex}</span>
            <span data-testid='completed'>{String(tour.isCompleted)}</span>
            <span data-testid='actions'>{tour.completedActions.join(',')}</span>
            <button onClick={() => tour.setTourActive(true)}>start-tour</button>
            <button onClick={() => tour.setCurrentStepIndex(3)}>set-step</button>
            <button onClick={() => tour.advanceToNextStep()}>next-step</button>
            <button onClick={() => tour.markActionCompleted('build-oil-well')}>mark-action</button>
        </div>
    );
}

function renderProbe() {
    return render(
        <TourProvider>
            <Probe />
        </TourProvider>,
    );
}

describe('TourProvider', () => {
    beforeEach(() => {
        localStorage.clear();
        resetLocalStorageStores();
    });

    it('renders defaults when localStorage has no tour state', () => {
        const { getByTestId } = renderProbe();
        expect(getByTestId('active')).toHaveTextContent('false');
        expect(getByTestId('step')).toHaveTextContent('0');
        expect(getByTestId('completed')).toHaveTextContent('false');
        expect(getByTestId('actions')).toHaveTextContent('');
    });

    it('hydrates from stored tour state', () => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                active: true,
                currentStepIndex: 9,
                completed: false,
                completedActions: ['build-oil-well'],
            }),
        );
        const { getByTestId } = renderProbe();
        expect(getByTestId('active')).toHaveTextContent('true');
        expect(getByTestId('step')).toHaveTextContent('9');
        expect(getByTestId('actions')).toHaveTextContent('build-oil-well');
    });

    it('setTourActive persists and resets the step index and completed actions', () => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                active: false,
                currentStepIndex: 5,
                completed: false,
                completedActions: ['build-oil-well'],
            }),
        );
        const { getByText, getByTestId } = renderProbe();
        fireEvent.click(getByText('start-tour'));
        expect(getByTestId('active')).toHaveTextContent('true');
        expect(getByTestId('step')).toHaveTextContent('0');
        expect(getByTestId('actions')).toHaveTextContent('');
        expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual({
            active: true,
            currentStepIndex: 0,
            completed: false,
            completedActions: [],
        });
    });

    it('markActionCompleted appends once and is idempotent for duplicates', () => {
        const { getByText, getByTestId } = renderProbe();
        fireEvent.click(getByText('mark-action'));
        fireEvent.click(getByText('mark-action'));
        expect(getByTestId('actions')).toHaveTextContent('build-oil-well');
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
        expect(stored.completedActions).toEqual(['build-oil-well']);
    });

    it('advanceToNextStep increments and persists', () => {
        const { getByText, getByTestId } = renderProbe();
        fireEvent.click(getByText('next-step'));
        fireEvent.click(getByText('next-step'));
        expect(getByTestId('step')).toHaveTextContent('2');
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
        expect(stored.currentStepIndex).toBe(2);
    });

    it('ignores malformed JSON and falls back to defaults', () => {
        localStorage.setItem(STORAGE_KEY, '{not-json');
        const { getByTestId } = renderProbe();
        expect(getByTestId('active')).toHaveTextContent('false');
        expect(getByTestId('step')).toHaveTextContent('0');
    });

    it('ignores wrong-typed stored fields', () => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ active: 'yes', currentStepIndex: '3', completed: false, completedActions: ['x'] }),
        );
        const { getByTestId } = renderProbe();
        expect(getByTestId('active')).toHaveTextContent('false');
        expect(getByTestId('step')).toHaveTextContent('0');
    });
});
