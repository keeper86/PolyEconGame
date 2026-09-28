import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import de from '../../messages/de.json';
import en from '../../messages/en.json';
import { useErrorMessage } from './errors';

const wrapper =
    (locale: 'en' | 'de') =>
    ({ children }: { children: ReactNode }) => (
        <NextIntlClientProvider locale={locale} timeZone='UTC' messages={locale === 'de' ? de : en}>
            {children}
        </NextIntlClientProvider>
    );

const domainError = (code: string, params: Record<string, string | number> = {}) =>
    ({ data: { domainError: { code, params } } }) as unknown as Error;

describe('useErrorMessage', () => {
    it('renders a domain error packet in English', () => {
        const { result } = renderHook(() => useErrorMessage(), { wrapper: wrapper('en') });

        expect(result.current(domainError('notOwner'))).toBe('You do not own this agent');
    });

    it('renders a domain error packet in German', () => {
        const { result } = renderHook(() => useErrorMessage(), { wrapper: wrapper('de') });

        expect(result.current(domainError('notOwner'))).toBe('Diese Firma gehört dir nicht');
    });

    it('interpolates domain error params', () => {
        const { result } = renderHook(() => useErrorMessage(), { wrapper: wrapper('de') });

        expect(result.current(domainError('unknownResource', { resourceName: 'Crude Oil' }))).toBe(
            'Unbekannte Ressource: Crude Oil',
        );
    });

    it('falls back to the message for errors without a packet', () => {
        const { result } = renderHook(() => useErrorMessage(), { wrapper: wrapper('de') });

        expect(result.current(new Error('database exploded'))).toBe('database exploded');
    });

    it('falls back to a translated default for unknown values', () => {
        const { result } = renderHook(() => useErrorMessage(), { wrapper: wrapper('de') });

        expect(result.current('nonsense')).toBe('Ein unerwarteter Fehler ist aufgetreten');
    });
});
import { screen } from '@testing-library/react';
