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

const INFORMAL_ADDRESS = /\b(du|dich|dir|dein|deine|deinen|deinem|deiner|deines)\b/i;

const INFORMAL_IMPERATIVE =
    /\b(Sende|Klicke|Wähle|Nutze|Behalte|Verfolge|Erweitere|Lass|Sieh|Schau|Aktiviere|Starte|Baue|Gib|Klappe|Verbessere|Erhöhe|Senke|Steigere|Hab|Sorge|Plane|Arbeite|Beginne|Experimentiere|Erforsche|Kaufe|Verkaufe|Reinvestiere|Verwalte|Zahle|Warte|Öffne|Sortiere|Kopiere|Bestätige|Deaktiviere|Vergleiche|Prüfe|Melde|Setze|Lade|Registriere|Entferne)\b/;

const RETIRED_TERMS =
    /\bSkalierung\b|\bEinsätze\b|\bListung\b|gelistet|\bNettoeinkommen\b|\bKassenbestand\b|\bKassabestand\b|\bNettoposition\b|\bZwangsverwaltung\b|\bbankrott\b|\bAnhaltung\b|\bProduktauflösung\b|\bUmpositionierung\b|\bLeerlauf\b|\bAusgaben\b|\bLandansprüche?\b|\bAnspruch\b|\bBankkapital\b|Dienstleistungenn|VerwaltungsDienst|LogistikDienst|WartungsDienst/;

describe('German message style', () => {
    it('addresses the player formally with Sie', () => {
        const offenders = Object.entries(flatten(de))
            .filter(([, value]) => INFORMAL_ADDRESS.test(value))
            .map(([key]) => key);

        expect(offenders).toEqual([]);
    });

    it('uses the reviewed terminology instead of literal translations', () => {
        const offenders = Object.entries(flatten(de))
            .filter(([, value]) => RETIRED_TERMS.test(value))
            .map(([key]) => key);

        expect(offenders).toEqual([]);
    });

    it('does not use informal imperative forms', () => {
        const offenders = Object.entries(flatten(de))
            .filter(([, value]) => INFORMAL_IMPERATIVE.test(value))
            .map(([key]) => key);

        expect(offenders).toEqual([]);
    });
});
