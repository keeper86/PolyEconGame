import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from 'tests/vitest/renderWithIntl';
import type { TickerEventCategory } from '@/lib/tickerEventCategories';

const setCategories = vi.fn();
const setHideAutomated = vi.fn();
const setLocalPlanetOnly = vi.fn();
const setShowHrCompletion = vi.fn();

vi.mock('@/hooks/uiPreferences', () => ({
    useEventCategoriesPreference: () => [['agentCreated'], setCategories],
    useEventsHideAutomatedPreference: () => [false, setHideAutomated],
    useEventsLocalPlanetOnlyPreference: () => [true, setLocalPlanetOnly],
    useEventsShowHrCompletionPreference: () => [true, setShowHrCompletion],
}));

import { EventFilterMenu } from './EventFilterMenu';

const openMenu = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Event filter' }));
};

describe('EventFilterMenu', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('toggles a category on', async () => {
        renderWithIntl(<EventFilterMenu planetId='p1' />);
        await openMenu();

        await userEvent.click(screen.getByRole('menuitem', { name: 'Ship arrived' }));

        const updater = setCategories.mock.calls[0][0] as (prev: TickerEventCategory[]) => TickerEventCategory[];
        expect(updater(['shipCompleted'])).toEqual(['shipCompleted', 'shipArrived']);
    });

    it('toggles a category off', async () => {
        renderWithIntl(<EventFilterMenu planetId='p1' />);
        await openMenu();

        await userEvent.click(screen.getByRole('menuitem', { name: 'Company founded' }));

        const updater = setCategories.mock.calls[0][0] as (prev: TickerEventCategory[]) => TickerEventCategory[];
        expect(updater(['agentCreated', 'shipArrived'])).toEqual(['shipArrived']);
    });

    it('toggles the automated filter', async () => {
        renderWithIntl(<EventFilterMenu planetId='p1' />);
        await openMenu();

        await userEvent.click(screen.getByRole('menuitem', { name: 'Hide automated companies' }));

        expect(setHideAutomated).toHaveBeenCalledWith(true);
    });

    it('toggles the local planet scope', async () => {
        renderWithIntl(<EventFilterMenu planetId='p1' />);
        await openMenu();

        await userEvent.click(screen.getByRole('menuitem', { name: 'Only this planet' }));

        expect(setLocalPlanetOnly).toHaveBeenCalledWith(false);
    });

    it('disables the local planet scope without a planet in the URL', async () => {
        renderWithIntl(<EventFilterMenu />);
        await openMenu();

        expect(screen.getByRole('menuitem', { name: 'Only this planet' })).toHaveAttribute('aria-disabled', 'true');
    });

    it('toggles the HR completion filter', async () => {
        renderWithIntl(<EventFilterMenu planetId='p1' />);
        await openMenu();

        await userEvent.click(screen.getByRole('menuitem', { name: 'Show HR Department completion' }));

        expect(setShowHrCompletion).toHaveBeenCalledWith(false);
    });
});
