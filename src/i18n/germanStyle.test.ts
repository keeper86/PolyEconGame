import { describe, expect, it } from 'vitest';
import de from './messages/de.json';

const flatten = (value: unknown, prefix = ''): Record<string, string> => {
    if (typeof value === 'string') {
        return { [prefix]: value };
    }
    if (Array.isArray(value)) {
        return value.reduce<Record<string, string>>(
            (acc, child, index) => ({ ...acc, ...flatten(child, `${prefix}[${index}]`) }),
            {},
        );
    }
    if (typeof value === 'object' && value !== null) {
        return Object.entries(value).reduce<Record<string, string>>(
            (acc, [key, child]) => ({ ...acc, ...flatten(child, prefix ? `${prefix}.${key}` : key) }),
            {},
        );
    }
    return {};
};

const wordList = (terms: string[]): RegExp => new RegExp(`(?<!\\p{L})(${terms.join('|')})(?!\\p{L})`, 'iu');

const INFORMAL_ADDRESS = wordList(['du', 'dich', 'dir', 'dein', 'deine', 'deinen', 'deinem', 'deiner', 'deines']);

const INFORMAL_IMPERATIVE = wordList([
    'Sende',
    'Klicke',
    'Wähle',
    'Nutze',
    'Behalte',
    'Verfolge',
    'Erweitere',
    'Lass',
    'Sieh',
    'Schau',
    'Aktiviere',
    'Starte',
    'Baue',
    'Gib',
    'Klappe',
    'Verbessere',
    'Erhöhe',
    'Senke',
    'Steigere',
    'Hab',
    'Sorge',
    'Plane',
    'Arbeite',
    'Beginne',
    'Experimentiere',
    'Erforsche',
    'Kaufe',
    'Verkaufe',
    'Reinvestiere',
    'Verwalte',
    'Zahle',
    'Warte',
    'Öffne',
    'Sortiere',
    'Kopiere',
    'Bestätige',
    'Deaktiviere',
    'Vergleiche',
    'Prüfe',
    'Melde',
    'Setze',
    'Lade',
    'Registriere',
    'Entferne',
]);

const RETIRED_TERMS = wordList([
    'Skalierung',
    'Einsätze',
    'Listung',
    'Nettoeinkommen',
    'Kassenbestand',
    'Kassabestand',
    'Nettofinanzposition',
    'Betriebsgröße',
    'Zwangsverwaltung',
    'bankrott',
    'Anhaltung',
    'Produktauflösung',
    'Umpositionierung',
    'Leerlauf',
    'Ausgaben',
    'Einnahmen',
    'Landanspruch',
    'Landansprüche',
    'Anspruch',
    'Bankkapital',
]);

const RETIRED_STEMS = /gelistet|Arbeitskr|Dienstleistungenn|VerwaltungsDienst|LogistikDienst|WartungsDienst/;

describe('German message style', () => {
    it('addresses the player formally with Sie', () => {
        const offenders = Object.entries(flatten(de))
            .filter(([, value]) => INFORMAL_ADDRESS.test(value))
            .map(([key]) => key);

        expect(offenders).toEqual([]);
    });

    it('uses the reviewed terminology instead of literal translations', () => {
        const offenders = Object.entries(flatten(de))
            .filter(([, value]) => RETIRED_TERMS.test(value) || RETIRED_STEMS.test(value))
            .map(([key]) => key);

        expect(offenders).toEqual([]);
    });

    it('does not use informal imperative forms', () => {
        const offenders = Object.entries(flatten(de))
            .filter(([, value]) => INFORMAL_IMPERATIVE.test(value))
            .map(([key]) => key);

        expect(offenders).toEqual([]);
    });

    it('recognises the guarded wording regardless of leading umlauts or case', () => {
        expect(INFORMAL_IMPERATIVE.test('Öffne den Markt')).toBe(true);
        expect(INFORMAL_IMPERATIVE.test('Bitte öffne den Markt')).toBe(true);
        expect(INFORMAL_ADDRESS.test('Du hast bereits ein Unternehmen')).toBe(true);
        expect(RETIRED_STEMS.test('Arbeitskräfte betreiben Ihre Anlagen')).toBe(true);
        expect(INFORMAL_IMPERATIVE.test('Lassen Sie uns einkaufen')).toBe(false);
        expect(INFORMAL_ADDRESS.test('Das Duell läuft')).toBe(false);
        expect(RETIRED_STEMS.test('Viel Arbeit wartet')).toBe(false);
    });
});
