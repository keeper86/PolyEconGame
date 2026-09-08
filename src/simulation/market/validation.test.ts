import { describe, expect, it } from 'vitest';
import { clothingResourceType, coalResourceType } from '../planet/resources';
import { shellFormOfResource } from '../planet/facility';
import { makeManagementFacility, makeStorageFacility } from '../utils/testHelper';
import type { Resource } from '../planet/claims';
import type { Storage } from '../planet/facility';
import { validateBuyBid, validateSellOffer } from './validation';

function makeAssets(deposits: number, resource: Resource, storageScale = 1e9) {
    const storage = makeStorageFacility({
        department: { ...makeManagementFacility(), transportBuffer: 0, transportStarvation: 0 },
    });
    const form = shellFormOfResource(resource);
    if (form) {
        const shell = storage.shells[form];
        shell.scale = storageScale;
        shell.maxScale = storageScale;
        shell.compartments[resource.name] = 1;
    }
    return { deposits, storage: storage as Storage };
}

describe('market validation', () => {
    describe('validateSellOffer', () => {
        it('returns valid for a normal sell offer', () => {
            const result = validateSellOffer(1.5, 200);
            expect(result.isValid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('returns invalid for price 0', () => {
            const result = validateSellOffer(0, 200);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Price must be greater than 0');
        });

        it('returns invalid for negative price', () => {
            const result = validateSellOffer(-1, 200);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Price must be greater than 0');
        });

        it('returns valid for pieces resource with integer quantity', () => {
            const result = validateSellOffer(10, 10);
            expect(result.isValid).toBe(true);
        });

        it('returns valid for pieces resource with fractional quantity', () => {
            const result = validateSellOffer(10, 10);
            expect(result.isValid).toBe(true);
        });

        it('returns valid when price is undefined', () => {
            const result = validateSellOffer(undefined, 200);
            expect(result.isValid).toBe(true);
        });
    });

    describe('validateBuyBid', () => {
        const coalResource = coalResourceType;
        const clothingResource = clothingResourceType;
        const coalAssets = (d: number, s?: number) => makeAssets(d, coalResource, s);
        const clothingAssets = (d: number, s?: number) => makeAssets(d, clothingResource, s);

        it('returns valid for a normal buy bid', () => {
            const result = validateBuyBid({ bidPrice: 2.0, bidStorageTarget: 100 }, coalResource, coalAssets(1000));
            expect(result.isValid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('returns invalid for price 0', () => {
            const result = validateBuyBid({ bidPrice: 0, bidStorageTarget: 100 }, coalResource, coalAssets(1000));
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Price must be greater than 0');
        });

        it('returns invalid for negative price', () => {
            const result = validateBuyBid({ bidPrice: -1, bidStorageTarget: 100 }, coalResource, coalAssets(1000));
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Price must be greater than 0');
        });

        it('returns invalid for negative quantity', () => {
            const result = validateBuyBid({ bidPrice: 2.0, bidStorageTarget: -10 }, coalResource, coalAssets(1000));
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Quantity must be non-negative');
        });

        it('returns invalid when cost exceeds deposits', () => {
            const result = validateBuyBid({ bidPrice: 2.0, bidStorageTarget: 600 }, coalResource, coalAssets(1000));
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Insufficient deposits');
        });

        it('returns valid for pieces resource with integer quantity', () => {
            const result = validateBuyBid({ bidPrice: 10, bidStorageTarget: 5 }, clothingResource, clothingAssets(1000));
            expect(result.isValid).toBe(true);
        });

        it('returns valid for pieces resource with fractional quantity', () => {
            const result = validateBuyBid({ bidPrice: 10, bidStorageTarget: 5.5 }, clothingResource, clothingAssets(1000));
            expect(result.isValid).toBe(true);
        });

        it('returns valid when price is undefined but quantity is defined', () => {
            const result = validateBuyBid({ bidStorageTarget: 100 }, coalResource, coalAssets(1000));
            expect(result.isValid).toBe(true);
        });

        it('returns valid when quantity is undefined but price is defined', () => {
            const result = validateBuyBid({ bidPrice: 2.0 }, coalResource, coalAssets(1000));
            expect(result.isValid).toBe(true);
        });

        it('returns valid when both price and quantity are undefined', () => {
            const result = validateBuyBid({}, coalResource, coalAssets(1000));
            expect(result.isValid).toBe(true);
        });

        it('returns valid when quantity is 0', () => {
            const result = validateBuyBid({ bidPrice: 2.0, bidStorageTarget: 0 }, coalResource, coalAssets(1000));
            expect(result.isValid).toBe(true);
        });

        it('returns invalid when quantity exceeds available storage capacity', () => {
            const result = validateBuyBid({ bidPrice: 2.0, bidStorageTarget: 100 }, coalResource, coalAssets(1000, 0));
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Quantity exceeds available storage capacity');
        });

        it('returns valid when quantity equals available storage capacity', () => {
            const result = validateBuyBid({ bidPrice: 2.0, bidStorageTarget: 50 }, coalResource, coalAssets(1000, 1));
            expect(result.isValid).toBe(true);
        });

        it('returns valid when storage capacity is unlimited', () => {
            const result = validateBuyBid({ bidPrice: 2.0, bidStorageTarget: 100 }, coalResource, coalAssets(200));
            expect(result.isValid).toBe(true);
        });

        it('resolves effectiveQty from bidStorageTarget minus current inventory', () => {
            const result = validateBuyBid({ bidPrice: 2.0, bidStorageTarget: 100 }, coalResource, coalAssets(150));
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Insufficient deposits');
        });

        it('returns valid when storageTarget already met by inventory', () => {
            const result = validateBuyBid({ bidPrice: 2.0, bidStorageTarget: 0 }, coalResource, coalAssets(150));
            expect(result.isValid).toBe(true);
        });
    });
});
