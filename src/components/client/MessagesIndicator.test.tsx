import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
    status: { current: 'authenticated' as 'authenticated' | 'unauthenticated' },
    unread: { current: 0 },
}));

vi.mock('next-auth/react', () => ({
    useSession: () => ({ status: h.status.current }),
}));

vi.mock('@/hooks/useMessages', () => ({
    useUnreadMessageCount: () => h.unread.current,
    useMessageCountPolling: () => undefined,
}));

import { MessagesIndicator } from './MessagesIndicator';

describe('MessagesIndicator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        h.status.current = 'authenticated';
        h.unread.current = 0;
    });

    it('renders nothing when logged out', () => {
        h.status.current = 'unauthenticated';

        const { container } = render(<MessagesIndicator />);

        expect(container).toBeEmptyDOMElement();
    });

    it('links to the messages page', () => {
        render(<MessagesIndicator />);

        expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute('href', '/messages');
    });

    it('hides the badge when there are no unread messages', () => {
        render(<MessagesIndicator />);

        expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('shows the number of unread messages', () => {
        h.unread.current = 3;

        render(<MessagesIndicator />);

        expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('clamps the badge to 99+', () => {
        h.unread.current = 250;

        render(<MessagesIndicator />);

        expect(screen.getByText('99+')).toBeInTheDocument();
    });
});
