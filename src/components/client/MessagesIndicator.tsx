'use client';

import { Badge } from '@/components/ui/badge';
import { useMessageCountPolling, useUnreadMessageCount } from '@/hooks/useMessages';
import { APP_ROUTES } from '@/lib/appRoutes';
import { Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

export function MessagesIndicator() {
    const loggedIn = useSession().status === 'authenticated';
    const unreadCount = useUnreadMessageCount();
    useMessageCountPolling();
    const t = useTranslations('Nav');

    if (!loggedIn) {
        return null;
    }

    return (
        <Link
            href={APP_ROUTES.messages.path}
            aria-label={t('Messages')}
            className='relative flex items-center rounded-md p-1 hover:bg-muted'
        >
            <Mail className='h-5 w-5 text-muted-foreground' />
            {unreadCount > 0 && (
                <Badge
                    variant='destructive'
                    className='absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none'
                >
                    {unreadCount > 99 ? '99+' : unreadCount}
                </Badge>
            )}
        </Link>
    );
}
