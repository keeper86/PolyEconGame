import { describe, expect, it } from 'vitest';
import { DOMAIN_ERROR_CODES, domainCodeForMessage } from '@/server/domainError';

describe('domainCodeForMessage', () => {
    it('resolves the code for every registered message', () => {
        expect(domainCodeForMessage('User not found')).toBe('userNotFound');
        expect(domainCodeForMessage('Message not found')).toBe('messageNotFound');
        expect(domainCodeForMessage('You do not own this agent')).toBe('notOwner');
        expect(domainCodeForMessage('Invalid resource name')).toBe('invalidResourceName');
        expect(
            domainCodeForMessage('No account on the issuing planet. Visit that planet first to open an account.'),
        ).toBe('noAccountOnIssuingPlanet');
    });

    it('returns null for unknown messages', () => {
        expect(domainCodeForMessage('Something exploded')).toBeNull();
        expect(domainCodeForMessage('')).toBeNull();
    });

    it('exposes every code exactly once', () => {
        expect(new Set(DOMAIN_ERROR_CODES).size).toBe(DOMAIN_ERROR_CODES.length);
    });
});
