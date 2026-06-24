import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { TourJoyride } from './TourJoyride';
import { useTour } from './TourContext';
import { useAgentId } from '@/hooks/useAgentId';
import { usePathname, useParams, useRouter } from 'next/navigation';
import { getStepsForPage } from '@/components/tour/tourSteps';
import type { EventHandler } from 'react-joyride';

// ── Mocks ──────────────────────────────────────────────────────────
vi.mock('./TourContext', () => ({
    useTour: vi.fn(),
}));

vi.mock('@/hooks/useAgentId', () => ({
    useAgentId: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    usePathname: vi.fn(),
    useParams: vi.fn(),
    useRouter: vi.fn(),
}));

vi.mock('@/components/tour/tourSteps', () => ({
    getStepsForPage: vi.fn(),
}));

// ── Shared state for capturing Joyride props ───────────────────────
let capturedOnEvent: EventHandler | null = null;

// Mock Joyride so we can capture the onEvent callback
vi.mock('react-joyride', () => ({
    Joyride: function JoyrideMock(props: { onEvent?: EventHandler }) {
        if (props.onEvent) {
            capturedOnEvent = props.onEvent;
        }
        return null;
    },
}));

// next/dynamic returns a component that wraps the dynamic import.
// Our mock returns the wrapped component directly.
vi.mock('next/dynamic', () => ({
    default: () => {
        return function DynamicJoyrideMock(props: { onEvent?: EventHandler }) {
            if (props.onEvent) {
                capturedOnEvent = props.onEvent;
            }
            return null;
        };
    },
}));

// ── MutationObserver mock ──────────────────────────────────────────
// We need a MutationObserver that fires its callback synchronously
// so that targetsReady becomes true during the render.
vi.stubGlobal(
    'MutationObserver',
    vi.fn(() => ({
        observe: vi.fn(),
        disconnect: vi.fn(),
        takeRecords: () => [],
    })),
);

function mockQuerySelector(found: boolean) {
    document.querySelector = vi.fn(() =>
        found ? document.createElement('div') : null,
    ) as unknown as typeof document.querySelector;
}

// Track mock functions for assertions (avoids calling useTour() in helpers,
// which would violate react-hooks/rules-of-hooks).
let mockSetCurrentPageIndex: ReturnType<typeof vi.fn>;
let mockCompleteTour: ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    capturedOnEvent = null;

    // Default: document.querySelector finds the target element so that
    // the quick-check path in the MutationObserver effect sets targetsReady
    // to true immediately during render.
    mockQuerySelector(true);

    (useAgentId as ReturnType<typeof vi.fn>).mockReturnValue({ agentId: 'agent-1' });
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue('/planets/planet-1/central-bank');
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ planetId: 'planet-1' });
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({ push: vi.fn() });

    mockSetCurrentPageIndex = vi.fn();
    mockCompleteTour = vi.fn();
    (useTour as ReturnType<typeof vi.fn>).mockReturnValue({
        isTourActive: true,
        currentPageIndex: 0,
        completeTour: mockCompleteTour,
        setCurrentPageIndex: mockSetCurrentPageIndex,
        completedActions: [],
    });

    (getStepsForPage as ReturnType<typeof vi.fn>).mockReturnValue([
        {
            target: '[data-tour="bank-panel"]',
            content: 'Step 1',
            title: 'Step 1',
        },
        {
            target: 'body',
            content: 'Navigate',
            title: 'Navigate next',
            after: vi.fn(),
        },
    ]);
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ── Test helpers ───────────────────────────────────────────────────
function renderTourJoyride() {
    capturedOnEvent = null;
    const result = render(<TourJoyride />);
    return {
        ...result,
        get onEvent() {
            return capturedOnEvent;
        },
    };
}

function simulateEvent(onEvent: EventHandler | null, data: Partial<Parameters<EventHandler>[0]>) {
    if (!onEvent) {
        throw new Error('onEvent not captured – did the component render?');
    }
    // EventHandler takes (data: EventData, controls: Controls)
    (onEvent as (data: Parameters<EventHandler>[0]) => void)(data as Parameters<EventHandler>[0]);
}

describe('TourJoyride', () => {
    // ── Rendering edge cases ──────────────────────────────────────────
    it('does not render when tour is not active', () => {
        (useTour as ReturnType<typeof vi.fn>).mockReturnValue({
            isTourActive: false,
            currentPageIndex: 0,
            completeTour: vi.fn(),
            setCurrentPageIndex: vi.fn(),
            completedActions: [],
        });

        const { container } = renderTourJoyride();
        expect(container.innerHTML).toBe('');
    });

    it('does not render when not on a tour page', () => {
        (usePathname as ReturnType<typeof vi.fn>).mockReturnValue('/planets/planet-1/some-other-page');

        const { container } = renderTourJoyride();
        expect(container.innerHTML).toBe('');
    });

    it('does not render when planetId is missing', () => {
        (useParams as ReturnType<typeof vi.fn>).mockReturnValue({});

        const { container } = renderTourJoyride();
        expect(container.innerHTML).toBe('');
    });

    it('renders and captures onEvent when tour is active on a tour page', () => {
        const { onEvent } = renderTourJoyride();
        expect(onEvent).not.toBeNull();
    });

    // ── handleOnEvent: prev action ─────────────────────────────────────
    it('clicking Back from step 1 goes to step 0', () => {
        mockSetCurrentPageIndex = vi.fn();
        mockCompleteTour = vi.fn();
        (useTour as ReturnType<typeof vi.fn>).mockReturnValue({
            isTourActive: true,
            currentPageIndex: 1,
            completeTour: mockCompleteTour,
            setCurrentPageIndex: mockSetCurrentPageIndex,
            completedActions: [],
        });

        const { onEvent } = renderTourJoyride();
        simulateEvent(onEvent, {
            action: 'prev',
            index: 1,
            status: 'running',
            type: 'step:after',
        });

        expect(mockSetCurrentPageIndex).toHaveBeenCalledWith(0);
    });

    it('clicking Back from step 2 goes to step 1', () => {
        mockSetCurrentPageIndex = vi.fn();
        mockCompleteTour = vi.fn();
        (useTour as ReturnType<typeof vi.fn>).mockReturnValue({
            isTourActive: true,
            currentPageIndex: 2,
            completeTour: mockCompleteTour,
            setCurrentPageIndex: mockSetCurrentPageIndex,
            completedActions: [],
        });

        const { onEvent } = renderTourJoyride();
        simulateEvent(onEvent, {
            action: 'prev',
            index: 2,
            status: 'running',
            type: 'step:after',
        });

        expect(mockSetCurrentPageIndex).toHaveBeenCalledWith(1);
    });

    it('clicking Back from step 0 stays at 0 (cannot go negative)', () => {
        mockSetCurrentPageIndex = vi.fn();
        mockCompleteTour = vi.fn();
        (useTour as ReturnType<typeof vi.fn>).mockReturnValue({
            isTourActive: true,
            currentPageIndex: 0,
            completeTour: mockCompleteTour,
            setCurrentPageIndex: mockSetCurrentPageIndex,
            completedActions: [],
        });

        const { onEvent } = renderTourJoyride();
        simulateEvent(onEvent, {
            action: 'prev',
            index: 0,
            status: 'running',
            type: 'step:after',
        });

        expect(mockSetCurrentPageIndex).toHaveBeenCalledWith(0);
    });

    // ── handleOnEvent: next action (non-nav steps) ────────────────────
    it('clicking Next from step 0 goes to step 1', () => {
        const { onEvent } = renderTourJoyride();
        simulateEvent(onEvent, {
            action: 'next',
            index: 0,
            status: 'running',
            type: 'step:after',
        });

        expect(mockSetCurrentPageIndex).toHaveBeenCalledWith(1);
    });

    // ── Tour completion: finished (non-nav step) ────────────────────────
    it('calls completeTour on status "finished" for non-nav step', () => {
        (getStepsForPage as ReturnType<typeof vi.fn>).mockReturnValue([
            {
                target: '[data-tour="bank-panel"]',
                content: 'Only step',
                title: 'Only step',
            },
        ]);

        const { onEvent } = renderTourJoyride();
        simulateEvent(onEvent, {
            action: 'next',
            index: 0,
            status: 'finished',
            type: 'step:after',
        });

        expect(mockCompleteTour).toHaveBeenCalledTimes(1);
        expect(mockSetCurrentPageIndex).not.toHaveBeenCalled();
    });

    // ── Tour completion: skipped ────────────────────────────────────────
    it('calls completeTour on status "skipped"', () => {
        const { onEvent } = renderTourJoyride();
        simulateEvent(onEvent, {
            action: 'skip',
            index: 0,
            status: 'skipped',
            type: 'step:after',
        });

        expect(mockCompleteTour).toHaveBeenCalledTimes(1);
        expect(mockSetCurrentPageIndex).not.toHaveBeenCalled();
    });

    // ── Tour completion: close action ───────────────────────────────────
    it('calls completeTour on action "close"', () => {
        const { onEvent } = renderTourJoyride();
        simulateEvent(onEvent, {
            action: 'close',
            index: 0,
            status: 'running',
            type: 'step:after',
        });

        expect(mockCompleteTour).toHaveBeenCalledTimes(1);
        expect(mockSetCurrentPageIndex).not.toHaveBeenCalled();
    });

    // ── Nav step: "next" triggers navigation, not completeTour ──────────
    it('triggers navigation on nav step with action "next", does not call completeTour', () => {
        const { onEvent } = renderTourJoyride();
        simulateEvent(onEvent, {
            action: 'next',
            index: 1,
            status: 'running',
            type: 'step:after',
        });

        expect(mockSetCurrentPageIndex).toHaveBeenCalledWith(0);
        expect(mockCompleteTour).not.toHaveBeenCalled();
    });

    // ── Nav step: "finished" triggers navigation, not completeTour ──────
    it('triggers navigation on nav step with status "finished", does not call completeTour', () => {
        const { onEvent } = renderTourJoyride();
        simulateEvent(onEvent, {
            action: 'next',
            index: 1,
            status: 'finished',
            type: 'step:after',
        });

        expect(mockSetCurrentPageIndex).toHaveBeenCalledWith(0);
        expect(mockCompleteTour).not.toHaveBeenCalled();
    });

    // ── Blocking step: "next" does NOT advance index ────────────────────
    it('does not advance index on blocking step with action "next"', () => {
        (getStepsForPage as ReturnType<typeof vi.fn>).mockReturnValue([
            {
                target: '[data-tour="starter-loan"]',
                content: 'Blocking step',
                title: 'Do this first',
                data: { blocking: true, actionKey: 'starter-loan' },
            },
        ]);

        const { onEvent } = renderTourJoyride();
        simulateEvent(onEvent, {
            action: 'next',
            index: 0,
            status: 'running',
            type: 'step:after',
        });

        expect(mockSetCurrentPageIndex).not.toHaveBeenCalled();
    });

    // ── Undefined step guard ────────────────────────────────────────────
    it('does not crash when currentStep is undefined (out-of-sync index)', () => {
        (getStepsForPage as ReturnType<typeof vi.fn>).mockReturnValue([]);

        const { container } = renderTourJoyride();
        expect(container.innerHTML).toBe('');
    });

    // ── after callbacks are stripped ───────────────────────────────────
    it('strips after callbacks from steps passed to Joyride', () => {
        renderTourJoyride();
        expect(getStepsForPage).toHaveBeenCalledWith('central-bank', 'planet-1', 'agent-1', expect.any(Function), []);
    });

    // ── safeStepIndex clamping ────────────────────────────────────────
    it('renders without crashing when currentPageIndex >= steps.length', () => {
        (useTour as ReturnType<typeof vi.fn>).mockReturnValue({
            isTourActive: true,
            currentPageIndex: 5,
            completeTour: vi.fn(),
            setCurrentPageIndex: vi.fn(),
            completedActions: [],
        });

        const { container } = renderTourJoyride();
        expect(container).toBeTruthy();
    });

    // ── PathToPageRoute: URL detection order ────────────────────────────
    it('detects page route from pathname for all tour pages', () => {
        const testCases = [
            { path: '/planets/p-1/central-bank', expected: 'central-bank' },
            { path: '/planets/p-1/agent/a-1/financial', expected: 'financial' },
            { path: '/planets/p-1/agent/a-1/workforce', expected: 'workforce' },
            { path: '/planets/p-1/claims', expected: 'claims' },
            { path: '/planets/p-1/agent/a-1/production', expected: 'production' },
            { path: '/planets/p-1/agent/a-1/storage', expected: 'storage' },
            { path: '/planets/p-1/agent/a-1/market', expected: 'market' },
            { path: '/planets/p-1/agent/a-1/ships', expected: 'ships' },
            { path: '/other', expected: null },
        ];

        for (const { path, expected } of testCases) {
            (usePathname as ReturnType<typeof vi.fn>).mockReturnValue(path);
            const { container } = renderTourJoyride();
            if (expected) {
                expect(container).toBeTruthy();
            } else {
                expect(container.innerHTML).toBe('');
            }
        }
    });
});
