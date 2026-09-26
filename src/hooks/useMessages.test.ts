import { describe, expect, it } from 'vitest';
import { isCountPolledMessageQuery, isListPolledMessageQuery, isMessageQuery } from './useMessages';

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

    it('polls only the unread count in the global scope', () => {
        expect(isCountPolledMessageQuery(nestedKey('getUnreadCount'))).toBe(true);
        expect(isCountPolledMessageQuery(nestedKey('listInbox'))).toBe(false);
        expect(isCountPolledMessageQuery(nestedKey('listSent'))).toBe(false);
        expect(isCountPolledMessageQuery(nestedKey('listRecipients'))).toBe(false);
        expect(isCountPolledMessageQuery(nestedKey('getMessage'))).toBe(false);
    });

    it('polls only the message lists in the list scope', () => {
        expect(isListPolledMessageQuery(nestedKey('listInbox'))).toBe(true);
        expect(isListPolledMessageQuery(nestedKey('listSent'))).toBe(true);
        expect(isListPolledMessageQuery(nestedKey('getUnreadCount'))).toBe(false);
        expect(isListPolledMessageQuery(nestedKey('listRecipients'))).toBe(false);
        expect(isListPolledMessageQuery(nestedKey('getMessage'))).toBe(false);
    });

    it('ignores queries outside the message router', () => {
        expect(isMessageQuery([['user', 'getUser'], {}])).toBe(false);
        expect(isCountPolledMessageQuery([['user', 'getUser'], {}])).toBe(false);
        expect(isListPolledMessageQuery([['user', 'getUser'], {}])).toBe(false);
    });

    it('handles flat query keys', () => {
        expect(isMessageQuery(['message', 'listInbox'])).toBe(true);
        expect(isListPolledMessageQuery(['message', 'listInbox'])).toBe(true);
        expect(isMessageQuery(['other'])).toBe(false);
    });
});
