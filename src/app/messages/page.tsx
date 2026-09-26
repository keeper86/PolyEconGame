'use client';

import { Page } from '@/components/client/Page';
import { ComposeMessageDialog } from '@/app/messages/_components/ComposeMessageDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMarkAllRead, useMarkRead, useUnreadMessageCount } from '@/hooks/useMessages';
import { recipientLabel } from '@/lib/recipientSearch';
import { useTRPC } from '@/lib/trpc';
import type { MessageSummary } from '@/server/controller/message';
import { useQuery } from '@tanstack/react-query';
import { CheckCheck } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useState } from 'react';

const POLL_INTERVAL_MS = 5000;

const formatTimestamp = (iso: string): string => new Date(iso).toLocaleString();

const counterpartName = (message: MessageSummary): string =>
    recipientLabel({
        userId: message.counterpartUserId,
        displayName: message.counterpartDisplayName,
        username: message.counterpartUsername,
        companyName: message.counterpartCompanyName,
    });

function MessageRow({ message, unread, onSelect }: { message: MessageSummary; unread: boolean; onSelect: () => void }) {
    return (
        <button
            type='button'
            onClick={onSelect}
            className='flex w-full flex-col gap-1 border-b border-border px-3 py-3 text-left transition-colors hover:bg-muted/60'
        >
            <span className='flex items-center gap-2'>
                {unread && <span className='h-2 w-2 shrink-0 rounded-full bg-primary' />}
                <span className={unread ? 'truncate font-semibold' : 'truncate'}>{message.subject}</span>
            </span>
            <span className='flex items-center justify-between gap-2 text-xs text-muted-foreground'>
                <span className='truncate'>{counterpartName(message)}</span>
                <span className='shrink-0'>{formatTimestamp(message.createdAt)}</span>
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
}: {
    title: string;
    description: string;
    emptyText: string;
    isLoading: boolean;
    messages: MessageSummary[];
    direction: 'inbox' | 'sent';
    onSelect: (message: MessageSummary, direction: 'inbox' | 'sent') => void;
}) {
    return (
        <div className='rounded-lg border border-border'>
            <div className='flex flex-col gap-1 border-b border-border px-3 py-3'>
                <span className='font-medium'>{title}</span>
                <span className='text-xs text-muted-foreground'>{description}</span>
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
                        unread={direction === 'inbox' && message.readAt === null}
                        onSelect={() => onSelect(message, direction)}
                    />
                ))
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

    const [selected, setSelected] = useState<{ message: MessageSummary; direction: 'inbox' | 'sent' } | null>(null);

    const inbox = useQuery({
        ...trpc.message.listInbox.queryOptions({ limit: 25, offset: 0 }),
        enabled: loggedIn,
        refetchInterval: POLL_INTERVAL_MS,
    });
    const sent = useQuery({
        ...trpc.message.listSent.queryOptions({ limit: 25, offset: 0 }),
        enabled: loggedIn,
        refetchInterval: POLL_INTERVAL_MS,
    });

    const handleSelect = (message: MessageSummary, direction: 'inbox' | 'sent') => {
        setSelected({ message, direction });
        if (direction === 'inbox' && message.readAt === null) {
            markRead.mutate({ messageId: message.id });
        }
    };

    return (
        <Page
            title='Messages'
            headerComponent={
                <span className='flex items-center gap-2'>
                    {unreadCount > 0 && <Badge variant='destructive'>{unreadCount} unread</Badge>}
                    <Button
                        variant='outline'
                        className='gap-2'
                        disabled={unreadCount === 0 || markAllRead.isPending}
                        onClick={() => markAllRead.mutate()}
                    >
                        <CheckCheck className='h-4 w-4' />
                        Mark all read
                    </Button>
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
                        messages={inbox.data?.messages ?? []}
                        direction='inbox'
                        onSelect={handleSelect}
                    />
                </TabsContent>
                <TabsContent value='sent' className='pt-4'>
                    <MessagePane
                        title='Sent'
                        description={sent.data ? `${sent.data.total} messages` : 'Sent messages'}
                        emptyText='No sent messages yet.'
                        isLoading={sent.isLoading}
                        messages={sent.data?.messages ?? []}
                        direction='sent'
                        onSelect={handleSelect}
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
                </DialogContent>
            </Dialog>
        </Page>
    );
}
