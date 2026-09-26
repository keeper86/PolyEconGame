'use client';

import { Page } from '@/components/client/Page';
import { ComposeMessageDialog } from '@/app/messages/_components/ComposeMessageDialog';
import { CounterpartAvatar } from '@/app/messages/_components/CounterpartAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    useDeleteMessage,
    useDeleteMessages,
    useMarkAllRead,
    useMarkRead,
    useUnreadMessageCount,
} from '@/hooks/useMessages';
import { recipientLabel } from '@/lib/recipientSearch';
import { useTRPC } from '@/lib/trpc';
import type { MessageSummary } from '@/server/controller/message';
import { useQuery } from '@tanstack/react-query';
import { CheckCheck, Trash2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

const PAGE_SIZE = 25;

const formatTimestamp = (iso: string): string => new Date(iso).toLocaleString();

const counterpartName = (message: MessageSummary): string =>
    recipientLabel({
        userId: message.counterpartUserId,
        displayName: message.counterpartDisplayName,
        username: message.counterpartUsername,
        companyName: message.counterpartCompanyName,
    });

const sentMessageStatus = (message: MessageSummary): { label: string; className: string } => {
    if (message.counterpartDeleted) {
        return { label: 'Deleted', className: 'shrink-0' };
    }
    if (message.readAt) {
        return { label: 'Read', className: 'shrink-0' };
    }
    return { label: 'Unread', className: 'shrink-0 font-medium text-primary' };
};

type ConfirmTarget = { kind: 'message'; messageId: string } | { kind: 'inboxRead' } | { kind: 'sentAll' };

const confirmCopy = (confirm: ConfirmTarget): { title: string; description: string } => {
    switch (confirm.kind) {
        case 'message':
            return {
                title: 'Delete message?',
                description: 'This removes the message from your view. This cannot be undone.',
            };
        case 'inboxRead':
            return {
                title: 'Delete all read messages?',
                description: 'This removes all read messages from your inbox. This cannot be undone.',
            };
        case 'sentAll':
            return {
                title: 'Delete all sent messages?',
                description: 'This removes all messages from your sent folder. This cannot be undone.',
            };
    }
};

function MessageRow({
    message,
    direction,
    onSelect,
}: {
    message: MessageSummary;
    direction: 'inbox' | 'sent';
    onSelect: () => void;
}) {
    const unread = direction === 'inbox' && message.readAt === null;
    const status = sentMessageStatus(message);

    return (
        <button
            type='button'
            onClick={onSelect}
            className='flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors hover:bg-muted/60'
        >
            <CounterpartAvatar message={message} />
            <span className='flex min-w-0 flex-1 flex-col gap-1'>
                <span className='flex items-center gap-2'>
                    {unread && <span className='h-2 w-2 shrink-0 rounded-full bg-primary' />}
                    <span className={unread ? 'truncate font-semibold' : 'truncate'}>{message.subject}</span>
                </span>
                <span className='flex items-center justify-between gap-2 text-xs text-muted-foreground'>
                    <span className='flex min-w-0 items-center gap-2'>
                        {direction === 'sent' && <span className={status.className}>{status.label}</span>}
                        <span className='truncate'>{counterpartName(message)}</span>
                    </span>
                    <span className='shrink-0'>{formatTimestamp(message.createdAt)}</span>
                </span>
            </span>
        </button>
    );
}

function MessagePane({
    title,
    description,
    emptyText,
    isLoading,
    messages,
    direction,
    onSelect,
    headerAction,
    page,
    total,
    onPageChange,
}: {
    title: string;
    description: string;
    emptyText: string;
    isLoading: boolean;
    messages: MessageSummary[];
    direction: 'inbox' | 'sent';
    onSelect: (message: MessageSummary, direction: 'inbox' | 'sent') => void;
    headerAction: ReactNode;
    page: number;
    total: number;
    onPageChange: (page: number) => void;
}) {
    return (
        <div className='rounded-lg border border-border'>
            <div className='flex items-start justify-between gap-3 border-b border-border px-3 py-3'>
                <div className='flex flex-col gap-1'>
                    <span className='font-medium'>{title}</span>
                    <span className='text-xs text-muted-foreground'>{description}</span>
                </div>
                {headerAction}
            </div>
            {isLoading ? (
                <div className='px-3 py-6 text-sm text-muted-foreground'>Loading…</div>
            ) : messages.length === 0 ? (
                <div className='px-3 py-6 text-sm text-muted-foreground'>{emptyText}</div>
            ) : (
                messages.map((message) => (
                    <MessageRow
                        key={message.id}
                        message={message}
                        direction={direction}
                        onSelect={() => onSelect(message, direction)}
                    />
                ))
            )}
            {total > PAGE_SIZE && (
                <div className='flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground'>
                    <span>
                        Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
                    </span>
                    <div className='flex items-center gap-2'>
                        <Button
                            variant='outline'
                            size='sm'
                            disabled={page === 0}
                            onClick={() => onPageChange(page - 1)}
                        >
                            Previous
                        </Button>
                        <Button
                            variant='outline'
                            size='sm'
                            disabled={(page + 1) * PAGE_SIZE >= total}
                            onClick={() => onPageChange(page + 1)}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function MessagesPage() {
    const loggedIn = useSession().status === 'authenticated';
    const trpc = useTRPC();
    const unreadCount = useUnreadMessageCount();
    const markAllRead = useMarkAllRead();
    const markRead = useMarkRead();
    const deleteMessage = useDeleteMessage();
    const deleteMessages = useDeleteMessages();

    const [selected, setSelected] = useState<{ message: MessageSummary; direction: 'inbox' | 'sent' } | null>(null);
    const [confirm, setConfirm] = useState<ConfirmTarget | null>(null);
    const [inboxPage, setInboxPage] = useState(0);
    const [sentPage, setSentPage] = useState(0);

    const inbox = useQuery({
        ...trpc.message.listInbox.queryOptions({ limit: PAGE_SIZE, offset: inboxPage * PAGE_SIZE }),
        enabled: loggedIn,
    });
    const sent = useQuery({
        ...trpc.message.listSent.queryOptions({ limit: PAGE_SIZE, offset: sentPage * PAGE_SIZE }),
        enabled: loggedIn,
    });

    const inboxMessages = inbox.data?.messages ?? [];
    const sentMessages = sent.data?.messages ?? [];
    const inboxTotal = inbox.data?.total ?? 0;
    const sentTotal = sent.data?.total ?? 0;
    const inboxHasRead = inboxMessages.some((message) => message.readAt !== null);

    useEffect(() => {
        if (inboxPage > 0 && inboxPage * PAGE_SIZE >= inboxTotal) {
            setInboxPage((page) => Math.max(page - 1, 0));
        }
    }, [inboxPage, inboxTotal]);

    useEffect(() => {
        if (sentPage > 0 && sentPage * PAGE_SIZE >= sentTotal) {
            setSentPage((page) => Math.max(page - 1, 0));
        }
    }, [sentPage, sentTotal]);

    const handleSelect = (message: MessageSummary, direction: 'inbox' | 'sent') => {
        setSelected({ message, direction });
        if (direction === 'inbox' && message.readAt === null) {
            markRead.mutate({ messageId: message.id });
        }
    };

    const handleConfirm = () => {
        if (confirm === null) {
            return;
        }
        if (confirm.kind === 'message') {
            deleteMessage.mutate(
                { messageId: confirm.messageId },
                {
                    onSuccess: () => {
                        toast.success('Message deleted');
                        setSelected(null);
                    },
                    onError: (error) => {
                        toast.error(error instanceof Error ? error.message : 'Failed to delete message');
                    },
                },
            );
        } else {
            deleteMessages.mutate(
                { direction: confirm.kind === 'inboxRead' ? 'inbox' : 'sent', onlyRead: confirm.kind === 'inboxRead' },
                {
                    onSuccess: ({ deleted }) =>
                        toast.success(deleted > 0 ? `${deleted} messages deleted` : 'Nothing to delete'),
                    onError: (error) => {
                        toast.error(error instanceof Error ? error.message : 'Failed to delete messages');
                    },
                },
            );
        }
        setConfirm(null);
    };

    return (
        <Page
            title='Messages'
            headerComponent={
                <span className='flex items-center gap-2'>
                    {unreadCount > 0 && <Badge variant='destructive'>{unreadCount} unread</Badge>}
                    <ComposeMessageDialog />
                </span>
            }
        >
            <Tabs defaultValue='inbox' className='w-full'>
                <TabsList>
                    <TabsTrigger value='inbox'>Inbox</TabsTrigger>
                    <TabsTrigger value='sent'>Sent</TabsTrigger>
                </TabsList>
                <TabsContent value='inbox' className='pt-4'>
                    <MessagePane
                        title='Inbox'
                        description={inbox.data ? `${inbox.data.total} messages` : 'Incoming messages'}
                        emptyText='No messages yet.'
                        isLoading={inbox.isLoading}
                        messages={inboxMessages}
                        direction='inbox'
                        onSelect={handleSelect}
                        page={inboxPage}
                        total={inboxTotal}
                        onPageChange={setInboxPage}
                        headerAction={
                            <div className='flex items-center gap-2'>
                                <Button
                                    variant='outline'
                                    size='sm'
                                    className='gap-2'
                                    disabled={unreadCount === 0 || markAllRead.isPending}
                                    onClick={() => markAllRead.mutate()}
                                >
                                    <CheckCheck className='h-4 w-4' />
                                    Mark all read
                                </Button>
                                <Button
                                    variant='outline'
                                    size='sm'
                                    className='gap-2'
                                    disabled={!inboxHasRead || deleteMessages.isPending}
                                    onClick={() => setConfirm({ kind: 'inboxRead' })}
                                >
                                    <Trash2 className='h-4 w-4' />
                                    Delete all read
                                </Button>
                            </div>
                        }
                    />
                </TabsContent>
                <TabsContent value='sent' className='pt-4'>
                    <MessagePane
                        title='Sent'
                        description={sent.data ? `${sent.data.total} messages` : 'Sent messages'}
                        emptyText='No sent messages yet.'
                        isLoading={sent.isLoading}
                        messages={sentMessages}
                        direction='sent'
                        onSelect={handleSelect}
                        page={sentPage}
                        total={sentTotal}
                        onPageChange={setSentPage}
                        headerAction={
                            <Button
                                variant='outline'
                                size='sm'
                                className='gap-2'
                                disabled={sentMessages.length === 0 || deleteMessages.isPending}
                                onClick={() => setConfirm({ kind: 'sentAll' })}
                            >
                                <Trash2 className='h-4 w-4' />
                                Delete all
                            </Button>
                        }
                    />
                </TabsContent>
            </Tabs>

            <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{selected?.message.subject}</DialogTitle>
                        <DialogDescription>
                            {selected
                                ? `${selected.direction === 'inbox' ? 'From' : 'To'} ${counterpartName(selected.message)}`
                                : ''}
                            {selected ? ` · ${formatTimestamp(selected.message.createdAt)}` : ''}
                        </DialogDescription>
                    </DialogHeader>
                    <p className='whitespace-pre-wrap text-sm'>{selected?.message.body}</p>
                    <DialogFooter>
                        <Button
                            variant='destructive'
                            className='gap-2'
                            disabled={deleteMessage.isPending}
                            onClick={() => selected && setConfirm({ kind: 'message', messageId: selected.message.id })}
                        >
                            <Trash2 className='h-4 w-4' />
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{confirm ? confirmCopy(confirm).title : ''}</DialogTitle>
                        <DialogDescription>{confirm ? confirmCopy(confirm).description : ''}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant='outline' onClick={() => setConfirm(null)}>
                            Cancel
                        </Button>
                        <Button
                            variant='destructive'
                            disabled={deleteMessage.isPending || deleteMessages.isPending}
                            onClick={handleConfirm}
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Page>
    );
}
