import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from 'tests/vitest/renderWithIntl';

const setLocale = vi.fn();
const toggleFullscreen = vi.fn();

vi.mock('@/i18n/actions', () => ({
    setLocale: (locale: string) => setLocale(locale),
}));

vi.mock('@/hooks/useFullscreen', () => ({
    useFullscreen: () => ({ isFullscreen: false, toggleFullscreen }),
}));

import { SettingsMenu } from './SettingsMenu';

const openMenu = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
};

const languageSystemItem = () => screen.getAllByRole('menuitem', { name: 'System' }).at(-1) as HTMLElement;

const isChecked = (item: HTMLElement) => item.querySelector('.lucide-check') !== null;

describe('SettingsMenu', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('marks the system language when no explicit locale is stored', async () => {
        renderWithIntl(<SettingsMenu explicitLocale={null} />);
        await openMenu();

        expect(isChecked(languageSystemItem())).toBe(true);
        expect(isChecked(screen.getByRole('menuitem', { name: 'German' }))).toBe(false);
    });

    it('marks the explicit locale instead of system', async () => {
        renderWithIntl(<SettingsMenu explicitLocale='de' />);
        await openMenu();

        expect(isChecked(screen.getByRole('menuitem', { name: 'German' }))).toBe(true);
        expect(isChecked(languageSystemItem())).toBe(false);
    });

    it('clears the preference when system is selected', async () => {
        renderWithIntl(<SettingsMenu explicitLocale='de' />);
        await openMenu();

        await userEvent.click(languageSystemItem());

        expect(setLocale).toHaveBeenCalledWith('system');
    });

    it('stores the picked locale', async () => {
        renderWithIntl(<SettingsMenu explicitLocale={null} />);
        await openMenu();

        await userEvent.click(screen.getByRole('menuitem', { name: 'German' }));

        expect(setLocale).toHaveBeenCalledWith('de');
    });

    it('toggles fullscreen from the menu', async () => {
        renderWithIntl(<SettingsMenu explicitLocale={null} />);
        await openMenu();

        await userEvent.click(screen.getByRole('menuitem', { name: 'Enter fullscreen' }));

        expect(toggleFullscreen).toHaveBeenCalled();
    });
});
