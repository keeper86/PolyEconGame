import { describe, expect, it } from 'vitest';
import {
    defaultLocale,
    explicitLocale,
    getDecimalSeparator,
    isLocale,
    isLocaleSetting,
    parseAcceptLanguage,
    resolveLocale,
} from './config';

describe('getDecimalSeparator', () => {
    it('returns a comma for German', () => {
        expect(getDecimalSeparator('de')).toBe(',');
    });

    it('returns a dot for English', () => {
        expect(getDecimalSeparator('en')).toBe('.');
    });
});

describe('isLocale', () => {
    it('accepts supported locales', () => {
        expect(isLocale('en')).toBe(true);
        expect(isLocale('de')).toBe(true);
    });

    it('rejects unsupported values', () => {
        expect(isLocale('fr')).toBe(false);
        expect(isLocale(undefined)).toBe(false);
        expect(isLocale(42)).toBe(false);
        expect(isLocale('EN')).toBe(false);
    });
});

describe('isLocaleSetting', () => {
    it('accepts the system setting and supported locales', () => {
        expect(isLocaleSetting('system')).toBe(true);
        expect(isLocaleSetting('en')).toBe(true);
        expect(isLocaleSetting('de')).toBe(true);
    });

    it('rejects anything else', () => {
        expect(isLocaleSetting('fr')).toBe(false);
        expect(isLocaleSetting(undefined)).toBe(false);
        expect(isLocaleSetting(42)).toBe(false);
    });
});

describe('explicitLocale', () => {
    it('returns the locale for a valid cookie value', () => {
        expect(explicitLocale('de')).toBe('de');
    });

    it('returns null when no explicit locale is stored', () => {
        expect(explicitLocale(undefined)).toBeNull();
        expect(explicitLocale('system')).toBeNull();
        expect(explicitLocale('fr')).toBeNull();
    });
});

describe('parseAcceptLanguage', () => {
    it('returns undefined for missing headers', () => {
        expect(parseAcceptLanguage(null)).toBeUndefined();
        expect(parseAcceptLanguage(undefined)).toBeUndefined();
        expect(parseAcceptLanguage('')).toBeUndefined();
    });

    it('picks the first supported language and ignores q-values', () => {
        expect(parseAcceptLanguage('de-DE,de;q=0.9,en;q=0.8')).toBe('de');
        expect(parseAcceptLanguage('en-US,en;q=0.9')).toBe('en');
    });

    it('skips unsupported languages', () => {
        expect(parseAcceptLanguage('fr-FR,es;q=0.9,de;q=0.8')).toBe('de');
        expect(parseAcceptLanguage('fr-FR,es;q=0.9')).toBeUndefined();
    });
});

describe('resolveLocale', () => {
    it('prefers a valid locale cookie over the accept-language header', () => {
        expect(resolveLocale('de', 'en-US,en;q=0.9')).toBe('de');
    });

    it('ignores an invalid cookie value and falls back to the header', () => {
        expect(resolveLocale('fr', 'de-DE,de;q=0.9')).toBe('de');
    });

    it('treats the system setting as no preference and follows the header', () => {
        expect(resolveLocale('system', 'de-DE,de;q=0.9')).toBe('de');
    });

    it('falls back to the default locale', () => {
        expect(resolveLocale(undefined, null)).toBe(defaultLocale);
    });
});
