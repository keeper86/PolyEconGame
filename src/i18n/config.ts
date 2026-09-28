export const locales = ['en', 'de'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const LOCALE_COOKIE = 'locale';

export const isLocale = (value: unknown): value is Locale =>
    typeof value === 'string' && (locales as readonly string[]).includes(value);

const matchLocale = (tag: string): Locale | undefined => {
    const normalized = tag.trim().toLowerCase();
    return locales.find((locale) => normalized === locale || normalized.startsWith(`${locale}-`));
};

export const parseAcceptLanguage = (header: string | null | undefined): Locale | undefined => {
    if (!header) {
        return undefined;
    }
    for (const part of header.split(',')) {
        const tag = part.split(';')[0];
        if (!tag) {
            continue;
        }
        const match = matchLocale(tag);
        if (match) {
            return match;
        }
    }
    return undefined;
};

export const resolveLocale = (cookieValue: unknown, acceptLanguage: string | null | undefined): Locale => {
    if (isLocale(cookieValue)) {
        return cookieValue;
    }
    return parseAcceptLanguage(acceptLanguage) ?? defaultLocale;
};

export const getDecimalSeparator = (locale: Locale): string =>
    new Intl.NumberFormat(locale).format(1.5).replace(/\d/g, '');
