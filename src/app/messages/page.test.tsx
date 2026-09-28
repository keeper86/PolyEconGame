import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { renderWithIntl } from 'tests/vitest/renderWithIntl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageSummary } from '@/server/controller/message';

const h = vi.hoisted(() => ({
    inbox: { current: [] as unknown[] },
    sent: { current: [] as unknown[] },
    inboxTotal: { current: 0 },
    sentTotal: { current: 0 },
    inboxInputs: [] as { limit: number; offset: number }[],
    sentInputs: [] as { limit: number; offset: number }[],
    unreadCount: { current: 0 },
    messageBody: { current: 'Message body' },
    deleteMessage: vi.fn(),
    deleteMessages: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
}));

vi.mock('next-auth/react', () => ({
    useSession: () => ({ status: 'authenticated' }),
}));

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/app/messages/_components/ComposeMessageDialog', () => ({
    ComposeMessageDialog: () => null,
}));

vi.mock('@/components/client/UserAvatar', () => ({ default: () => null }));
vi.mock('@/components/client/CompanyLogo', () => ({ CompanyLogo: () => null }));

vi.mock('@/hooks/useMessages', () => ({
    useUnreadMessageCount: () => h.unreadCount.current,
    useMessageBody: (messageId: string | null) => (messageId ? h.messageBody.current : null),
    useMessageListPolling: () => undefined,
    useMarkRead: () => ({ mutate: h.markRead, isPending: false }),
    useMarkAllRead: () => ({ mutate: h.markAllRead, isPending: false }),
    useDeleteMessage: () => ({ mutate: h.deleteMessage, isPending: false }),
    useDeleteMessages: () => ({ mutate: h.deleteMessages, isPending: false }),
}));

vi.mock('@/lib/trpc', () => ({
    useTRPC: () => ({
        message: {
            listInbox: {
                queryOptions: (input: { limit: number; offset: number }) => {
                    h.inboxInputs.push(input);
                    return { queryKey: ['message', 'listInbox', input] };
                },
            },
            listSent: {
                queryOptions: (input: { limit: number; offset: number }) => {
                    h.sentInputs.push(input);
                    return { queryKey: ['message', 'listSent', input] };
                },
            },
        },
    }),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
    const original = (await importOriginal()) as typeof import('@tanstack/react-query');
    return {
        ...original,
        useQuery: (options: { queryKey?: unknown[] }) => {
            const kind = Array.isArray(options.queryKey) ? options.queryKey[1] : undefined;
            if (kind === 'listSent') {
                return { data: { messages: h.sent.current, total: h.sentTotal.current }, isLoading: false };
            }
            return { data: { messages: h.inbox.current, total: h.inboxTotal.current }, isLoading: false };
        },
    };
});

import MessagesPage from './page';

const message = (overrides: Partial<MessageSummary>): MessageSummary => ({
    id: 'm1',
    subject: 'Hello there',
    createdAt: '2026-09-26T12:00:00.000Z',
    readAt: null,
    counterpartUserId: 'user-2',
    counterpartDisplayName: 'Bob Brown',
    counterpartUsername: 'bobby',
    counterpartCompanyName: null,
    counterpartCompanyLogo: null,
    counterpartDeleted: false,
    ...overrides,
});

const unreadInbox = message({ id: 'unread', subject: 'Unread subject' });
const readInbox = message({ id: 'read', subject: 'Read subject', readAt: '2026-09-26T13:00:00.000Z' });
const sentUnread = message({ id: 'sent-unread', subject: 'Sent unread subject', counterpartDisplayName: 'Alice' });
const sentRead = message({
    id: 'sent-read',
    subject: 'Sent read subject',
    counterpartDisplayName: 'Carol',
    readAt: '2026-09-26T14:00:00.000Z',
});

const deleteAllReadButton = () => screen.queryByRole('button', { name: 'Delete all read' });
const deleteAllButton = () => screen.queryByRole('button', { name: 'Delete all' });

describe('MessagesPage delete controls', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        h.inbox.current = [unreadInbox, readInbox];
        h.sent.current = [sentUnread, sentRead];
        h.inboxTotal.current = h.inbox.current.length;
        h.sentTotal.current = h.sent.current.length;
        h.inboxInputs.length = 0;
        h.sentInputs.length = 0;
        h.unreadCount.current = 0;
        h.messageBody.current = 'Message body';
    });

    it('enables delete all read in the inbox when a read message exists', () => {
        renderWithIntl(<MessagesPage />);

        expect(deleteAllReadButton()).toBeInTheDocument();
        expect(deleteAllReadButton()).toBeEnabled();
    });

    it('disables delete all read when the inbox has no read message', () => {
        h.inbox.current = [unreadInbox, message({ id: 'unread-2', subject: 'Also unread' })];
        renderWithIntl(<MessagesPage />);

        expect(deleteAllReadButton()).toBeDisabled();
    });

    it('offers delete all but not delete all read in the sent folder', async () => {
        renderWithIntl(<MessagesPage />);

        await userEvent.click(screen.getByRole('tab', { name: 'Sent' }));

        expect(screen.getByText('Sent unread subject')).toBeInTheDocument();
        expect(deleteAllReadButton()).not.toBeInTheDocument();
        expect(deleteAllButton()).toBeEnabled();
    });

    it('confirms and deletes all read inbox messages', async () => {
        renderWithIntl(<MessagesPage />);

        await userEvent.click(deleteAllReadButton()!);

        const dialog = screen.getByRole('dialog', { name: 'Delete all read messages?' });
        await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

        expect(h.deleteMessages).toHaveBeenCalledWith({ direction: 'inbox', onlyRead: true }, expect.anything());
    });

    it('confirms and deletes all sent messages', async () => {
        renderWithIntl(<MessagesPage />);

        await userEvent.click(screen.getByRole('tab', { name: 'Sent' }));
        await userEvent.click(deleteAllButton()!);

        const dialog = screen.getByRole('dialog', { name: 'Delete all sent messages?' });
        await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

        expect(h.deleteMessages).toHaveBeenCalledWith({ direction: 'sent', onlyRead: false }, expect.anything());
    });

    it('disables the sent delete all button when there is nothing to delete', async () => {
        h.sent.current = [];
        renderWithIntl(<MessagesPage />);

        await userEvent.click(screen.getByRole('tab', { name: 'Sent' }));

        expect(deleteAllButton()).toBeDisabled();
    });

    it('does not delete when the confirmation is cancelled', async () => {
        renderWithIntl(<MessagesPage />);

        await userEvent.click(deleteAllReadButton()!);

        const dialog = screen.getByRole('dialog', { name: 'Delete all read messages?' });
        await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

        expect(h.deleteMessages).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog', { name: 'Delete all read messages?' })).not.toBeInTheDocument();
    });

    it('shows whether a sent message has been read', async () => {
        renderWithIntl(<MessagesPage />);

        await userEvent.click(screen.getByRole('tab', { name: 'Sent' }));

        expect(screen.getByText('Unread')).toBeInTheDocument();
        expect(screen.getByText('Read')).toBeInTheDocument();
    });

    it('shows a sent message as deleted when the recipient deleted it', async () => {
        h.sent.current = [message({ id: 'sent-deleted', subject: 'Gone', counterpartDeleted: true })];
        renderWithIntl(<MessagesPage />);

        await userEvent.click(screen.getByRole('tab', { name: 'Sent' }));

        expect(screen.getByText('Deleted')).toBeInTheDocument();
        expect(screen.queryByText('Unread')).not.toBeInTheDocument();
    });

    it('pages the inbox when there are more messages than fit on one page', async () => {
        h.inboxTotal.current = 60;
        renderWithIntl(<MessagesPage />);

        expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Next' }));

        expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
        expect(h.inboxInputs.at(-1)).toEqual({ limit: 25, offset: 25 });
    });

    it('does not show pagination when everything fits on one page', () => {
        renderWithIntl(<MessagesPage />);

        expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    });

    it('groups mark all read with delete all read in the inbox', () => {
        h.unreadCount.current = 2;
        renderWithIntl(<MessagesPage />);

        expect(screen.getByRole('button', { name: 'Mark all read' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Delete all read' })).toBeInTheDocument();
    });

    it('marks all messages read when clicked', async () => {
        h.unreadCount.current = 2;
        renderWithIntl(<MessagesPage />);

        await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }));

        expect(h.markAllRead).toHaveBeenCalled();
    });

    it('disables mark all read when there are no unread messages', () => {
        renderWithIntl(<MessagesPage />);

        expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
    });

    it('does not show mark all read in the sent folder', async () => {
        h.unreadCount.current = 2;
        renderWithIntl(<MessagesPage />);

        await userEvent.click(screen.getByRole('tab', { name: 'Sent' }));

        expect(screen.queryByRole('button', { name: 'Mark all read' })).not.toBeInTheDocument();
    });

    it('loads and shows the message body when a message is opened', async () => {
        h.messageBody.current = 'Fetched body';
        renderWithIntl(<MessagesPage />);

        await userEvent.click(screen.getByRole('button', { name: /Unread subject/ }));

        expect(
            within(screen.getByRole('dialog', { name: 'Unread subject' })).getByText('Fetched body'),
        ).toBeInTheDocument();
    });

    it('marks an unread inbox message read when it is opened', async () => {
        renderWithIntl(<MessagesPage />);

        await userEvent.click(screen.getByRole('button', { name: /Unread subject/ }));

        expect(h.markRead).toHaveBeenCalledWith({ messageId: 'unread' }, expect.anything());
    });

    it('does not mark an already read inbox message read again', async () => {
        renderWithIntl(<MessagesPage />);

        await userEvent.click(screen.getByRole('button', { name: /Read subject/ }));

        expect(h.markRead).not.toHaveBeenCalled();
    });

    it('shows an error toast when marking a message read fails', async () => {
        h.markRead.mockImplementationOnce((_input, options) => options.onError(new Error('nope')));
        renderWithIntl(<MessagesPage />);

        await userEvent.click(screen.getByRole('button', { name: /Unread subject/ }));

        expect(toast.error).toHaveBeenCalledWith('nope');
    });

    it('confirms and deletes a single message from the message dialog', async () => {
        renderWithIntl(<MessagesPage />);

        await userEvent.click(screen.getByRole('button', { name: /Unread subject/ }));

        const messageDialog = screen.getByRole('dialog', { name: 'Unread subject' });
        await userEvent.click(within(messageDialog).getByRole('button', { name: 'Delete' }));

        const confirmDialog = screen.getByRole('dialog', { name: 'Delete message?' });
        await userEvent.click(within(confirmDialog).getByRole('button', { name: 'Delete' }));

        expect(h.deleteMessage).toHaveBeenCalledWith({ messageId: 'unread' }, expect.anything());
    });
});
