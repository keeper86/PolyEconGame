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
    useMessageBody,
    useMessageListPolling,
    useUnreadMessageCount,
} from '@/hooks/useMessages';
import { recipientLabel } from '@/app/messages/_components/recipientLabel';
import { useTRPC } from '@/lib/trpc';
import type { MessageSummary } from '@/server/controller/message';
import { useQuery } from '@tanstack/react-query';
import { CheckCheck, Trash2 } from 'lucide-react';
import { useErrorMessage } from '@/i18n/errors';
import { useFormatter, useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

const PAGE_SIZE = 25;

type MessagesTranslator = ReturnType<typeof useTranslations<'Messages'>>;

const counterpartName = (message: MessageSummary): string =>
    recipientLabel({
        userId: message.counterpartUserId,
        displayName: message.counterpartDisplayName,
        username: message.counterpartUsername,
        companyName: message.counterpartCompanyName,
    });

const sentMessageStatus = (message: MessageSummary, t: MessagesTranslator): { label: string; className: string } => {
    if (message.counterpartDeleted) {
        return { label: t('status.deleted'), className: 'shrink-0' };
    }
    if (message.readAt) {
        return { label: t('status.read'), className: 'shrink-0' };
    }
    return { label: t('status.unread'), className: 'shrink-0 font-medium text-primary' };
};

type ConfirmTarget = { kind: 'message'; messageId: string } | { kind: 'inboxRead' } | { kind: 'sentAll' };

const confirmCopy = (confirm: ConfirmTarget, t: MessagesTranslator): { title: string; description: string } => {
    switch (confirm.kind) {
        case 'message':
            return {
                title: t('confirm.messageTitle'),
                description: t('confirm.messageDescription'),
            };
        case 'inboxRead':
            return {
                title: t('confirm.readTitle'),
                description: t('confirm.readDescription'),
            };
        case 'sentAll':
            return {
                title: t('confirm.sentTitle'),
                description: t('confirm.sentDescription'),
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
    const format = useFormatter();
    const t = useTranslations('Messages');
    const unread = direction === 'inbox' && message.readAt === null;
    const status = sentMessageStatus(message, t);

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
                    <span className='shrink-0'>{format.dateTime(new Date(message.createdAt), 'timestamp')}</span>
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
    const t = useTranslations('Messages');
    const tc = useTranslations('Common');
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
                <div className='px-3 py-6 text-sm text-muted-foreground'>{tc('loading')}</div>
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
                    <span>{t('page', { page: page + 1, total: Math.max(1, Math.ceil(total / PAGE_SIZE)) })}</span>
                    <div className='flex items-center gap-2'>
                        <Button
                            variant='outline'
                            size='sm'
                            disabled={page === 0}
                            onClick={() => onPageChange(page - 1)}
                        >
                            {tc('previous')}
                        </Button>
                        <Button
                            variant='outline'
                            size='sm'
                            disabled={(page + 1) * PAGE_SIZE >= total}
                            onClick={() => onPageChange(page + 1)}
                        >
                            {tc('next')}
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
    const format = useFormatter();
    const t = useTranslations('Toasts');
    const tMsg = useTranslations('Messages');
    const tc = useTranslations('Common');
    const showError = useErrorMessage();
    const unreadCount = useUnreadMessageCount();
    const markAllRead = useMarkAllRead();
    const markRead = useMarkRead();
    const deleteMessage = useDeleteMessage();
    const deleteMessages = useDeleteMessages();
    useMessageListPolling();

    const [selected, setSelected] = useState<{ message: MessageSummary; direction: 'inbox' | 'sent' } | null>(null);
    const [confirm, setConfirm] = useState<ConfirmTarget | null>(null);
    const [inboxPage, setInboxPage] = useState(0);
    const [sentPage, setSentPage] = useState(0);

    const selectedBody = useMessageBody(selected?.message.id ?? null);

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
            markRead.mutate(
                { messageId: message.id },
                {
                    onError: (error) => {
                        toast.error(error instanceof Error ? showError(error) : t('messageMarkReadFailed'));
                    },
                },
            );
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
                        toast.success(t('messageDeleted'));
                        setSelected(null);
                    },
                    onError: (error) => {
                        toast.error(error instanceof Error ? showError(error) : t('messageDeleteFailed'));
                    },
                },
            );
        } else {
            deleteMessages.mutate(
                { direction: confirm.kind === 'inboxRead' ? 'inbox' : 'sent', onlyRead: confirm.kind === 'inboxRead' },
                {
                    onSuccess: ({ deleted }) =>
                        toast.success(deleted > 0 ? t('messagesDeleted', { count: deleted }) : t('nothingToDelete')),
                    onError: (error) => {
                        toast.error(error instanceof Error ? showError(error) : t('messagesDeleteFailed'));
                    },
                },
            );
        }
        setConfirm(null);
    };

    return (
        <Page
            title={tMsg('title')}
            headerComponent={
                <span className='flex items-center gap-2'>
                    {unreadCount > 0 && <Badge variant='destructive'>{tMsg('unread', { count: unreadCount })}</Badge>}
                    <ComposeMessageDialog />
                </span>
            }
        >
            <Tabs defaultValue='inbox' className='w-full'>
                <TabsList>
                    <TabsTrigger value='inbox'>{tMsg('tabs.inbox')}</TabsTrigger>
                    <TabsTrigger value='sent'>{tMsg('tabs.sent')}</TabsTrigger>
                </TabsList>
                <TabsContent value='inbox' className='pt-4'>
                    <MessagePane
                        title={tMsg('tabs.inbox')}
                        description={
                            inbox.data ? tMsg('inbox.description', { count: inbox.data.total }) : tMsg('inbox.fallback')
                        }
                        emptyText={tMsg('inbox.empty')}
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
                                    {tMsg('markAllRead')}
                                </Button>
                                <Button
                                    variant='outline'
                                    size='sm'
                                    className='gap-2'
                                    disabled={!inboxHasRead || deleteMessages.isPending}
                                    onClick={() => setConfirm({ kind: 'inboxRead' })}
                                >
                                    <Trash2 className='h-4 w-4' />
                                    {tMsg('deleteAllRead')}
                                </Button>
                            </div>
                        }
                    />
                </TabsContent>
                <TabsContent value='sent' className='pt-4'>
                    <MessagePane
                        title={tMsg('tabs.sent')}
                        description={
                            sent.data ? tMsg('sent.description', { count: sent.data.total }) : tMsg('sent.fallback')
                        }
                        emptyText={tMsg('sent.empty')}
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
                                {tMsg('deleteAll')}
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
                                ? `${selected.direction === 'inbox' ? tMsg('from') : tMsg('to')} ${counterpartName(selected.message)}`
                                : ''}
                            {selected ? ` · ${format.dateTime(new Date(selected.message.createdAt), 'timestamp')}` : ''}
                        </DialogDescription>
                    </DialogHeader>
                    <p className='whitespace-pre-wrap text-sm'>{selectedBody ?? tc('loading')}</p>
                    <DialogFooter>
                        <Button
                            variant='destructive'
                            className='gap-2'
                            disabled={deleteMessage.isPending}
                            onClick={() => selected && setConfirm({ kind: 'message', messageId: selected.message.id })}
                        >
                            <Trash2 className='h-4 w-4' />
                            {tMsg('delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{confirm ? confirmCopy(confirm, tMsg).title : ''}</DialogTitle>
                        <DialogDescription>{confirm ? confirmCopy(confirm, tMsg).description : ''}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant='outline' onClick={() => setConfirm(null)}>
                            {tc('cancel')}
                        </Button>
                        <Button
                            variant='destructive'
                            disabled={deleteMessage.isPending || deleteMessages.isPending}
                            onClick={handleConfirm}
                        >
                            {tMsg('delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Page>
    );
}
