import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { createTranslator } from 'next-intl';
import de from './messages/de.json';
import en from './messages/en.json';
import { DOMAIN_ERROR_CODES } from '@/server/domainError';
import { tickerEventText } from '@/i18n/tickerEventMessage';

const flatten = (value: unknown, prefix = ''): Record<string, string> => {
    if (typeof value === 'string') {
        return { [prefix]: value };
    }
    if (typeof value === 'object' && value !== null) {
        return Object.entries(value).reduce<Record<string, string>>(
            (acc, [key, child]) => ({ ...acc, ...flatten(child, prefix ? `${prefix}.${key}` : key) }),
            {},
        );
    }
    return {};
};

const placeholders = (value: string): string[] =>
    [...new Set([...value.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*[,}]/g)].map((match) => match[1]))].sort();

const tags = (value: string): string[] =>
    [...new Set([...value.matchAll(/<\s*([a-zA-Z0-9_]+)\s*>/g)].map((match) => match[1]))].sort();

describe('message catalogs', () => {
    it('keeps every locale in sync with the default locale', () => {
        const expected = Object.keys(flatten(en)).sort();
        expect(Object.keys(flatten(de)).sort()).toEqual(expected);
    });

    it('has no empty translations', () => {
        const empty = Object.entries(flatten(de))
            .filter(([, value]) => value.trim() === '')
            .map(([key]) => key);
        expect(empty).toEqual([]);
    });

    it('translates every domain error code', () => {
        const englishErrors = en.Errors as Record<string, string | undefined>;
        const germanErrors = de.Errors as Record<string, string | undefined>;
        const missing = DOMAIN_ERROR_CODES.filter(
            (code) => typeof englishErrors[code] !== 'string' || typeof germanErrors[code] !== 'string',
        );

        expect(missing).toEqual([]);
    });

    it('keeps interpolation arguments in sync across locales', () => {
        const english = flatten(en);
        const german = flatten(de);
        const mismatches = Object.keys(english).filter(
            (key) => JSON.stringify(placeholders(english[key])) !== JSON.stringify(placeholders(german[key] ?? '')),
        );

        expect(mismatches).toEqual([]);
    });

    it('keeps rich text tags in sync across locales', () => {
        const english = flatten(en);
        const german = flatten(de);
        const mismatches = Object.keys(english).filter(
            (key) => JSON.stringify(tags(english[key])) !== JSON.stringify(tags(german[key] ?? '')),
        );

        expect(mismatches).toEqual([]);
    });

    it('interpolates every placeholder instead of printing it literally', () => {
        const offenders: string[] = [];
        for (const [locale, catalog] of [
            ['en', en],
            ['de', de],
        ] as const) {
            const translate = createTranslator({ locale, messages: catalog }) as unknown as {
                rich(key: string, values: Record<string, number | ((chunks: ReactNode) => ReactNode)>): ReactNode;
            };
            for (const [key, value] of Object.entries(flatten(catalog))) {
                const names = placeholders(value);
                if (names.length === 0) {
                    continue;
                }
                const rendered = tickerEventText(
                    translate.rich(key, {
                        ...Object.fromEntries(names.map((name) => [name, 7])),
                        ...Object.fromEntries(tags(value).map((tag) => [tag, (chunks: ReactNode) => chunks])),
                    }),
                );
                if (names.some((name) => rendered.includes(`{${name}}`))) {
                    offenders.push(`${locale}:${key}`);
                }
            }
        }

        expect(offenders).toEqual([]);
    });
});
