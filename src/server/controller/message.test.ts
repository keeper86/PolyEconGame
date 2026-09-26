import { getCaller, getDb, getUnauthenticatedCaller, testUsers } from 'tests/vitest/setupTestcontainer';
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
        expect(stored?.counterpartCompanyName).toBeNull();
        expect(stored?.counterpartCompanyLogo).toBeNull();

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

    it('matches recipients by user name', async () => {
        const caller = getCaller(testUsers.testUser.user_id);

        const { recipients } = await caller.message.listRecipients({ search: 'otheruser', limit: 100 });
        const ids = recipients.map((recipient) => recipient.userId);

        expect(ids).not.toContain(testUsers.testUser.user_id);
        expect(ids).toEqual(
            expect.arrayContaining([testUsers.otherUserPublished.user_id, testUsers.otherUserUnpublished.user_id]),
        );
    });

    it('returns the user name alongside the display name', async () => {
        const caller = getCaller(testUsers.testUser.user_id);

        const { recipients } = await caller.message.listRecipients({ search: 'other-user-published', limit: 100 });
        const recipient = recipients.find((entry) => entry.userId === testUsers.otherUserPublished.user_id);

        expect(recipient?.displayName).toBe('Other User');
        expect(recipient?.username).toBe('otheruser');
    });

    it('rejects unauthenticated access', async () => {
        const anon = getUnauthenticatedCaller();

        await expect(anon.message.listInbox({ limit: 25, offset: 0 })).rejects.toThrow();
        await expect(anon.message.getUnreadCount()).rejects.toThrow();
    });

    it('hides a deleted message from the recipient but keeps it for the sender', async () => {
        const sender = getCaller(testUsers.testUser.user_id);
        const recipientId = testUsers.otherUserPublished.user_id;
        const recipient = getCaller(recipientId);

        const { id } = await sender.message.sendMessage({
            recipientUserId: recipientId,
            subject: 'Delete me',
            body: 'body',
        });

        await recipient.message.deleteMessage({ messageId: id });

        const inbox = await recipient.message.listInbox({ limit: 100, offset: 0 });
        expect(inbox.messages.some((message) => message.id === id)).toBe(false);

        const sent = await sender.message.listSent({ limit: 100, offset: 0 });
        expect(sent.messages.some((message) => message.id === id)).toBe(true);
    });

    it('excludes a deleted unread message from the unread count', async () => {
        const sender = getCaller(testUsers.testUser.user_id);
        const recipientId = testUsers.otherUserPublished.user_id;
        const recipient = getCaller(recipientId);

        const before = await recipient.message.getUnreadCount();
        const { id } = await sender.message.sendMessage({
            recipientUserId: recipientId,
            subject: 'Unread then deleted',
            body: 'body',
        });
        await recipient.message.deleteMessage({ messageId: id });

        const after = await recipient.message.getUnreadCount();
        expect(after.count).toBe(before.count);
    });

    it('hides a deleted message from the sender but keeps it for the recipient', async () => {
        const sender = getCaller(testUsers.testUser.user_id);
        const recipientId = testUsers.otherUserPublished.user_id;
        const recipient = getCaller(recipientId);

        const { id } = await sender.message.sendMessage({
            recipientUserId: recipientId,
            subject: 'Sender delete',
            body: 'body',
        });

        await sender.message.deleteMessage({ messageId: id });

        const sent = await sender.message.listSent({ limit: 100, offset: 0 });
        expect(sent.messages.some((message) => message.id === id)).toBe(false);

        const inbox = await recipient.message.listInbox({ limit: 100, offset: 0 });
        expect(inbox.messages.some((message) => message.id === id)).toBe(true);
    });

    it('flags a sent message the recipient deleted as deleted for the sender', async () => {
        const sender = getCaller(testUsers.testUser.user_id);
        const recipientId = testUsers.otherUserPublished.user_id;
        const recipient = getCaller(recipientId);

        const { id } = await sender.message.sendMessage({
            recipientUserId: recipientId,
            subject: 'Recipient delete',
            body: 'body',
        });

        await recipient.message.deleteMessage({ messageId: id });

        const sent = await sender.message.listSent({ limit: 100, offset: 0 });
        const stored = sent.messages.find((message) => message.id === id);
        expect(stored?.counterpartDeleted).toBe(true);
    });

    it('removes the row once both participants have deleted it', async () => {
        const sender = getCaller(testUsers.testUser.user_id);
        const recipientId = testUsers.otherUserPublished.user_id;
        const recipient = getCaller(recipientId);

        const { id } = await sender.message.sendMessage({
            recipientUserId: recipientId,
            subject: 'Both delete',
            body: 'body',
        });

        await sender.message.deleteMessage({ messageId: id });
        await recipient.message.deleteMessage({ messageId: id });

        const row = await getDb()('messages').where({ id }).first();
        expect(row).toBeUndefined();
    });

    it('rejects deleting a message the caller is not part of', async () => {
        const sender = getCaller(testUsers.testUser.user_id);
        const recipientId = testUsers.otherUserPublished.user_id;
        const outsider = getCaller(testUsers.otherUserUnpublished.user_id);

        const { id } = await sender.message.sendMessage({
            recipientUserId: recipientId,
            subject: 'Not yours',
            body: 'body',
        });

        await expect(outsider.message.deleteMessage({ messageId: id })).rejects.toThrow();
    });

    it('deletes only read inbox messages and reports the count', async () => {
        const sender = getCaller(testUsers.testUser.user_id);
        const recipientId = testUsers.otherUserUnpublished.user_id;
        const recipient = getCaller(recipientId);

        await sender.message.sendMessage({ recipientUserId: recipientId, subject: 'Unread stays', body: 'body' });

        const before = await recipient.message.getUnreadCount();
        const { deleted } = await recipient.message.deleteMessages({ direction: 'inbox', onlyRead: true });
        expect(deleted).toBeGreaterThanOrEqual(1);

        const inbox = await recipient.message.listInbox({ limit: 100, offset: 0 });
        expect(inbox.messages.some((message) => message.readAt === null)).toBe(true);
        expect(inbox.messages.some((message) => message.readAt !== null)).toBe(false);

        const after = await recipient.message.getUnreadCount();
        expect(after.count).toBe(before.count);
    });

    it('deletes all messages from the sent folder', async () => {
        const recipientId = testUsers.otherUserPublished.user_id;
        const recipient = getCaller(recipientId);
        const sender = getCaller(testUsers.testUser.user_id);

        await sender.message.sendMessage({ recipientUserId: recipientId, subject: 'Kept unread', body: 'body' });
        const { id: readId } = await sender.message.sendMessage({
            recipientUserId: recipientId,
            subject: 'Was read',
            body: 'body',
        });
        await recipient.message.markRead({ messageId: readId });

        const { deleted } = await sender.message.deleteMessages({ direction: 'sent', onlyRead: false });
        expect(deleted).toBeGreaterThanOrEqual(2);

        const sent = await sender.message.listSent({ limit: 100, offset: 0 });
        expect(sent.total).toBe(0);
    });

    it('rejects unauthenticated delete requests', async () => {
        const anon = getUnauthenticatedCaller();

        await expect(anon.message.deleteMessage({ messageId: 'anything' })).rejects.toThrow();
        await expect(anon.message.deleteMessages({ direction: 'inbox', onlyRead: true })).rejects.toThrow();
    });

    it('searches recipients server-side across the whole user table, ignoring diacritics', async () => {
        const caller = getCaller(testUsers.testUser.user_id);
        const db = getDb();

        await db('user_data').insert({
            user_id: 'diacritic-user',
            display_name: 'Björn Ödegård',
            username: 'bjorn-o',
            email: 'bjorn@example.com',
            has_assessment_published: false,
            agent_id: null,
            avatar: null,
            planet_id: null,
        });

        try {
            const { recipients } = await caller.message.listRecipients({ search: 'bjorn', limit: 25 });
            const match = recipients.find((recipient) => recipient.userId === 'diacritic-user');
            expect(match).toBeDefined();
            expect(match?.displayName).toBe('Björn Ödegård');
        } finally {
            await db('user_data').where({ user_id: 'diacritic-user' }).del();
        }
    });

    it('finds recipients by a middle substring of their display name', async () => {
        const caller = getCaller(testUsers.testUser.user_id);

        const { recipients } = await caller.message.listRecipients({ search: 'ther', limit: 25 });

        expect(recipients.map((recipient) => recipient.userId)).toEqual(
            expect.arrayContaining([testUsers.otherUserPublished.user_id, testUsers.otherUserUnpublished.user_id]),
        );
    });

    it('ignores marking a deleted message as read', async () => {
        const sender = getCaller(testUsers.testUser.user_id);
        const recipientId = testUsers.otherUserPublished.user_id;
        const recipient = getCaller(recipientId);

        const { id } = await sender.message.sendMessage({
            recipientUserId: recipientId,
            subject: 'Deleted then read',
            body: 'body',
        });
        await recipient.message.deleteMessage({ messageId: id });

        await expect(recipient.message.markRead({ messageId: id })).resolves.toBeUndefined();

        const row = await getDb()('messages').where({ id }).first();
        expect(row?.read_at).toBeNull();
    });

    it('does not mark deleted messages read in bulk', async () => {
        const sender = getCaller(testUsers.testUser.user_id);
        const recipientId = testUsers.otherUserUnpublished.user_id;
        const recipient = getCaller(recipientId);

        const { id } = await sender.message.sendMessage({
            recipientUserId: recipientId,
            subject: 'Deleted bulk',
            body: 'body',
        });
        await recipient.message.deleteMessage({ messageId: id });

        await recipient.message.markAllRead();

        const row = await getDb()('messages').where({ id }).first();
        expect(row?.read_at).toBeNull();
    });
});
