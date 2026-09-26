import { describe, expect, it } from 'vitest';
import { isMessageQuery, isPolledMessageQuery } from './useMessages';

const nestedKey = (procedure: string): readonly unknown[] => [
    ['message', procedure],
    { input: undefined, type: 'query' },
];

describe('message query predicates', () => {
    it('recognises every procedure of the message router', () => {
        expect(isMessageQuery(nestedKey('listRecipients'))).toBe(true);
        expect(isMessageQuery(nestedKey('listInbox'))).toBe(true);
        expect(isMessageQuery(nestedKey('getMessage'))).toBe(true);
    });

    it('polls only queries that produce live message data', () => {
        expect(isPolledMessageQuery(nestedKey('getUnreadCount'))).toBe(true);
        expect(isPolledMessageQuery(nestedKey('listInbox'))).toBe(true);
        expect(isPolledMessageQuery(nestedKey('listSent'))).toBe(true);
        expect(isPolledMessageQuery(nestedKey('listRecipients'))).toBe(false);
        expect(isPolledMessageQuery(nestedKey('getMessage'))).toBe(false);
    });

    it('ignores queries outside the message router', () => {
        expect(isMessageQuery([['user', 'getUser'], {}])).toBe(false);
        expect(isPolledMessageQuery([['user', 'getUser'], {}])).toBe(false);
    });

    it('handles flat query keys', () => {
        expect(isMessageQuery(['message', 'listInbox'])).toBe(true);
        expect(isPolledMessageQuery(['message', 'listInbox'])).toBe(true);
        expect(isMessageQuery(['other'])).toBe(false);
    });
});
