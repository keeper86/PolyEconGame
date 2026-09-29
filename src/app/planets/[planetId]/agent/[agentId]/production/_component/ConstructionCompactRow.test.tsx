import { screen } from '@testing-library/react';
import { renderWithIntl } from 'tests/vitest/renderWithIntl';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { MINIMUM_CONSTRUCTION_TIME_IN_TICKS } from '@/simulation/planet/facility';
import { makeProductionFacility } from '@/simulation/utils/testHelper';

const mutate = vi.fn();
let mutationPending = false;

vi.mock('next/navigation', () => ({
    useParams: () => ({ planetId: 'p', agentId: 'a' }),
}));

vi.mock('@/lib/trpc', () => ({
    useTRPC: () => ({
        cancelConstruction: { mutationOptions: vi.fn(() => ({})) },
        setConstructionSuspended: { mutationOptions: vi.fn(() => ({})) },
    }),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
    const original = (await importOriginal()) as typeof import('@tanstack/react-query');
    return {
        ...original,
        useMutation: vi.fn(() => ({ mutate, isPending: mutationPending, error: null })),
    };
});

vi.mock('@/hooks/useActionOverlay', () => ({
    useAddPendingAction: () => vi.fn(),
}));

vi.mock('@/hooks/useSimulationQuery', () => ({
    useSimulationTick: () => 100,
}));

vi.mock('@/hooks/useMobile', () => ({
    useIsSmallScreen: () => false,
}));

vi.mock('@/components/client/GameConfigContext', () => ({
    useGameConfig: () => ({ tickIntervalMs: 1000 }),
}));

vi.mock('@/components/client/ProductQuantity', () => ({
    ProductQuantity: () => <span data-testid='product-quantity' />,
}));

vi.mock('@/components/client/TickDisplay', () => ({
    mapTickToDate: () => 'some-date',
}));

import { ConstructionCompactRow } from './ConstructionCompactRow';

function makeFacility(suspended: boolean) {
    const facility = makeProductionFacility();
    facility.construction = {
        type: 'expansion',
        constructionTargetMaxScale: 2,
        totalConstructionServiceRequired: MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
        maximumConstructionServiceConsumption: 1,
        progress: 0,
        lastTickInvestedConstructionServices: 0,
        suspended,
    };
    return facility;
}

describe('ConstructionCompactRow suspension', () => {
    beforeEach(() => {
        mutate.mockReset();
        mutationPending = false;
    });

    it('renders Suspend and Cancel for an active construction', () => {
        renderWithIntl(<ConstructionCompactRow facility={makeFacility(false)} />);

        expect(screen.getByRole('button', { name: /suspend/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('requests a suspension when Suspend is clicked', async () => {
        const user = userEvent.setup();
        const facility = makeFacility(false);
        renderWithIntl(<ConstructionCompactRow facility={facility} />);

        await user.click(screen.getByRole('button', { name: /suspend/i }));

        expect(mutate).toHaveBeenCalledWith({
            agentId: 'a',
            planetId: 'p',
            facilityId: facility.id,
            suspended: true,
        });
    });

    it('shows Resume and the Suspended badge when suspended', () => {
        renderWithIntl(<ConstructionCompactRow facility={makeFacility(true)} />);

        expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
        expect(screen.getByText('Suspended')).toBeInTheDocument();
    });

    it('keeps the Suspend button when hideCancel is set', () => {
        renderWithIntl(<ConstructionCompactRow facility={makeFacility(false)} hideCancel />);

        expect(screen.getByRole('button', { name: /suspend/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    });

    it('disables the Suspend button while a suspension is pending', () => {
        renderWithIntl(<ConstructionCompactRow facility={makeFacility(false)} isPendingSuspension />);

        expect(screen.getByRole('button', { name: /suspending/i })).toBeDisabled();
    });

    it('disables the Suspend button while a cancellation is pending', () => {
        renderWithIntl(<ConstructionCompactRow facility={makeFacility(false)} isPendingCancel />);

        expect(screen.getByRole('button', { name: /suspend/i })).toBeDisabled();
    });

    it('disables the Suspend button while the mutation is in flight', () => {
        mutationPending = true;
        renderWithIntl(<ConstructionCompactRow facility={makeFacility(false)} />);

        expect(screen.getByRole('button', { name: /suspending/i })).toBeDisabled();
    });
});
