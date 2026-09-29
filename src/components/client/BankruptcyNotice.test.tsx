import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from 'tests/vitest/renderWithIntl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BankruptcyNotice } from './BankruptcyNotice';

const mockMutate = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: mockReplace, push: mockReplace }),
}));

vi.mock('next-auth/react', () => ({
    useSession: () => ({ data: { user: { agentId: 'gone-co' } }, update: vi.fn(), status: 'authenticated' }),
}));

vi.mock('@/lib/trpc', () => ({
    useTRPC: () => ({
        simulation: { getMyBankruptcy: { queryOptions: vi.fn(() => ['simulation', 'getMyBankruptcy']) } },
        acknowledgeBankruptcy: { mutationOptions: vi.fn() },
        getUser: { queryFilter: vi.fn(() => ['getUser']) },
    }),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
    const original = (await importOriginal()) as typeof import('@tanstack/react-query');
    return {
        ...original,
        useMutation: vi.fn(() => ({ mutate: mockMutate, isPending: false })),
        useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
    };
});

vi.mock('@/hooks/useSimulationQuery', () => ({
    useSimulationQuery: vi.fn(),
}));

import { useSimulationQuery } from '@/hooks/useSimulationQuery';

describe('BankruptcyNotice', () => {
    beforeEach(() => {
        mockMutate.mockReset();
        mockReplace.mockReset();
    });

    it('renders the bankruptcy notice with company details', () => {
        (useSimulationQuery as ReturnType<typeof vi.fn>).mockReturnValue({
            data: {
                bankruptcy: {
                    agentId: 'gone-co',
                    agentName: 'Gone Co',
                    planetId: 'p',
                    planetName: 'Test Planet',
                    tick: 30,
                    outcome: 'restructured',
                    successorAgentName: 'Gone Co ♻1',
                },
            },
            isLoading: false,
        });

        renderWithIntl(<BankruptcyNotice />);

        expect(screen.getByText('You are bankrupt')).toBeDefined();
        expect(screen.getByText('Gone Co')).toBeDefined();
        expect(screen.getByText('Found a new company')).toBeDefined();
    });

    it('acknowledges the bankruptcy when the button is clicked', async () => {
        (useSimulationQuery as ReturnType<typeof vi.fn>).mockReturnValue({
            data: {
                bankruptcy: {
                    agentId: 'gone-co',
                    agentName: 'Gone Co',
                    planetId: 'p',
                    planetName: 'Test Planet',
                    tick: 30,
                    outcome: 'liquidated',
                },
            },
            isLoading: false,
        });

        const user = userEvent.setup();
        renderWithIntl(<BankruptcyNotice />);

        await user.click(screen.getByText('Found a new company'));

        expect(mockMutate).toHaveBeenCalled();
    });

    it('shows a loading state while the bankruptcy record is unknown', () => {
        (useSimulationQuery as ReturnType<typeof vi.fn>).mockReturnValue({
            data: { bankruptcy: null },
            isLoading: false,
        });

        renderWithIntl(<BankruptcyNotice />);

        expect(screen.getByText('You are bankrupt')).toBeDefined();
        expect(screen.getByRole('status')).toBeDefined();
    });
});
