import { describe, expect, it } from 'vitest';
import { recipientLabel } from './recipientLabel';

describe('recipientLabel', () => {
    it('prefers the display name and appends the company', () => {
        expect(
            recipientLabel({
                userId: 'alice-1',
                displayName: 'Alice Anderson',
                username: 'aa-dev',
                companyName: 'AnderTech',
            }),
        ).toBe('Alice Anderson (AnderTech)');
    });

    it('falls back to the user name when there is no display name', () => {
        expect(recipientLabel({ userId: 'x', displayName: null, username: 'x-handle', companyName: null })).toBe(
            'x-handle',
        );
    });

    it('falls back to the company when there is no display name or user name', () => {
        expect(recipientLabel({ userId: 'x', displayName: null, username: null, companyName: 'X Corp' })).toBe(
            'X Corp',
        );
    });

    it('only uses the user id as a last resort', () => {
        expect(recipientLabel({ userId: 'x-id', displayName: null, username: null, companyName: null })).toBe('x-id');
    });
});
