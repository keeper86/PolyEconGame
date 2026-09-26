import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MessageSummary } from '@/server/controller/message';

vi.mock('@/components/client/CompanyLogo', () => ({
    CompanyLogo: ({ logoKey }: { logoKey: string }) => <div data-testid='company-logo'>{logoKey}</div>,
}));

vi.mock('@/components/client/UserAvatar', () => ({
    default: ({ userId }: { userId?: string }) => <div data-testid='user-avatar'>{userId}</div>,
}));

import { CounterpartAvatar } from './CounterpartAvatar';

const message = (overrides: Partial<MessageSummary>): MessageSummary => ({
    id: 'm1',
    subject: 'Hello',
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

describe('CounterpartAvatar', () => {
    it('shows the company logo when the counterpart has a company', () => {
        render(<CounterpartAvatar message={message({ counterpartCompanyLogo: 'ai_company' })} />);

        expect(screen.getByTestId('company-logo')).toHaveTextContent('ai_company');
        expect(screen.queryByTestId('user-avatar')).not.toBeInTheDocument();
    });

    it('falls back to the user avatar when there is no company logo', () => {
        render(<CounterpartAvatar message={message({})} />);

        expect(screen.getByTestId('user-avatar')).toHaveTextContent('user-2');
        expect(screen.queryByTestId('company-logo')).not.toBeInTheDocument();
    });
});
