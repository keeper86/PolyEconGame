import { FOOD_PRICE_FLOOR as PRICE_FLOOR, FOOD_PRICE_CEIL as PRICE_CEIL, EPSILON } from '../constants';
import type { Resource } from '../planet/planet';

/**
 * Shared validation functions for market offers and bids.
 * This provides a single source of truth for validation logic
 * that can be used both in the frontend (for immediate user feedback)
 * and in the backend (for rejecting invalid offers).
 */

export interface ValidationResult {
    isValid: boolean;
    error?: string;
}

/**
 * Validates a sell offer price and quantity.
 * Returns validation result with error message if invalid.
 * If price or quantity is undefined, it's considered valid (user might be changing only one field).
 */
export function validateSellOffer(
    price: number | undefined,
    quantity: number | undefined,
    resource: Resource,
    availableStock: number,
): ValidationResult {
    // If both are undefined, nothing to validate
    if (price === undefined && quantity === undefined) {
        return { isValid: true };
    }

    // Price validation (only if provided)
    if (price !== undefined) {
        if (price <= 0) {
            return { isValid: false, error: 'Price must be greater than 0' };
        }

        if (price < PRICE_FLOOR) {
            return { isValid: false, error: `Price must be at least ${PRICE_FLOOR}` };
        }

        if (price > PRICE_CEIL) {
            return { isValid: false, error: `Price must not exceed ${PRICE_CEIL}` };
        }
    }

    // Quantity validation (only if provided)
    if (quantity !== undefined) {
        if (quantity < 0) {
            return { isValid: false, error: 'Quantity must be non-negative' };
        }

        if (quantity > 0 && quantity < EPSILON) {
            return { isValid: false, error: 'Quantity is too small' };
        }

        // Check against available stock
        if (quantity > availableStock + EPSILON) {
            return { isValid: false, error: `Quantity exceeds available stock (${availableStock.toFixed(2)})` };
        }
    }

    return { isValid: true };
}

/**
 * Validates a buy bid price and quantity.
 * Returns validation result with error message if invalid.
 * If price or quantity is undefined, it's considered valid (user might be changing only one field).
 */
export function validateBuyBid(
    price: number | undefined,
    quantity: number | undefined,
    resource: Resource,
    availableDeposits: number,
): ValidationResult {
    // If both are undefined, nothing to validate
    if (price === undefined && quantity === undefined) {
        return { isValid: true };
    }

    // Price validation (only if provided)
    if (price !== undefined) {
        if (price <= 0) {
            return { isValid: false, error: 'Price must be greater than 0' };
        }

        if (price < PRICE_FLOOR) {
            return { isValid: false, error: `Price must be at least ${PRICE_FLOOR}` };
        }

        if (price > PRICE_CEIL) {
            return { isValid: false, error: `Price must not exceed ${PRICE_CEIL}` };
        }
    }

    // Quantity validation (only if provided)
    if (quantity !== undefined) {
        if (quantity < 0) {
            return { isValid: false, error: 'Quantity must be non-negative' };
        }

        if (quantity > 0 && quantity < EPSILON) {
            return { isValid: false, error: 'Quantity is too small' };
        }
    }

    // Check if agent can afford the bid (only if both price and quantity are provided)
    if (price !== undefined && quantity !== undefined) {
        const maxCost = quantity * price;
        if (maxCost > availableDeposits + EPSILON) {
            return {
                isValid: false,
                error: `Insufficient deposits (need ${maxCost.toFixed(2)}, have ${availableDeposits.toFixed(2)})`,
            };
        }
    }

    return { isValid: true };
}

/**
 * Clamps a price to the valid range [PRICE_FLOOR, PRICE_CEIL].
 * Used in the market clearing process.
 */
export function clampPrice(price: number): number {
    return Math.max(PRICE_FLOOR, Math.min(PRICE_CEIL, price));
}

/**
 * Clamps a quantity to non-negative. Used in the market clearing process.
 */
export function validatedBidQuantity(qty: number, _form: string): number {
    if (qty <= 0) {
        return 0;
    }
    return qty;
}
