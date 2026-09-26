import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const recipients = [
    { userId: 'alice-1', displayName: 'Alice Anderson', companyName: 'AnderTech' },
    { userId: 'bob-2', displayName: 'Bob Brown', companyName: null },
];

const mockQueryOptions = vi.fn((input: unknown) => ({
    queryKey: ['message', 'listRecipients', input],
    queryFn: vi.fn(),
}));

const mockUseQuery = vi.fn(() => ({ data: { recipients }, isFetching: false }));

vi.mock('@tanstack/react-query', async (importOriginal) => {
    const original = (await importOriginal()) as typeof import('@tanstack/react-query');
    return {
        ...original,
        useQuery: (...args: unknown[]) => mockUseQuery(...(args as [])),
    };
});

vi.mock('@/lib/trpc', () => ({
    useTRPC: () => ({
        message: {
            listRecipients: {
                queryOptions: mockQueryOptions,
            },
        },
    }),
}));

import { RecipientPicker } from './RecipientPicker';

global.ResizeObserver = vi.fn(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
})) as unknown as typeof ResizeObserver;

Element.prototype.scrollIntoView = vi.fn();

describe('RecipientPicker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseQuery.mockReturnValue({ data: { recipients }, isFetching: false });
    });

    it('accepts keyboard input in the search field', async () => {
        render(<RecipientPicker value={null} onChange={vi.fn()} />);

        const input = screen.getByPlaceholderText('Search by name, company or id…');
        await userEvent.type(input, 'alice');

        expect(input).toHaveValue('alice');
    });

    it('renders a result for each recipient', () => {
        render(<RecipientPicker value={null} onChange={vi.fn()} />);

        expect(screen.getByText('Alice Anderson (AnderTech)')).toBeInTheDocument();
        expect(screen.getByText('Bob Brown')).toBeInTheDocument();
    });

    it('calls onChange with the picked recipient', async () => {
        const onChange = vi.fn();
        render(<RecipientPicker value={null} onChange={onChange} />);

        await userEvent.click(screen.getByText('Bob Brown'));

        expect(onChange).toHaveBeenCalledWith({ userId: 'bob-2', displayName: 'Bob Brown', companyName: null });
    });

    it('shows an empty state when there are no recipients', () => {
        mockUseQuery.mockReturnValue({ data: { recipients: [] }, isFetching: false });
        render(<RecipientPicker value={null} onChange={vi.fn()} />);

        expect(screen.getByText('No player found.')).toBeInTheDocument();
    });
});
