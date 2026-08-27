import { describe, expect, it } from 'vitest';

import { buildRefoundName, nextRefoundName, parseRefoundName, refoundId, REFOUND_SYMBOL } from './refound';

describe('parseRefoundName', () => {
    it('returns the whole name with number 0 when no refound marker is present', () => {
        expect(parseRefoundName('Acme Corp')).toEqual({ base: 'Acme Corp', refoundNumber: 0 });
    });

    it('parses base and refound number', () => {
        expect(parseRefoundName(`Acme Corp ${REFOUND_SYMBOL}2`)).toEqual({ base: 'Acme Corp', refoundNumber: 2 });
    });

    it('treats a bare symbol without a number as part of the base', () => {
        expect(parseRefoundName(`Acme ${REFOUND_SYMBOL}`)).toEqual({
            base: `Acme ${REFOUND_SYMBOL}`,
            refoundNumber: 0,
        });
    });

    it('treats a symbol with a non-numeric suffix as part of the base', () => {
        expect(parseRefoundName(`Acme ${REFOUND_SYMBOL}Co`)).toEqual({
            base: `Acme ${REFOUND_SYMBOL}Co`,
            refoundNumber: 0,
        });
    });
});

describe('buildRefoundName', () => {
    it('assembles base, symbol and number', () => {
        expect(buildRefoundName('Acme Corp', 2)).toBe(`Acme Corp ${REFOUND_SYMBOL}2`);
    });
});

describe('nextRefoundName', () => {
    it('starts at number 1 for a fresh base', () => {
        expect(nextRefoundName('Acme Corp')).toBe(`Acme Corp ${REFOUND_SYMBOL}1`);
    });

    it('increments the refound number', () => {
        expect(nextRefoundName(`Acme Corp ${REFOUND_SYMBOL}3`)).toBe(`Acme Corp ${REFOUND_SYMBOL}4`);
    });

    it('keeps the base stable across repeated refounds', () => {
        const base = 'Acme Corp';
        let name = base;
        for (let i = 1; i <= 5; i++) {
            name = nextRefoundName(name);
            expect(name).toBe(`${base} ${REFOUND_SYMBOL}${i}`);
        }
    });
});

describe('refoundId', () => {
    it('uses the slugified base name and the game year of the refound', () => {
        expect(refoundId('Acme Corp', 1)).toBe('acme-corp_lastRefounded_2200');
        expect(refoundId(`Acme Corp ${REFOUND_SYMBOL}3`, 361)).toBe('acme-corp_lastRefounded_2201');
    });

    it('ignores the refound number when building the id', () => {
        expect(refoundId(`Acme Corp ${REFOUND_SYMBOL}7`, 721)).toBe('acme-corp_lastRefounded_2202');
    });
});
