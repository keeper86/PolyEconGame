import { describe, it, expect } from 'vitest';
import { TRADABLE_RESOURCES } from '../planet/resourceCatalog';
import { initialMarketPrices } from './initialMarketPrices';

describe('initialMarketPrices', () => {
    it('has an entry for every resource in TRADABLE_RESOURCES', () => {
        const missing = TRADABLE_RESOURCES.filter((r) => initialMarketPrices[r.name] === undefined).map((r) => r.name);
        expect(missing).toEqual([]);
    });

    it('has no entries for resources not in TRADABLE_RESOURCES', () => {
        const knownNames = new Set(TRADABLE_RESOURCES.map((r) => r.name));
        const unknown = Object.keys(initialMarketPrices).filter((name) => !knownNames.has(name));
        expect(unknown).toEqual([]);
    });
});
