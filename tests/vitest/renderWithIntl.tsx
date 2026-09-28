import { render, type RenderOptions } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import de from '../../messages/de.json';
import en from '../../messages/en.json';
import { defaultLocale, type Locale } from '@/i18n/config';
import { formats } from '@/i18n/formats';

const catalogs = { en, de } as const;

export function renderWithIntl(
    ui: ReactElement,
    { locale = defaultLocale, ...options }: { locale?: Locale } & Omit<RenderOptions, 'wrapper'> = {},
) {
    return render(ui, {
        wrapper: ({ children }: { children: ReactNode }) => (
            <NextIntlClientProvider locale={locale} timeZone='UTC' messages={catalogs[locale]} formats={formats}>
                {children}
            </NextIntlClientProvider>
        ),
        ...options,
    });
}
