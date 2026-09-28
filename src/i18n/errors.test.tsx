import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import de from '../../messages/de.json';
import en from '../../messages/en.json';
import { DOMAIN_ERROR_CODES } from '@/server/domainError';
import { useErrorMessage } from './errors';

const wrapper = (locale: 'en' | 'de') => {
    function Wrapper({ children }: { children: ReactNode }) {
        return (
            <NextIntlClientProvider locale={locale} timeZone='UTC' messages={locale === 'de' ? de : en}>
                {children}
            </NextIntlClientProvider>
        );
    }
    return Wrapper;
};

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

    it('renders the newly registered domain errors', () => {
        const { result } = renderHook(() => useErrorMessage(), { wrapper: wrapper('de') });

        expect(result.current(domainError('messageNotFound'))).toBe('Nachricht nicht gefunden');
        expect(result.current(domainError('agentHasNoAssets'))).toBe(
            'Das Unternehmen hat keine Anlagen auf diesem Planeten',
        );
    });

    it('has a message key for every domain error code', () => {
        const missingEn = DOMAIN_ERROR_CODES.filter((code) => !(code in en.Errors));
        const missingDe = DOMAIN_ERROR_CODES.filter((code) => !(code in de.Errors));

        expect({ missingEn, missingDe }).toEqual({ missingEn: [], missingDe: [] });
    });
});
