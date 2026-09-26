import { describe, expect, it } from 'vitest';
import { rateLimitExceeded } from './rateLimit';

describe('rateLimitExceeded', () => {
    it('allows calls up to the limit and blocks the next one', () => {
        const store = new Map<string, number[]>();

        for (let i = 0; i < 3; i += 1) {
            expect(rateLimitExceeded(store, 'user-1', 3, 1000, 100)).toBe(false);
        }

        expect(rateLimitExceeded(store, 'user-1', 3, 1000, 100)).toBe(true);
    });

    it('tracks each key independently', () => {
        const store = new Map<string, number[]>();

        expect(rateLimitExceeded(store, 'user-1', 1, 1000, 100)).toBe(false);
        expect(rateLimitExceeded(store, 'user-1', 1, 1000, 100)).toBe(true);
        expect(rateLimitExceeded(store, 'user-2', 1, 1000, 100)).toBe(false);
    });

    it('forgets calls older than the window', () => {
        const store = new Map<string, number[]>();

        expect(rateLimitExceeded(store, 'user-1', 2, 1000, 100)).toBe(false);
        expect(rateLimitExceeded(store, 'user-1', 2, 1000, 200)).toBe(false);
        expect(rateLimitExceeded(store, 'user-1', 2, 1000, 300)).toBe(true);
        expect(rateLimitExceeded(store, 'user-1', 2, 1000, 1200)).toBe(false);
    });
});
