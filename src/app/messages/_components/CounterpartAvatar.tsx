'use client';

import { CompanyLogo } from '@/components/client/CompanyLogo';
import UserAvatar from '@/components/client/UserAvatar';
import type { MessageSummary } from '@/server/controller/message';

export function CounterpartAvatar({ message }: { message: MessageSummary }) {
    if (message.counterpartCompanyLogo) {
        return <CompanyLogo logoKey={message.counterpartCompanyLogo} />;
    }

    return <UserAvatar userId={message.counterpartUserId} />;
}
