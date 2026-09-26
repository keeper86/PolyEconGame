import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const recipients = [
    { userId: 'alice-1', displayName: 'Alice Anderson', username: 'aa-dev', companyName: 'AnderTech' },
    { userId: 'bob-2', displayName: null, username: 'bobby', companyName: null },
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

describe('RecipientPicker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseQuery.mockReturnValue({ data: { recipients }, isFetching: false });
    });

    it('shows the chosen recipient name in the field when closed', () => {
        render(<RecipientPicker value={recipients[0]} onChange={vi.fn()} />);

        expect(screen.getByRole('textbox')).toHaveValue('Alice Anderson (AnderTech)');
    });

    it('falls back to the user name when the recipient has no display name', () => {
        render(<RecipientPicker value={recipients[1]} onChange={vi.fn()} />);

        expect(screen.getByRole('textbox')).toHaveValue('bobby');
    });

    it('does not show the list until the field is focused', async () => {
        render(<RecipientPicker value={null} onChange={vi.fn()} />);

        expect(screen.queryByText('Alice Anderson (AnderTech)')).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('textbox'));

        expect(screen.getByText('Alice Anderson (AnderTech)')).toBeInTheDocument();
    });

    it('updates the field while typing', async () => {
        render(<RecipientPicker value={null} onChange={vi.fn()} />);

        const input = screen.getByRole('textbox');
        await userEvent.click(input);
        await userEvent.type(input, 'ali');

        expect(input).toHaveValue('ali');
    });

    it('calls onChange with the picked recipient', async () => {
        const onChange = vi.fn();
        render(<RecipientPicker value={null} onChange={onChange} />);

        await userEvent.click(screen.getByRole('textbox'));
        await userEvent.click(screen.getByText('bobby'));

        expect(onChange).toHaveBeenCalledWith(recipients[1]);
    });

    it('clears the recipient', async () => {
        const onChange = vi.fn();
        render(<RecipientPicker value={recipients[0]} onChange={onChange} />);

        await userEvent.click(screen.getByRole('button', { name: 'Clear recipient' }));

        expect(onChange).toHaveBeenCalledWith(null);
    });

    it('shows an empty state when there are no recipients', async () => {
        mockUseQuery.mockReturnValue({ data: { recipients: [] }, isFetching: false });
        render(<RecipientPicker value={null} onChange={vi.fn()} />);

        await userEvent.click(screen.getByRole('textbox'));

        expect(screen.getByText('No player found.')).toBeInTheDocument();
    });
});
