'use client';

import { CompanyLogo } from '@/components/client/CompanyLogo';
import UserAvatar from '@/components/client/UserAvatar';
import type { MessageSummary } from '@/server/controller/message';

export function CounterpartAvatar({ message, size = 32 }: { message: MessageSummary; size?: number }) {
    if (message.counterpartCompanyLogo) {
        return <CompanyLogo logoKey={message.counterpartCompanyLogo} size={size} />;
    }

    return <UserAvatar userId={message.counterpartUserId} />;
}
