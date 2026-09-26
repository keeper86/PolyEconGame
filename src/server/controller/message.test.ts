import { getCaller, getUnauthenticatedCaller, testUsers } from 'tests/vitest/setupTestcontainer';
import { describe, expect, it } from 'vitest';

describe('message endpoints (integration)', async () => {
    it('sends a message that appears in the recipient inbox and the sender sent box', async () => {
        const senderId = testUsers.testUser.user_id;
        const recipientId = testUsers.otherUserPublished.user_id;
        const sender = getCaller(senderId);

        const { id } = await sender.message.sendMessage({
            recipientUserId: recipientId,
            subject: 'Hello',
            body: 'Trade offer',
        });
        expect(id).toBeTruthy();

        const inbox = await getCaller(recipientId).message.listInbox({ limit: 25, offset: 0 });
        const stored = inbox.messages.find((message) => message.id === id);
        expect(stored).toBeDefined();
        expect(stored?.subject).toBe('Hello');
        expect(stored?.body).toBe('Trade offer');
        expect(stored?.counterpartUserId).toBe(senderId);
        expect(stored?.readAt).toBeNull();

        const sent = await sender.message.listSent({ limit: 25, offset: 0 });
        expect(sent.messages.some((message) => message.id === id)).toBe(true);
    });

    it('counts unread messages and clears one on read', async () => {
        const sender = getCaller(testUsers.testUser.user_id);
        const recipientId = testUsers.otherUserPublished.user_id;
        const recipient = getCaller(recipientId);

        const before = await recipient.message.getUnreadCount();
        const { id } = await sender.message.sendMessage({
            recipientUserId: recipientId,
            subject: 'Unread check',
            body: 'body',
        });

        const after = await recipient.message.getUnreadCount();
        expect(after.count).toBe(before.count + 1);

        await recipient.message.markRead({ messageId: id });

        const read = await recipient.message.getUnreadCount();
        expect(read.count).toBe(before.count);
    });

    it('rejects marking a message read by someone who is not the recipient', async () => {
        const sender = getCaller(testUsers.testUser.user_id);
        const recipientId = testUsers.otherUserPublished.user_id;

        const { id } = await sender.message.sendMessage({
            recipientUserId: recipientId,
            subject: 'Not yours',
            body: 'body',
        });

        await expect(sender.message.markRead({ messageId: id })).rejects.toThrow();
    });

    it('marks all inbox messages read', async () => {
        const sender = getCaller(testUsers.testUser.user_id);
        const recipientId = testUsers.otherUserUnpublished.user_id;
        const recipient = getCaller(recipientId);

        await sender.message.sendMessage({ recipientUserId: recipientId, subject: 'One', body: 'body' });
        await sender.message.sendMessage({ recipientUserId: recipientId, subject: 'Two', body: 'body' });

        const result = await recipient.message.markAllRead();
        expect(result.updated).toBeGreaterThanOrEqual(2);

        const unread = await recipient.message.getUnreadCount();
        expect(unread.count).toBe(0);
    });

    it('rejects sending a message to yourself', async () => {
        const caller = getCaller(testUsers.testUser.user_id);

        await expect(
            caller.message.sendMessage({
                recipientUserId: testUsers.testUser.user_id,
                subject: 'Me',
                body: 'body',
            }),
        ).rejects.toThrow();
    });

    it('rejects sending a message to an unknown recipient', async () => {
        const caller = getCaller(testUsers.testUser.user_id);

        await expect(
            caller.message.sendMessage({ recipientUserId: 'does-not-exist', subject: 'Ghost', body: 'body' }),
        ).rejects.toThrow();
    });

    it('lists recipients excluding the current user', async () => {
        const caller = getCaller(testUsers.testUser.user_id);

        const { recipients } = await caller.message.listRecipients({ search: '', limit: 100 });

        expect(recipients.some((recipient) => recipient.userId === testUsers.testUser.user_id)).toBe(false);
        expect(recipients.some((recipient) => recipient.userId === testUsers.otherUserPublished.user_id)).toBe(true);
    });

    it('fuzzy searches recipients by display name without returning the current user', async () => {
        const caller = getCaller(testUsers.testUser.user_id);

        const { recipients } = await caller.message.listRecipients({ search: 'Other Uzer', limit: 100 });
        const ids = recipients.map((recipient) => recipient.userId);

        expect(ids).not.toContain(testUsers.testUser.user_id);
        expect(ids).toEqual(
            expect.arrayContaining([testUsers.otherUserPublished.user_id, testUsers.otherUserUnpublished.user_id]),
        );
    });

    it('ranks a user id match first', async () => {
        const caller = getCaller(testUsers.testUser.user_id);

        const { recipients } = await caller.message.listRecipients({ search: 'other-user-published', limit: 100 });

        expect(recipients[0]?.userId).toBe(testUsers.otherUserPublished.user_id);
    });

    it('respects the recipient result limit', async () => {
        const caller = getCaller(testUsers.testUser.user_id);

        const { recipients } = await caller.message.listRecipients({ search: '', limit: 1 });

        expect(recipients).toHaveLength(1);
    });

    it('rejects unauthenticated access', async () => {
        const anon = getUnauthenticatedCaller();

        await expect(anon.message.listInbox({ limit: 25, offset: 0 })).rejects.toThrow();
        await expect(anon.message.getUnreadCount()).rejects.toThrow();
    });
});
