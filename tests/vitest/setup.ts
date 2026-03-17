// Extend Jest "expect" functionality with Testing Library assertions.
// This setup will run before each test. You can add global configuration here, like
// setting up mocks for shared modules, configuring testing utilities, etc.
import '@testing-library/jest-dom';
import { beforeEach, vi } from 'vitest';
import { seedRng } from '../../src/simulation/utils/stochasticRound';

// Mock next/navigation so components using useRouter/usePathname etc. don't
// throw "invariant expected app router to be mounted" in the jsdom environment.
vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
        prefetch: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        refresh: vi.fn(),
    }),
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
}));

// Seed the stochastic rounding PRNG before each test to ensure deterministic
// behaviour across all simulation tests.
beforeEach(() => {
    seedRng(42);
});

// Provide a jsdom-friendly mock for window.matchMedia used by `useIsMobile`.
// jsdom does not implement matchMedia by default which causes tests to throw.
// The mock supports addEventListener/removeEventListener and legacy addListener/removeListener.
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => {
        const listeners = new Set<(e: MediaQueryListEvent) => void>();
        const mql = {
            matches: false,
            media: query,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            onchange: null as Function | null,
            addEventListener: (type: string, listener: (e: MediaQueryListEvent) => void) => {
                if (type === 'change') {
                    listeners.add(listener);
                }
            },
            removeEventListener: (type: string, listener: (e: MediaQueryListEvent) => void) => {
                if (type === 'change') {
                    listeners.delete(listener);
                }
            },
            addListener: (listener: (e: MediaQueryListEvent) => void) => {
                listeners.add(listener);
            },
            removeListener: (listener: (e: MediaQueryListEvent) => void) => {
                listeners.delete(listener);
            },
            dispatchEvent: (event: MediaQueryListEvent) => {
                listeners.forEach((l) => l(event));
                return true;
            },
        } as Partial<MediaQueryList> & { dispatchEvent: (e: MediaQueryListEvent) => boolean };

        return mql as MediaQueryList;
    },
});
