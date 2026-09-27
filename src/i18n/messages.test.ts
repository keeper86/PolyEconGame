import { describe, expect, it } from 'vitest';
import de from '../../messages/de.json';
import en from '../../messages/en.json';

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
});
