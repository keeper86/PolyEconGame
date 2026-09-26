import { describe, expect, it } from 'vitest';
import { rankRecipients, recipientLabel, type RecipientCandidate } from './recipientSearch';

const alice: RecipientCandidate = {
    userId: 'alice-1',
    displayName: 'Alice Anderson',
    username: 'aa-dev',
    companyName: 'AnderTech',
};
const bob: RecipientCandidate = {
    userId: 'bob-2',
    displayName: 'Bob Brown',
    username: 'bobby',
    companyName: 'Brown Industries',
};
const bjorn: RecipientCandidate = {
    userId: 'bjorn-3',
    displayName: 'Björn Ödegård',
    username: 'bjorn-o',
    companyName: null,
};
const candidates = [alice, bob, bjorn];

describe('rankRecipients', () => {
    it('returns the input order for an empty query, capped at the limit', () => {
        expect(rankRecipients(candidates, '', 10)).toEqual(candidates);
        expect(rankRecipients(candidates, '   ', 2)).toEqual([alice, bob]);
    });

    it('ranks an exact display name match first', () => {
        expect(rankRecipients(candidates, 'Alice Anderson', 10)[0]).toBe(alice);
    });

    it('matches on a substring of the display name', () => {
        const result = rankRecipients(candidates, 'and', 10);
        expect(result[0]).toBe(alice);
        expect(result).not.toContain(bob);
    });

    it('matches on the company name', () => {
        const result = rankRecipients(candidates, 'industries', 10);
        expect(result).toEqual([bob]);
    });

    it('matches on the user id', () => {
        expect(rankRecipients(candidates, 'bob-2', 10)[0]).toBe(bob);
    });

    it('matches a typo via string distance', () => {
        const result = rankRecipients(candidates, 'alise', 10);
        expect(result[0]).toBe(alice);
        expect(result).not.toContain(bob);
    });

    it('ignores diacritics', () => {
        expect(rankRecipients(candidates, 'bjorn', 10)[0]).toBe(bjorn);
    });

    it('returns no matches for an unrelated query', () => {
        expect(rankRecipients(candidates, 'zzzzzz', 10)).toEqual([]);
    });

    it('matches on the user name', () => {
        expect(rankRecipients(candidates, 'bobby', 10)).toEqual([bob]);
    });

    it('never exceeds the limit', () => {
        expect(rankRecipients(candidates, 'o', 1)).toHaveLength(1);
    });
});

describe('recipientLabel', () => {
    it('prefers the display name and appends the company', () => {
        expect(recipientLabel(alice)).toBe('Alice Anderson (AnderTech)');
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
