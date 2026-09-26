import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageSummary } from '@/server/controller/message';

const h = vi.hoisted(() => ({
    inbox: { current: [] as unknown[] },
    sent: { current: [] as unknown[] },
    unreadCount: { current: 0 },
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

vi.mock('@/hooks/useMessages', () => ({
    useUnreadMessageCount: () => h.unreadCount.current,
    useMarkRead: () => ({ mutate: h.markRead, isPending: false }),
    useMarkAllRead: () => ({ mutate: h.markAllRead, isPending: false }),
    useDeleteMessage: () => ({ mutate: h.deleteMessage, isPending: false }),
    useDeleteMessages: () => ({ mutate: h.deleteMessages, isPending: false }),
}));

vi.mock('@/lib/trpc', () => ({
    useTRPC: () => ({
        message: {
            listInbox: { queryOptions: (input: unknown) => ({ queryKey: ['message', 'listInbox', input] }) },
            listSent: { queryOptions: (input: unknown) => ({ queryKey: ['message', 'listSent', input] }) },
        },
    }),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
    const original = (await importOriginal()) as typeof import('@tanstack/react-query');
    return {
        ...original,
        useQuery: (options: { queryKey?: unknown[] }) => {
            const kind = Array.isArray(options.queryKey) ? options.queryKey[1] : undefined;
            const messages = kind === 'listSent' ? h.sent.current : h.inbox.current;
            return { data: { messages, total: messages.length }, isLoading: false };
        },
    };
});

import MessagesPage from './page';

const message = (overrides: Partial<MessageSummary>): MessageSummary => ({
    id: 'm1',
    subject: 'Hello there',
    body: 'Message body',
    createdAt: '2026-09-26T12:00:00.000Z',
    readAt: null,
    counterpartUserId: 'user-2',
    counterpartDisplayName: 'Bob Brown',
    counterpartUsername: 'bobby',
    counterpartAvatar: null,
    counterpartCompanyName: null,
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
        h.unreadCount.current = 0;
    });

    it('enables delete all read in the inbox when a read message exists', () => {
        render(<MessagesPage />);

        expect(deleteAllReadButton()).toBeInTheDocument();
        expect(deleteAllReadButton()).toBeEnabled();
    });

    it('disables delete all read when the inbox has no read message', () => {
        h.inbox.current = [unreadInbox, message({ id: 'unread-2', subject: 'Also unread' })];
        render(<MessagesPage />);

        expect(deleteAllReadButton()).toBeDisabled();
    });

    it('offers delete all but not delete all read in the sent folder', async () => {
        render(<MessagesPage />);

        await userEvent.click(screen.getByRole('tab', { name: 'Sent' }));

        expect(screen.getByText('Sent unread subject')).toBeInTheDocument();
        expect(deleteAllReadButton()).not.toBeInTheDocument();
        expect(deleteAllButton()).toBeEnabled();
    });

    it('confirms and deletes all read inbox messages', async () => {
        render(<MessagesPage />);

        await userEvent.click(deleteAllReadButton()!);

        const dialog = screen.getByRole('dialog', { name: 'Delete all read messages?' });
        await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

        expect(h.deleteMessages).toHaveBeenCalledWith({ direction: 'inbox', onlyRead: true }, expect.anything());
    });

    it('confirms and deletes all sent messages', async () => {
        render(<MessagesPage />);

        await userEvent.click(screen.getByRole('tab', { name: 'Sent' }));
        await userEvent.click(deleteAllButton()!);

        const dialog = screen.getByRole('dialog', { name: 'Delete all sent messages?' });
        await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

        expect(h.deleteMessages).toHaveBeenCalledWith({ direction: 'sent', onlyRead: false }, expect.anything());
    });

    it('disables the sent delete all button when there is nothing to delete', async () => {
        h.sent.current = [];
        render(<MessagesPage />);

        await userEvent.click(screen.getByRole('tab', { name: 'Sent' }));

        expect(deleteAllButton()).toBeDisabled();
    });

    it('does not delete when the confirmation is cancelled', async () => {
        render(<MessagesPage />);

        await userEvent.click(deleteAllReadButton()!);

        const dialog = screen.getByRole('dialog', { name: 'Delete all read messages?' });
        await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

        expect(h.deleteMessages).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog', { name: 'Delete all read messages?' })).not.toBeInTheDocument();
    });

    it('shows whether a sent message has been read', async () => {
        render(<MessagesPage />);

        await userEvent.click(screen.getByRole('tab', { name: 'Sent' }));

        expect(screen.getByText('Unread')).toBeInTheDocument();
        expect(screen.getByText('Read')).toBeInTheDocument();
    });

    it('groups mark all read with delete all read in the inbox', () => {
        h.unreadCount.current = 2;
        render(<MessagesPage />);

        expect(screen.getByRole('button', { name: 'Mark all read' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Delete all read' })).toBeInTheDocument();
    });

    it('marks all messages read when clicked', async () => {
        h.unreadCount.current = 2;
        render(<MessagesPage />);

        await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }));

        expect(h.markAllRead).toHaveBeenCalled();
    });

    it('disables mark all read when there are no unread messages', () => {
        render(<MessagesPage />);

        expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
    });

    it('does not show mark all read in the sent folder', async () => {
        h.unreadCount.current = 2;
        render(<MessagesPage />);

        await userEvent.click(screen.getByRole('tab', { name: 'Sent' }));

        expect(screen.queryByRole('button', { name: 'Mark all read' })).not.toBeInTheDocument();
    });

    it('confirms and deletes a single message from the message dialog', async () => {
        render(<MessagesPage />);

        await userEvent.click(screen.getByRole('button', { name: /Unread subject/ }));

        const messageDialog = screen.getByRole('dialog', { name: 'Unread subject' });
        await userEvent.click(within(messageDialog).getByRole('button', { name: 'Delete' }));

        const confirmDialog = screen.getByRole('dialog', { name: 'Delete message?' });
        await userEvent.click(within(confirmDialog).getByRole('button', { name: 'Delete' }));

        expect(h.deleteMessage).toHaveBeenCalledWith({ messageId: 'unread' }, expect.anything());
    });
});
