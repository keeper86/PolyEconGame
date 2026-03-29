import { describe, expect, it } from 'vitest';
import { clothingResourceType, coalResourceType } from '../planet/resources';
import type { StorageFacility } from '../planet/storage';
import { validateBuyBid, validateSellOffer } from './validation';

/**
 * Builds a minimal assets object for validateBuyBid tests.
 * volumeCapacity / massCapacity control what getAvailableStorageCapacity returns.
 * Coal: volumePerQuantity=0.7, massPerQuantity=1 → capacity(50) needs volume=35, mass=50.
 */
function makeAssets(deposits: number, volumeCapacity = 1e9, massCapacity = 1e9) {
    return {
        deposits,
        storageFacility: {
            scale: 1,
            capacity: { volume: volumeCapacity, mass: massCapacity },
            current: { volume: 0, mass: 0 },
            currentInStorage: {},
            escrow: {},
        } as unknown as StorageFacility,
    };
}

describe('market validation', () => {
    describe('validateSellOffer', () => {
        it('returns valid for a normal sell offer', () => {
            const result = validateSellOffer(1.5, 100, 200);
            expect(result.isValid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('returns invalid for price 0', () => {
            const result = validateSellOffer(0, 100, 200);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Price must be greater than 0');
        });

        it('returns invalid for negative price', () => {
            const result = validateSellOffer(-1, 100, 200);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Price must be greater than 0');
        });

        it('returns invalid for quantity exceeding inventory', () => {
            const result = validateSellOffer(1.5, 300, 200);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Quantity exceeds available stock');
        });

        it('returns invalid for negative quantity', () => {
            const result = validateSellOffer(1.5, -10, 200);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Quantity must be non-negative');
        });

        it('returns valid for pieces resource with integer quantity', () => {
            const result = validateSellOffer(10, 5, 10);
            expect(result.isValid).toBe(true);
        });

        it('returns valid for pieces resource with fractional quantity', () => {
            const result = validateSellOffer(10, 5.5, 10);
            expect(result.isValid).toBe(true);
        });

        it('returns valid when price is undefined but quantity is defined', () => {
            const result = validateSellOffer(undefined, 100, 200);
            expect(result.isValid).toBe(true);
        });

        it('returns valid when quantity is undefined but price is defined', () => {
            const result = validateSellOffer(1.5, undefined, 200);
            expect(result.isValid).toBe(true);
        });

        it('returns valid when both price and quantity are undefined', () => {
            const result = validateSellOffer(undefined, undefined, 200);
            expect(result.isValid).toBe(true);
        });
    });

    describe('validateBuyBid', () => {
        const coalResource = coalResourceType;
        const clothingResource = clothingResourceType;

        it('returns valid for a normal buy bid', () => {
            const result = validateBuyBid({ bidPrice: 2.0, bidStorageTarget: 100 }, coalResource, makeAssets(1000));
            expect(result.isValid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('returns invalid for price 0', () => {
            const result = validateBuyBid({ bidPrice: 0, bidStorageTarget: 100 }, coalResource, makeAssets(1000));
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Price must be greater than 0');
        });

        it('returns invalid for negative price', () => {
            const result = validateBuyBid({ bidPrice: -1, bidStorageTarget: 100 }, coalResource, makeAssets(1000));
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Price must be greater than 0');
        });

        it('returns invalid for negative quantity', () => {
            const result = validateBuyBid({ bidPrice: 2.0, bidStorageTarget: -10 }, coalResource, makeAssets(1000));
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Quantity must be non-negative');
        });

        it('returns invalid when cost exceeds deposits', () => {
            const result = validateBuyBid({ bidPrice: 2.0, bidStorageTarget: 600 }, coalResource, makeAssets(1000));
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Insufficient deposits');
        });

        it('returns valid for pieces resource with integer quantity', () => {
            const result = validateBuyBid({ bidPrice: 10, bidStorageTarget: 5 }, clothingResource, makeAssets(1000));
            expect(result.isValid).toBe(true);
        });

        it('returns valid for pieces resource with fractional quantity', () => {
            const result = validateBuyBid({ bidPrice: 10, bidStorageTarget: 5.5 }, clothingResource, makeAssets(1000));
            expect(result.isValid).toBe(true);
        });

        it('returns valid when price is undefined but quantity is defined', () => {
            const result = validateBuyBid({ bidStorageTarget: 100 }, coalResource, makeAssets(1000));
            expect(result.isValid).toBe(true);
        });

        it('returns valid when quantity is undefined but price is defined', () => {
            const result = validateBuyBid({ bidPrice: 2.0 }, coalResource, makeAssets(1000));
            expect(result.isValid).toBe(true);
        });

        it('returns valid when both price and quantity are undefined', () => {
            const result = validateBuyBid({}, coalResource, makeAssets(1000));
            expect(result.isValid).toBe(true);
        });

        it('returns valid when quantity is 0', () => {
            const result = validateBuyBid({ bidPrice: 2.0, bidStorageTarget: 0 }, coalResource, makeAssets(1000));
            expect(result.isValid).toBe(true);
        });

        it('returns invalid when quantity exceeds available storage capacity', () => {
            // Coal: volumePerQuantity=0.7 → volume=35 gives capacity 50; massPerQuantity=1 → mass=50 gives capacity 50
            const result = validateBuyBid(
                { bidPrice: 2.0, bidStorageTarget: 100 },
                coalResource,
                makeAssets(1000, 35, 50),
            );
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Quantity exceeds available storage capacity');
        });

        it('returns valid when quantity equals available storage capacity', () => {
            const result = validateBuyBid(
                { bidPrice: 2.0, bidStorageTarget: 50 },
                coalResource,
                makeAssets(1000, 35, 50),
            );
            expect(result.isValid).toBe(true);
        });

        it('returns valid when storage capacity is unlimited', () => {
            const result = validateBuyBid({ bidPrice: 2.0, bidStorageTarget: 100 }, coalResource, makeAssets(200));
            expect(result.isValid).toBe(true);
        });

        it('resolves effectiveQty from bidStorageTarget minus current inventory', () => {
            // inventory=0, storageTarget=100 → effectiveQty=100, cost=200 > deposits=150 → invalid
            const result = validateBuyBid({ bidPrice: 2.0, bidStorageTarget: 100 }, coalResource, makeAssets(150));
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Insufficient deposits');
        });

        it('returns valid when storageTarget already met by inventory', () => {
            // inventory=0, storageTarget=0 → effectiveQty=0 → cost=0 → valid
            const result = validateBuyBid({ bidPrice: 2.0, bidStorageTarget: 0 }, coalResource, makeAssets(150));
            expect(result.isValid).toBe(true);
        });
    });
});
