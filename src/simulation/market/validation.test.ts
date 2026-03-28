import { describe, expect, it } from 'vitest';
import { validateSellOffer, validateBuyBid } from './validation';
import { agriculturalProductResourceType, clothingResourceType, coalResourceType } from '../planet/resources';

describe('market validation', () => {
    describe('validateSellOffer', () => {
        const foodResource = agriculturalProductResourceType;
        const clothingResource = clothingResourceType;

        it('returns valid for a normal sell offer', () => {
            const result = validateSellOffer(1.5, 100, foodResource, 200);
            expect(result.isValid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('returns invalid for price 0', () => {
            const result = validateSellOffer(0, 100, foodResource, 200);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Price must be greater than 0');
        });

        it('returns invalid for negative price', () => {
            const result = validateSellOffer(-1, 100, foodResource, 200);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Price must be greater than 0');
        });

        it('returns invalid for quantity exceeding inventory', () => {
            const result = validateSellOffer(1.5, 300, foodResource, 200);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Quantity exceeds available stock');
        });

        it('returns invalid for negative quantity', () => {
            const result = validateSellOffer(1.5, -10, foodResource, 200);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Quantity must be non-negative');
        });

        it('returns valid for pieces resource with integer quantity', () => {
            const result = validateSellOffer(10, 5, clothingResource, 10);
            expect(result.isValid).toBe(true);
        });

        it('returns valid for pieces resource with fractional quantity', () => {
            const result = validateSellOffer(10, 5.5, clothingResource, 10);
            expect(result.isValid).toBe(true);
        });

        it('returns valid when price is undefined but quantity is defined', () => {
            const result = validateSellOffer(undefined, 100, foodResource, 200);
            expect(result.isValid).toBe(true);
        });

        it('returns valid when quantity is undefined but price is defined', () => {
            const result = validateSellOffer(1.5, undefined, foodResource, 200);
            expect(result.isValid).toBe(true);
        });

        it('returns valid when both price and quantity are undefined', () => {
            const result = validateSellOffer(undefined, undefined, foodResource, 200);
            expect(result.isValid).toBe(true);
        });
    });

    describe('validateBuyBid', () => {
        const coalResource = coalResourceType;
        const clothingResource = clothingResourceType;

        it('returns valid for a normal buy bid', () => {
            const result = validateBuyBid(2.0, 100, coalResource, 1000);
            expect(result.isValid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('returns invalid for price 0', () => {
            const result = validateBuyBid(0, 100, coalResource, 1000);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Price must be greater than 0');
        });

        it('returns invalid for negative price', () => {
            const result = validateBuyBid(-1, 100, coalResource, 1000);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Price must be greater than 0');
        });

        it('returns invalid for negative quantity', () => {
            const result = validateBuyBid(2.0, -10, coalResource, 1000);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Quantity must be non-negative');
        });

        it('returns invalid when cost exceeds deposits', () => {
            const result = validateBuyBid(2.0, 600, coalResource, 1000);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Insufficient deposits');
        });

        it('returns valid for pieces resource with integer quantity', () => {
            const result = validateBuyBid(10, 5, clothingResource, 1000);
            expect(result.isValid).toBe(true);
        });

        it('returns valid for pieces resource with fractional quantity', () => {
            const result = validateBuyBid(10, 5.5, clothingResource, 1000);
            expect(result.isValid).toBe(true);
        });

        it('returns valid when price is undefined but quantity is defined', () => {
            const result = validateBuyBid(undefined, 100, coalResource, 1000);
            expect(result.isValid).toBe(true);
        });

        it('returns valid when quantity is undefined but price is defined', () => {
            const result = validateBuyBid(2.0, undefined, coalResource, 1000);
            expect(result.isValid).toBe(true);
        });

        it('returns valid when both price and quantity are undefined', () => {
            const result = validateBuyBid(undefined, undefined, coalResource, 1000);
            expect(result.isValid).toBe(true);
        });

        it('returns valid when quantity is 0', () => {
            const result = validateBuyBid(2.0, 0, coalResource, 1000);
            expect(result.isValid).toBe(true);
        });
    });
});
