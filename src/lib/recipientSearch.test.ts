import { describe, expect, it } from 'vitest';
import { fieldScore, recipientLabel } from './recipientSearch';

describe('fieldScore', () => {
    it('scores exact, prefix and substring matches', () => {
        expect(fieldScore('alice anderson', 'Alice Anderson')).toBe(1);
        expect(fieldScore('alice', 'Alice Anderson')).toBe(0.9);
        expect(fieldScore('and', 'Alice Anderson')).toBe(0.8);
    });

    it('scores prefixes, substrings and initials', () => {
        expect(fieldScore('bjorn', 'Björn Ödegård')).toBe(0.9);
        expect(fieldScore('odegard', 'Björn Ödegård')).toBe(0.8);
        expect(fieldScore('aa', 'Alice Anderson')).toBe(0.65);
    });

    it('tolerates typos', () => {
        expect(fieldScore('alise', 'Alice Anderson')).toBeGreaterThan(0.3);
    });

    it('ignores diacritics in the field', () => {
        expect(fieldScore('bjorn', 'Björn Ödegård')).toBeGreaterThan(0);
    });

    it('returns zero for missing or unrelated fields', () => {
        expect(fieldScore('bob', null)).toBe(0);
        expect(fieldScore('bob', '')).toBe(0);
        expect(fieldScore('zzzzzz', 'Alice Anderson')).toBe(0);
    });
});

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
