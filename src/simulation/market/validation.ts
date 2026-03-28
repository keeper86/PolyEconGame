import { FOOD_PRICE_FLOOR as PRICE_FLOOR, FOOD_PRICE_CEIL as PRICE_CEIL, EPSILON } from '../constants';
import type { Resource, AgentPlanetAssets, AgentMarketOfferState, AgentMarketBidState } from '../planet/planet';
import { getAvailableStorageCapacity, queryStorageFacility } from '../planet/storage';
import type { BuyBid } from '../../server/controller/user';

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
    bid: BuyBid,
    resource: Resource,
    assets: Pick<AgentPlanetAssets, 'storageFacility' | 'deposits'>,
): ValidationResult {
    const { bidPrice, bidStorageTarget, bidQuantity } = bid;
    const availableStorageCapacity = getAvailableStorageCapacity(assets.storageFacility, resource);
    const currentInventory = queryStorageFacility(assets.storageFacility, resource.name);
    const quantity = bidStorageTarget !== undefined ? Math.max(0, bidStorageTarget - currentInventory) : bidQuantity;

    // If both are undefined, nothing to validate
    if (bidPrice === undefined && quantity === undefined) {
        return { isValid: true };
    }

    // Price validation (only if provided)
    if (bidPrice !== undefined) {
        if (isNaN(bidPrice)) {
            return { isValid: false, error: 'Price must be a valid number' };
        }

        if (bidPrice <= 0) {
            return { isValid: false, error: 'Price must be greater than 0' };
        }

        if (bidPrice < PRICE_FLOOR) {
            return { isValid: false, error: `Price must be at least ${PRICE_FLOOR}` };
        }

        if (bidPrice > PRICE_CEIL) {
            return { isValid: false, error: `Price must not exceed ${PRICE_CEIL}` };
        }
    }

    // Quantity validation (only if provided)
    if (quantity !== undefined) {
        if (isNaN(quantity)) {
            return { isValid: false, error: 'Quantity must be a valid number' };
        }

        if (quantity < 0) {
            return { isValid: false, error: 'Quantity must be non-negative' };
        }

        if (quantity > 0 && quantity < EPSILON) {
            return { isValid: false, error: 'Quantity is too small' };
        }

        if (quantity > availableStorageCapacity + EPSILON) {
            return {
                isValid: false,
                error: `Quantity exceeds available storage capacity (${availableStorageCapacity.toFixed(2)})`,
            };
        }
    }

    // Check if agent can afford the bid (only if both price and quantity are provided)
    if (bidPrice !== undefined && quantity !== undefined) {
        const maxCost = quantity * bidPrice;
        if (maxCost > assets.deposits + EPSILON) {
            return {
                isValid: false,
                error: `Insufficient deposits (need ${maxCost.toFixed(2)}, have ${assets.deposits.toFixed(2)})`,
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

/**
 * Validates and prepares a sell offer for order collection.
 * Returns validated and clamped price & quantity, or null if the offer is invalid.
 * Logs warnings for invalid offers.
 */
export function validateAndPrepareSellOffer(
    offer: AgentMarketOfferState,
    availableStock: number,
): { price: number; quantity: number } | null {
    // Calculate effective quantity based on retainment if set
    const effectiveQuantity = offer.offerRetainment !== undefined
        ? Math.max(0, availableStock - offer.offerRetainment)
        : (offer.offerQuantity ?? 0);

    // Validate the offer
    const validation = validateSellOffer(
        offer.offerPrice,
        effectiveQuantity,
        offer.resource,
        availableStock
    );
    
    if (!validation.isValid) {
        console.warn(`Invalid sell offer for ${offer.resource.name}: ${validation.error}`);
        return null;
    }

    // If price is undefined, we can't create an order
    if (offer.offerPrice === undefined) {
        console.warn(`Sell offer for ${offer.resource.name} has no price`);
        return null;
    }

    // If quantity is zero or negative after validation, skip
    if (effectiveQuantity <= 0) {
        return null;
    }

    return {
        price: clampPrice(offer.offerPrice),
        quantity: effectiveQuantity
    };
}

/**
 * Validates and prepares a buy bid for order collection.
 * Returns validated and clamped price & quantity, or null if the bid is invalid.
 * Logs warnings for invalid bids.
 */
export function validateAndPrepareBuyBid(
    bid: AgentMarketBidState,
    assets: Pick<AgentPlanetAssets, 'storageFacility' | 'deposits'>,
    currentInventory: number,
): { price: number; quantity: number; maxCost: number } | null {
    // Calculate effective quantity based on storage target if set
    const effectiveQuantity = bid.bidStorageTarget !== undefined
        ? Math.max(0, bid.bidStorageTarget - currentInventory)
        : (bid.bidQuantity ?? 0);

    // Cap by available storage capacity
    const availableStorageCapacity = getAvailableStorageCapacity(assets.storageFacility, bid.resource);
    const cappedQuantity = Math.min(effectiveQuantity, availableStorageCapacity);

    // Use validatedBidQuantity to ensure non-negative
    const validatedQuantity = validatedBidQuantity(cappedQuantity, bid.resource.form);
    
    // Use default price if not set
    const price = bid.bidPrice !== undefined ? bid.bidPrice : 0;
    
    // Validate the bid
    const validation = validateBuyBid(
        { bidPrice: price, bidQuantity: validatedQuantity },
        bid.resource,
        assets
    );
    
    if (!validation.isValid) {
        console.warn(`Invalid buy bid for ${bid.resource.name}: ${validation.error}`);
        return null;
    }

    // If price is 0 or undefined after validation, we can't create an order
    if (price <= 0) {
        console.warn(`Buy bid for ${bid.resource.name} has invalid price: ${price}`);
        return null;
    }

    // If quantity is zero after validation, skip
    if (validatedQuantity <= 0) {
        return null;
    }

    const maxCost = validatedQuantity * price;
    
    return {
        price: clampPrice(price),
        quantity: validatedQuantity,
        maxCost
    };
}
